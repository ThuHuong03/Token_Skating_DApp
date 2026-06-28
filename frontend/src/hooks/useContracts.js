import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import stakingAbi from "../abi/EthStaking.json";
import { CONTRACTS } from "../config/contracts";

const ZERO = 0n;
const REWARD_PRECISION = 10n ** 18n;
const AUTO_REFRESH_MS = 30_000;
const REWARD_TICK_MS = 30_000;
const ADMIN_ACTIVITY_LOOKBACK_BLOCKS = 1_000;
const ADMIN_ACTIVITY_CHUNK_BLOCKS = 9;
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const PRICE_FEED_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];
const PROTOCOL_FEE_ABI = [
  "function protocolFees() view returns (uint256)",
  "function claimFeeBps() view returns (uint256)",
  "function emergencyWithdrawFeeBps() view returns (uint256)",
  "function setClaimFeeBps(uint256)",
  "function setEmergencyWithdrawFeeBps(uint256)",
  "function withdrawProtocolFees(uint256)",
];
const SNAPSHOT_CLAIM_INTERFACE = new ethers.Interface(["function claimReward(uint256 amount)"]);
const LEGACY_CLAIM_ABI = ["function claimReward()"];
const ACTIVITY_EVENT_INTERFACE = new ethers.Interface([
  "event Staked(address indexed user, uint256 amount)",
  "event Unstaked(address indexed user, uint256 amount)",
  "event RewardClaimed(address indexed user, uint256 amount)",
  "event EmergencyWithdrawn(address indexed user, uint256 amount)",
  "event RewardPoolFunded(address indexed admin, uint256 amount)",
  "event RewardRateUpdated(uint256 oldRate, uint256 newRate)",
  "event LockPeriodUpdated(uint256 oldLockPeriod, uint256 newLockPeriod)",
  "event ClaimFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps)",
  "event EmergencyWithdrawFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps)",
  "event ProtocolFeeCollected(address indexed user, string actionType, uint256 feeAmount)",
  "event ProtocolFeesWithdrawn(address indexed admin, uint256 amount)",
  "event Paused(address account)",
  "event Unpaused(address account)",
]);
const ADMIN_ACTIVITY_EVENTS = [
  { eventName: "Staked", type: "stake", label: "User staked", actorArg: "user", amountArg: "amount" },
  { eventName: "Unstaked", type: "unstake", label: "User unstaked", actorArg: "user", amountArg: "amount" },
  { eventName: "RewardClaimed", type: "claim", label: "User claimed reward", actorArg: "user", amountArg: "amount" },
  {
    eventName: "EmergencyWithdrawn",
    type: "emergencyWithdraw",
    label: "User emergency withdrew",
    actorArg: "user",
    amountArg: "amount",
  },
  {
    eventName: "RewardPoolFunded",
    type: "fundRewardPool",
    label: "Admin funded reward pool",
    actorArg: "admin",
    amountArg: "amount",
  },
  {
    eventName: "RewardRateUpdated",
    type: "setRewardRate",
    label: "Admin updated reward rate",
    amountArg: "newRate",
  },
  {
    eventName: "LockPeriodUpdated",
    type: "setLockPeriod",
    label: "Admin updated lock period",
    amountArg: "newLockPeriod",
  },
  { eventName: "ClaimFeeUpdated", type: "setClaimFee", label: "Admin updated claim fee", amountArg: "newFeeBps" },
  {
    eventName: "EmergencyWithdrawFeeUpdated",
    type: "setEmergencyWithdrawFee",
    label: "Admin updated emergency fee",
    amountArg: "newFeeBps",
  },
  {
    eventName: "ProtocolFeeCollected",
    type: "protocolFeeCollected",
    label: "Protocol fee collected",
    actorArg: "user",
    amountArg: "feeAmount",
  },
  {
    eventName: "ProtocolFeesWithdrawn",
    type: "withdrawProtocolFees",
    label: "Admin withdrew protocol fees",
    actorArg: "admin",
    amountArg: "amount",
  },
  { eventName: "Paused", type: "pause", label: "Admin paused protocol", actorArg: "account" },
  { eventName: "Unpaused", type: "unpause", label: "Admin unpaused protocol", actorArg: "account" },
];

