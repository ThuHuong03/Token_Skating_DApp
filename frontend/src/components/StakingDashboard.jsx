import {
  formatDate,
  formatEth,
  formatEthUsdValue,
  formatUsdPrice,
  shortAddress,
} from "../hooks/useContracts";

export function StakingDashboard({ data }) {
  const assetSymbol = data.assetSymbol || "ETH";
  const rewardPerMinute = calculateRewardForSeconds(data.stakedBalance, data.rewardRate, 60);

  return (
    <section className="grid two">
      <div className="card">
        <p className="eyebrow">Protocol</p>
        <h2>Staking Pool</h2>
        <div className="stats">
          <Stat label="Total staked" value={`${formatEth(data.totalStaked)} ${assetSymbol}`} />
          <Stat label="Reward pool" value={`${formatEth(data.rewardPool)} ${assetSymbol}`} />
          <Stat label="Protocol fees" value={`${formatEth(data.protocolFees)} ${assetSymbol}`} />
          <Stat label="Reward rate" value={`${formatEth(data.rewardRate)} ${assetSymbol}/ETH/sec`} />
          <Stat label="Claim fee" value={formatBps(data.claimFeeBps)} />
          <Stat label="Emergency fee" value={formatBps(data.emergencyWithdrawFeeBps)} />
          <Stat label="Reward formula" value="stake x rate x time" />
          <Stat label="Lock period" value={`${Number(data.lockPeriod).toLocaleString()} sec`} />
          <Stat
            label="Status"
            value={<span className={data.paused ? "status-pill paused" : "status-pill active"}>{data.paused ? "Paused" : "Active"}</span>}
          />
          <Stat label="Admin" value={shortAddress(data.owner)} />
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Portfolio</p>
        <h2>Your Position</h2>
        <div className="stats">
          <Stat label={`${assetSymbol} balance`} value={`${formatEth(data.nativeBalance)} ${assetSymbol}`} />
          <Stat label="ETH/USD reference" value={formatUsdPrice(data.ethUsdPrice, data.ethUsdDecimals)} />
          <Stat
            label="Estimated wallet value"
            value={formatEthUsdValue(data.nativeBalance, data.ethUsdPrice, data.ethUsdDecimals)}
          />
          <Stat label="Staked balance" value={`${formatEth(data.stakedBalance)} ${assetSymbol}`} />
          <Stat label="Pending reward" value={`${formatEth(data.pendingReward)} ${assetSymbol}`} />
          <Stat label="Estimated reward / 60s" value={`${formatEth(rewardPerMinute)} ${assetSymbol}`} />
          <Stat label="Stake started" value={formatDate(data.stakeStartTime)} />
          <Stat label="Unlock time" value={formatDate(data.unlockTime)} />
        </div>
      </div>
    </section>
  );
}

function calculateRewardForSeconds(stakedBalance, rewardRate, seconds) {
  return ((stakedBalance || 0n) * (rewardRate || 0n) * BigInt(seconds)) / (10n ** 18n);
}

function formatBps(value) {
  return `${(Number(value || 0n) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