export function useContracts() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState(defaultData());
  const [activity, setActivity] = useState([]);
  const [adminActivity, setAdminActivity] = useState([]);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [isLiveRewardEnabled, setIsLiveRewardEnabled] = useState(true);
  const [rewardNow, setRewardNow] = useState(ZERO);

  const isMetaMaskAvailable = typeof window !== "undefined" && Boolean(window.ethereum);
  const assetSymbol = CONTRACTS.assetSymbol || (CONTRACTS.chainId === SEPOLIA_CHAIN_ID ? "SepoliaETH" : "ETH");

  const staking = useMemo(() => {
    if (!signer) return null;
    return new ethers.Contract(CONTRACTS.stakingAddress, stakingAbi, signer);
  }, [signer]);

  const feeContract = useMemo(() => {
    if (!signer) return null;
    return new ethers.Contract(CONTRACTS.stakingAddress, PROTOCOL_FEE_ABI, signer);
  }, [signer]);

  const connectWallet = useCallback(async () => {
    if (!isMetaMaskAvailable) {
      setError("MetaMask is not installed.");
      return;
    }

    setError("");
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    await browserProvider.send("eth_requestAccounts", []);
    const walletSigner = await browserProvider.getSigner();
    const network = await browserProvider.getNetwork();

    setProvider(browserProvider);
    setSigner(walletSigner);
    setAccount(await walletSigner.getAddress());
    setChainId(Number(network.chainId));
  }, [isMetaMaskAvailable]);

  const refresh = useCallback(async ({ allowRewardReset = false } = {}) => {
    if (!provider || !staking || !account) return;

    const [
      nativeBalance,
      totalStaked,
      rewardPool,
      rewardRate,
      lockPeriod,
      paused,
      owner,
      stakeInfo,
      ethUsdPrice,
      protocolFees,
      claimFeeBps,
      emergencyWithdrawFeeBps,
    ] = await Promise.all([
      provider.getBalance(account),
      staking.totalStaked(),
      staking.rewardPool(),
      staking.rewardRate(),
      staking.lockPeriod(),
      staking.paused(),
      staking.owner(),
      staking.getStakeInfo(account),
      getEthUsdPrice(provider, chainId),
      readOptionalUint(feeContract, "protocolFees"),
      readOptionalUint(feeContract, "claimFeeBps"),
      readOptionalUint(feeContract, "emergencyWithdrawFeeBps"),
    ]);

    const stakedBalance = stakeInfo[0];
    const pendingReward = stakedBalance === ZERO ? ZERO : stakeInfo[1];
    const nextData = {
      nativeBalance,
      ethUsdPrice: ethUsdPrice?.price ?? null,
      ethUsdDecimals: ethUsdPrice?.decimals ?? 0,
      totalStaked,
      rewardPool,
      protocolFees,
      rewardRate,
      lockPeriod,
      claimFeeBps,
      emergencyWithdrawFeeBps,
      paused,
      owner,
      isOwner: owner.toLowerCase() === account.toLowerCase(),
      stakedBalance,
      pendingReward,
      stakeStartTime: Number(stakeInfo[2]),
      unlockTime: Number(stakeInfo[3]),
      lastUpdateTime: Number(stakeInfo[4]),
      syncedAt: Math.floor(Date.now() / 1000),
    };

    setData(nextData);
    setRewardNow((currentReward) => {
      if (allowRewardReset || nextData.stakedBalance === ZERO) {
        return nextData.pendingReward;
      }

      return nextData.pendingReward > currentReward ? nextData.pendingReward : currentReward;
    });
  }, [account, chainId, feeContract, provider, staking]);

  const refreshProtocolStatus = useCallback(async () => {
    if (!staking) return;

    const [paused, rewardPool, rewardRate, lockPeriod, protocolFees, claimFeeBps, emergencyWithdrawFeeBps] =
      await Promise.all([
        staking.paused(),
        staking.rewardPool(),
        staking.rewardRate(),
        staking.lockPeriod(),
        readOptionalUint(feeContract, "protocolFees"),
        readOptionalUint(feeContract, "claimFeeBps"),
        readOptionalUint(feeContract, "emergencyWithdrawFeeBps"),
      ]);

    setData((currentData) => ({
      ...currentData,
      paused,
      rewardPool,
      rewardRate,
      lockPeriod,
      protocolFees,
      claimFeeBps,
      emergencyWithdrawFeeBps,
    }));
  }, [feeContract, staking]);

  const refreshAdminActivity = useCallback(async ({ showStatus = false } = {}) => {
    if (!provider || !staking || chainId !== CONTRACTS.chainId) {
      setAdminActivity([]);
      if (showStatus) {
        setError("Cannot refresh activity. Connect wallet on the expected network first.");
      }
      return;
    }

    try {
      if (showStatus) {
        setError("");
        setStatus("Refreshing protocol activity...");
      }

      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - ADMIN_ACTIVITY_LOOKBACK_BLOCKS);
      const rawLogs = await queryContractLogsInChunks(provider, CONTRACTS.stakingAddress, fromBlock, latestBlock);
      const parsedLogs = rawLogs.flatMap((log) => {
        try {
          const parsedLog = ACTIVITY_EVENT_INTERFACE.parseLog(log);
          const definition = ADMIN_ACTIVITY_EVENTS.find((item) => item.eventName === parsedLog.name);

          return definition ? [{ ...definition, log: { ...log, args: parsedLog.args } }] : [];
        } catch {
          return [];
        }
      });

      const flattenedLogs = parsedLogs.sort((left, right) => {
        if (right.log.blockNumber !== left.log.blockNumber) {
          return right.log.blockNumber - left.log.blockNumber;
        }

        return getLogIndex(right.log) - getLogIndex(left.log);
      }).slice(0, 40);

      const blockNumbers = [...new Set(flattenedLogs.map((item) => item.log.blockNumber))];
      const blockEntries = await Promise.all(
        blockNumbers.map(async (blockNumber) => [blockNumber, await provider.getBlock(blockNumber)])
      );
      const blocksByNumber = new Map(blockEntries);

      const nextActivity = flattenedLogs.map((item) => toAdminActivity(item, blocksByNumber));
      setAdminActivity(nextActivity);

      if (showStatus) {
        setStatus(
          nextActivity.length > 0
            ? `Protocol activity refreshed. Found ${nextActivity.length} recent event(s).`
            : "Protocol activity refreshed, but no recent events were found."
        );
      }
    } catch (err) {
      setAdminActivity([]);
      if (showStatus) {
        setError(`Could not refresh protocol activity: ${err.shortMessage || err.message || "RPC request failed"}`);
        setStatus("");
      }
    }
  }, [chainId, provider, staking]);

  const runTransaction = useCallback(
    async ({ type, label, amount }, action) => {
      const message = `${label}...`;
      let refreshedBeforeResume = false;

      setStatus(message);
      setError("");
      setIsTransactionPending(true);
      if (type === "claim" || type === "unstake" || type === "emergencyWithdraw") {
        setIsLiveRewardEnabled(false);
        setRewardNow(calculateLiveReward(data));
      }

      try {
        const tx = await action();
        setStatus("Waiting for confirmation...");
        recordActivity({
          account,
          amount,
          assetSymbol,
          chainId,
          hash: tx.hash,
          label,
          status: "pending",
          type,
        });
        setActivity(loadActivity(account, chainId));

        const receipt = await tx.wait();
        recordActivity({
          account,
          amount,
          assetSymbol,
          blockNumber: Number(receipt.blockNumber),
          chainId,
          hash: tx.hash,
          label,
          status: "confirmed",
          type,
        });
        setActivity(loadActivity(account, chainId));
        setStatus("Transaction confirmed.");
        try {
          await refresh({ allowRewardReset: true });
          await refreshAdminActivity();
          refreshedBeforeResume = true;
        } catch {
          setRewardNow(calculateLiveReward(data));
        }
      } catch (err) {
        const readableError = getReadableContractError(err);
        recordActivity({
          account,
          amount,
          assetSymbol,
          chainId,
          error: readableError,
          label,
          status: "failed",
          type,
        });
        setActivity(loadActivity(account, chainId));
        setError(readableError);
        showContractErrorPopup(readableError);
        setStatus("");
      } finally {
        if (!refreshedBeforeResume) {
          try {
            await refresh();
          } catch {
            setRewardNow(calculateLiveReward(data));
          }
        }

        setIsTransactionPending(false);
        setIsLiveRewardEnabled(true);
      }
    },
    [account, assetSymbol, chainId, data, refresh, refreshAdminActivity]
  );

  const stake = useCallback(
    async (amount) => {
      if (!staking) return;
      const parsedAmount = parseEthInput(amount, setError);
      if (parsedAmount === null) return;

      if (data.nativeBalance <= parsedAmount) {
        setError(
          `Insufficient ${assetSymbol} balance. Keep some ${assetSymbol} for gas fees.`
        );
        return;
      }

      await runTransaction(
        { type: "stake", label: `Stake ${assetSymbol}`, amount: parsedAmount.toString() },
        () => staking.stake({ value: parsedAmount })
      );
    },
    [assetSymbol, data.nativeBalance, runTransaction, staking]
  );

  const claimReward = useCallback(async () => {
    if (!staking || !account || !signer) return;
    if (data.stakedBalance === ZERO) {
      setError("No active stake. Stake again to earn new rewards.");
      setRewardNow(ZERO);
      return;
    }

    const claimAmount = await staking.earned(account);
    if (claimAmount <= ZERO) {
      setError("No reward to claim yet.");
      return;
    }

    setRewardNow(claimAmount);
    await runTransaction(
      { type: "claim", label: `Claim ${assetSymbol} reward`, amount: claimAmount.toString() },
      () => claimRewardWithFallback(staking, signer, claimAmount)
    );
  }, [account, assetSymbol, data.stakedBalance, runTransaction, signer, staking]);

  const unstake = useCallback(
    async (amount) => {
      if (!staking) return;
      const parsedAmount = parseEthInput(amount, setError);
      if (parsedAmount === null) return;

      if (data.stakedBalance < parsedAmount) {
        setError(
          `Insufficient staked balance. You have ${formatEth(data.stakedBalance)} ${assetSymbol} staked.`
        );
        return;
      }

      await runTransaction(
        { type: "unstake", label: `Unstake ${assetSymbol}`, amount: parsedAmount.toString() },
        () => staking.unstake(parsedAmount)
      );
    },
    [assetSymbol, data.stakedBalance, runTransaction, staking]
  );

  const emergencyWithdraw = useCallback(async () => {
    if (!staking) return;
    await runTransaction({ type: "emergencyWithdraw", label: "Emergency withdraw" }, () => staking.emergencyWithdraw());
  }, [runTransaction, staking]);

  const fundRewardPool = useCallback(
    async (amount) => {
      if (!staking) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      const parsedAmount = parseEthInput(amount, setError);
      if (parsedAmount === null) return;

      if (data.nativeBalance <= parsedAmount) {
        setError(
          `Insufficient ${assetSymbol} balance. Keep some ${assetSymbol} for gas fees.`
        );
        return;
      }

      await runTransaction(
        { type: "fundRewardPool", label: "Fund reward pool", amount: parsedAmount.toString() },
        () => staking.fundRewardPool({ value: parsedAmount })
      );
    },
    [account, assetSymbol, data.nativeBalance, data.owner, runTransaction, staking]
  );

  const setRewardRate = useCallback(
    async (amount) => {
      if (!staking) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      const parsedAmount = parseEthInput(amount, setError);
      if (parsedAmount === null) return;
      await runTransaction(
        { type: "setRewardRate", label: "Update reward rate", amount: parsedAmount.toString() },
        () => staking.setRewardRate(parsedAmount)
      );
    },
    [account, data.owner, runTransaction, staking]
  );

  const setLockPeriod = useCallback(
    async (seconds) => {
      if (!staking) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      await runTransaction(
        { type: "setLockPeriod", label: "Update lock period", amount: String(seconds || 0) },
        () => staking.setLockPeriod(Number(seconds || 0))
      );
    },
    [account, data.owner, runTransaction, staking]
  );

  const setClaimFeeBps = useCallback(
    async (feeBps) => {
      if (!feeContract) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      await runTransaction(
        { type: "setClaimFee", label: "Update claim fee", amount: String(feeBps || 0) },
        () => feeContract.setClaimFeeBps(Number(feeBps || 0))
      );
    },
    [account, data.owner, feeContract, runTransaction]
  );

  const setEmergencyWithdrawFeeBps = useCallback(
    async (feeBps) => {
      if (!feeContract) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      await runTransaction(
        { type: "setEmergencyWithdrawFee", label: "Update emergency withdraw fee", amount: String(feeBps || 0) },
        () => feeContract.setEmergencyWithdrawFeeBps(Number(feeBps || 0))
      );
    },
    [account, data.owner, feeContract, runTransaction]
  );

  const withdrawProtocolFees = useCallback(
    async (amount) => {
      if (!feeContract) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      const parsedAmount = parseEthInput(amount, setError);
      if (parsedAmount === null) return;

      if (data.protocolFees < parsedAmount) {
        setError(`Insufficient protocol fees. Available: ${formatEth(data.protocolFees)} ${assetSymbol}.`);
        return;
      }

      await runTransaction(
        { type: "withdrawProtocolFees", label: "Withdraw protocol fees", amount: parsedAmount.toString() },
        () => feeContract.withdrawProtocolFees(parsedAmount)
      );
    },
    [account, assetSymbol, data.owner, data.protocolFees, feeContract, runTransaction]
  );

  const setPaused = useCallback(
    async (shouldPause) => {
      if (!staking) return;
      if (!ensureOwner(account, data.owner, setError)) return;

      await runTransaction(
        { type: shouldPause ? "pause" : "unpause", label: shouldPause ? "Pause protocol" : "Unpause protocol" },
        () => shouldPause ? staking.pause() : staking.unpause()
      );
    },
    [account, data.owner, runTransaction, staking]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setActivity(loadActivity(account, chainId));
  }, [account, chainId]);

  useEffect(() => {
    if (!account || chainId !== CONTRACTS.chainId || !staking) {
      setAdminActivity([]);
      return;
    }

    refreshAdminActivity();
  }, [account, chainId, refreshAdminActivity, staking]);

  useEffect(() => {
    if (!account || !staking || isTransactionPending) return undefined;

    const interval = window.setInterval(() => {
      refresh();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [account, isTransactionPending, refresh, staking]);

  useEffect(() => {
    if (!staking) return undefined;

    const handleProtocolStatusUpdate = () => {
      if (isTransactionPending) return;
      refreshProtocolStatus();
      refreshAdminActivity();
    };

    const handleContractUpdate = () => {
      if (isTransactionPending) return;
      refresh();
      refreshAdminActivity();
    };

    staking.on("Paused", handleProtocolStatusUpdate);
    staking.on("Unpaused", handleProtocolStatusUpdate);
    staking.on("Staked", handleContractUpdate);
    staking.on("Unstaked", handleContractUpdate);
    staking.on("RewardClaimed", handleContractUpdate);
    staking.on("EmergencyWithdrawn", handleContractUpdate);
    staking.on("RewardPoolFunded", handleContractUpdate);
    staking.on("RewardRateUpdated", handleContractUpdate);
    staking.on("LockPeriodUpdated", handleContractUpdate);

    return () => {
      staking.off("Paused", handleProtocolStatusUpdate);
      staking.off("Unpaused", handleProtocolStatusUpdate);
      staking.off("Staked", handleContractUpdate);
      staking.off("Unstaked", handleContractUpdate);
      staking.off("RewardClaimed", handleContractUpdate);
      staking.off("EmergencyWithdrawn", handleContractUpdate);
      staking.off("RewardPoolFunded", handleContractUpdate);
      staking.off("RewardRateUpdated", handleContractUpdate);
      staking.off("LockPeriodUpdated", handleContractUpdate);
    };
  }, [isTransactionPending, refresh, refreshAdminActivity, refreshProtocolStatus, staking]);

  useEffect(() => {
    if (!account || data.stakedBalance === ZERO || !isLiveRewardEnabled || isTransactionPending) {
      setRewardNow(data.pendingReward);
      return undefined;
    }

    const interval = window.setInterval(() => {
      const nextReward = calculateLiveReward(data);
      setRewardNow((currentReward) => (nextReward > currentReward ? nextReward : currentReward));
    }, REWARD_TICK_MS);

    const nextReward = calculateLiveReward(data);
    setRewardNow((currentReward) => (nextReward > currentReward ? nextReward : currentReward));

    return () => window.clearInterval(interval);
  }, [account, data, isLiveRewardEnabled, isTransactionPending]);

  useEffect(() => {
    if (!isMetaMaskAvailable) return undefined;

    const handleAccountsChanged = () => connectWallet();
    const handleChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [connectWallet, isMetaMaskAvailable]);

  const userOnChainActivity = useMemo(() => {
    if (!account) return [];

    return adminActivity.filter((item) => item.actor?.toLowerCase() === account.toLowerCase());
  }, [account, adminActivity]);
  const userActivity = useMemo(
    () => mergeActivity(activity, userOnChainActivity),
    [activity, userOnChainActivity]
  );

  return {
    account,
    assetSymbol,
    chainId,
    provider,
    staking,
    data,
    displayData: {
      ...data,
      assetSymbol,
      pendingReward: rewardNow,
    },
    status,
    error,
    activity: userActivity,
    adminActivity,
    isTransactionPending,
    isMetaMaskAvailable,
    isCorrectNetwork: chainId === CONTRACTS.chainId,
    connectWallet,
    refresh,
    refreshAdminActivity: () => refreshAdminActivity({ showStatus: true }),
    clearActivity: () => {
      clearActivity(account, chainId);
      setActivity([]);
    },
    stake,
    claimReward,
    unstake,
    emergencyWithdraw,
    fundRewardPool,
    setRewardRate,
    setLockPeriod,
    setClaimFeeBps,
    setEmergencyWithdrawFeeBps,
    withdrawProtocolFees,
    setPaused,
  };
}

function defaultData() {
  return {
    nativeBalance: ZERO,
    ethUsdPrice: null,
    ethUsdDecimals: 0,
    totalStaked: ZERO,
    rewardPool: ZERO,
    protocolFees: ZERO,
    rewardRate: ZERO,
    lockPeriod: ZERO,
    claimFeeBps: ZERO,
    emergencyWithdrawFeeBps: ZERO,
    paused: false,
    owner: "",
    isOwner: false,
    stakedBalance: ZERO,
    pendingReward: ZERO,
    stakeStartTime: 0,
    unlockTime: 0,
    lastUpdateTime: 0,
    syncedAt: 0,
  };
}

function toAdminActivity({ actorArg, amountArg, label, log, type }, blocksByNumber) {
  const timestamp = blocksByNumber.get(log.blockNumber)?.timestamp;
  const actor = actorArg ? log.args?.[actorArg] : "";
  const amount = amountArg && log.args?.[amountArg] !== undefined ? log.args[amountArg].toString() : "";
  const logIndex = getLogIndex(log);

  return {
    id: `${log.transactionHash}-${logIndex}`,
    actor,
    amount,
    blockNumber: log.blockNumber,
    hash: log.transactionHash,
    label,
    status: "confirmed",
    timestamp: timestamp ? Number(timestamp) * 1000 : Date.now(),
    type,
  };
}

async function claimRewardWithFallback(staking, signer, claimAmount) {
  const supportsSnapshotClaim = await hasSnapshotClaim(staking, signer, claimAmount);

  if (supportsSnapshotClaim) {
    return await staking.claimReward(claimAmount);
  }

  const legacyStaking = new ethers.Contract(CONTRACTS.stakingAddress, LEGACY_CLAIM_ABI, signer);
  return legacyStaking.claimReward();
}

async function hasSnapshotClaim(staking, signer, claimAmount) {
  try {
    await signer.provider.call({
      from: await signer.getAddress(),
      to: CONTRACTS.stakingAddress,
      data: SNAPSHOT_CLAIM_INTERFACE.encodeFunctionData("claimReward", [claimAmount]),
    });
    return true;
  } catch (err) {
    const message = `${err.data || ""} ${err.reason || ""} ${err.shortMessage || ""} ${err.message || ""}`;

    if (message.includes("function selector was not recognized") || message.includes("fallback function")) {
      return false;
    }

    if (message.includes("missing revert data")) {
      return false;
    }

    // A decoded contract revert means the function exists but the simulated call failed business rules.
    return true;
  }
}

function mergeActivity(localActivity, onChainActivity) {
  const seen = new Set();

  return [...localActivity, ...onChainActivity]
    .filter((item) => {
      const key = item.hash || item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 40);
}

async function queryContractLogsInChunks(provider, address, fromBlock, latestBlock) {
  const logs = [];

  for (let endBlock = latestBlock; endBlock >= fromBlock; endBlock -= ADMIN_ACTIVITY_CHUNK_BLOCKS + 1) {
    const startBlock = Math.max(fromBlock, endBlock - ADMIN_ACTIVITY_CHUNK_BLOCKS);

    try {
      const chunkLogs = await provider.getLogs({
        address,
        fromBlock: startBlock,
        toBlock: endBlock,
      });

      logs.push(...chunkLogs);
    } catch {
      // Some public RPCs reject individual ranges. Keep newer successful chunks visible.
    }
  }

  return logs;
}

function getLogIndex(log) {
  return log.index ?? log.logIndex ?? 0;
}

async function readOptionalUint(contract, methodName) {
  if (!contract?.[methodName]) {
    return ZERO;
  }

  try {
    return await contract[methodName]();
  } catch {
    return ZERO;
  }
}

async function getEthUsdPrice(provider, chainId) {
  if (chainId !== SEPOLIA_CHAIN_ID) {
    return null;
  }

  try {
    const feed = new ethers.Contract(SEPOLIA_ETH_USD_FEED, PRICE_FEED_ABI, provider);
    const [decimals, roundData] = await Promise.all([feed.decimals(), feed.latestRoundData()]);
    const answer = roundData.answer;

    if (answer <= 0n) {
      return null;
    }

    return {
      price: answer,
      decimals: Number(decimals),
    };
  } catch {
    return null;
  }
}

function calculateLiveReward(data) {
  if (data.stakedBalance === ZERO || data.rewardRate === ZERO || !data.syncedAt) {
    return data.pendingReward;
  }

  const elapsed = BigInt(Math.max(0, Math.floor(Date.now() / 1000) - data.syncedAt));
  const liveAccrued = (data.stakedBalance * data.rewardRate * elapsed) / REWARD_PRECISION;

  return data.pendingReward + liveAccrued;
}

function parseEthInput(amount, setError) {
  try {
    const parsedAmount = ethers.parseEther(amount || "0");
    if (parsedAmount <= ZERO) {
      setError("Amount must be greater than zero.");
      return null;
    }

    return parsedAmount;
  } catch {
    setError("Invalid ETH amount.");
    return null;
  }
}

function ensureOwner(account, owner, setError) {
  if (!account || !owner || account.toLowerCase() !== owner.toLowerCase()) {
    setError(`Only admin can perform this action. Contract owner is ${shortAddress(owner)}.`);
    return false;
  }

  return true;
}

function getReadableContractError(err) {
  const message = `${err.data || ""} ${err.shortMessage || ""} ${err.reason || ""} ${err.message || ""}`;

  if (message.includes("OwnableUnauthorizedAccount")) {
    return "Only the contract admin/owner can perform this action. Switch MetaMask to the admin wallet.";
  }

  if (message.includes("EnforcedPause")) {
    return "Contract is paused. Normal stake, unstake, and claim actions are temporarily disabled.";
  }

  if (message.includes("ExpectedPause")) {
    return "Contract is not paused.";
  }

  if (message.includes("Stake is still locked")) {
    return "Stake is still locked. Wait until the unlock time or use Emergency Withdraw.";
  }

  if (message.includes("Reward is still locked")) {
    return "Reward is still locked. Wait until the unlock time before claiming.";
  }

  if (message.includes("No reward to claim")) {
    return "No reward to claim yet.";
  }

  if (message.includes("Insufficient reward pool")) {
    return "Reward pool is not enough to pay this reward. Please ask the admin to fund the reward pool before claiming.";
  }

  if (message.includes("Insufficient protocol fees")) {
    return "Protocol fees are not enough for this withdrawal amount.";
  }

  if (message.includes("Fee too high")) {
    return "Fee is too high. The contract caps protocol fees at 20%.";
  }

  if (message.includes("Claim amount exceeds reward")) {
    return "Reward snapshot is higher than the on-chain reward. Please refresh and try again.";
  }

  return err.shortMessage || err.reason || err.message || "Transaction failed.";
}

function showContractErrorPopup(message) {
  if (typeof window === "undefined") return;

  if (message.includes("Reward pool is not enough")) {
    window.alert(message);
  }
}

function activityStorageKey(account, chainId) {
  if (!account || !chainId) {
    return null;
  }

  return `eth-staking-activity:${chainId}:${CONTRACTS.stakingAddress}:${account.toLowerCase()}`;
}

function loadActivity(account, chainId) {
  const key = activityStorageKey(account, chainId);
  if (!key) {
    return [];
  }

  try {
    return JSON.parse(window.localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function recordActivity(entry) {
  const key = activityStorageKey(entry.account, entry.chainId);
  if (!key) {
    return;
  }

  const current = loadActivity(entry.account, entry.chainId);
  const nextEntry = {
    ...entry,
    id: entry.hash || `${entry.type}-${Date.now()}`,
    timestamp: Date.now(),
  };
  const withoutDuplicate = entry.hash
    ? current.filter((item) => item.hash !== entry.hash)
    : current;
  const next = [nextEntry, ...withoutDuplicate].slice(0, 30);

  window.localStorage.setItem(key, JSON.stringify(next));
}

function clearActivity(account, chainId) {
  const key = activityStorageKey(account, chainId);
  if (key) {
    window.localStorage.removeItem(key);
  }
}

export function formatEth(value) {
  return Number(ethers.formatEther(value || ZERO)).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  });
}

export function formatUsdPrice(price, decimals) {
  if (price === null || price === undefined) {
    return "-";
  }

  return Number(ethers.formatUnits(price, decimals)).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function formatEthUsdValue(nativeBalance, price, decimals) {
  if (price === null || price === undefined) {
    return "-";
  }

  const ethAmount = Number(ethers.formatEther(nativeBalance || ZERO));
  const ethUsd = Number(ethers.formatUnits(price, decimals));

  return (ethAmount * ethUsd).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function formatDate(timestamp) {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

export function shortAddress(address) {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
