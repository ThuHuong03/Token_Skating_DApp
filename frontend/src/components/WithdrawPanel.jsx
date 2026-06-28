import { useState } from "react";
import { formatEth } from "../hooks/useContracts";

export function WithdrawPanel({
  assetSymbol,
  paused,
  isTransactionPending,
  stakedBalance,
  pendingReward,
  emergencyWithdrawFeeBps,
  unlockTime,
  unstake,
  emergencyWithdraw,
}) {
  const [amount, setAmount] = useState("0.005");
  const selectedAmount = parseAmountToWei(amount);
  const selectedAmountText = `${formatEth(selectedAmount)} ${assetSymbol}`;
  const selectedEmergencyFee = calculateFee(selectedAmount, emergencyWithdrawFeeBps);
  const selectedEmergencyPayout = selectedAmount > selectedEmergencyFee ? selectedAmount - selectedEmergencyFee : 0n;
  const emergencyFeeRateText = `${(Number(emergencyWithdrawFeeBps || 0n) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}%`;
  const stakedBalanceText = `${formatEth(stakedBalance)} ${assetSymbol}`;
  const pendingRewardText = `${formatEth(pendingReward)} ${assetSymbol}`;
  const fullEmergencyFee = calculateFee(stakedBalance, emergencyWithdrawFeeBps);
  const fullEmergencyPayout = stakedBalance > fullEmergencyFee ? stakedBalance - fullEmergencyFee : 0n;
  const fullEmergencyFeeText = `${formatEth(fullEmergencyFee)} ${assetSymbol}`;
  const fullEmergencyPayoutText = `${formatEth(fullEmergencyPayout)} ${assetSymbol}`;
  const isUnlocked = Boolean(unlockTime) && Date.now() >= unlockTime * 1000;

  const handleUnstake = () => {
    const confirmed = window.confirm(
      `Calling: unstake(${amount || "0"} ${assetSymbol})\n\nExpected receive before gas: ${selectedAmountText}\nThis action does not claim rewards.\nYou still pay the network gas fee separately.\n\nIf MetaMask estimated changes shows a different number, use this popup and the final contract event as the source of truth.\n\nContinue?`
    );

    if (confirmed) {
      unstake(amount);
    }
  };

  const handleEmergencyWithdraw = () => {
    const confirmed = window.confirm(
      `Emergency Withdraw exits all principal and forfeits rewards.\n\nPrincipal: ${stakedBalanceText}\nProtocol emergency fee: ${fullEmergencyFeeText}\nExpected receive before gas: ${fullEmergencyPayoutText}\nForfeited reward: ${pendingRewardText}\n\n${isUnlocked ? "Your stake is already unlocked. Claim Reward + Unstake is recommended if you want to keep rewards.\n\n" : ""}You still pay the network gas fee separately. Continue?`
    );

    if (confirmed) {
      emergencyWithdraw();
    }
  };

  return (
    <section className="card action-card">
      <p className="eyebrow">Withdraw</p>
      <h2>Unstake {assetSymbol}</h2>
      <div className="action-content">
        <div className="action-side">
          <p className="muted">
            Recommended flow after unlock: Claim Reward first, then Unstake. Emergency Withdraw returns principal only and forfeits rewards.
          </p>
          <div className="mini-stats">
            <span>Selected amount: <strong>{selectedAmountText}</strong></span>
            <span>Normal unstake receives: <strong>{selectedAmountText}</strong></span>
            <span>Emergency fee ({emergencyFeeRateText}): <strong>{formatEth(selectedEmergencyFee)} {assetSymbol}</strong></span>
            <span>Emergency receive estimate: <strong>{formatEth(selectedEmergencyPayout)} {assetSymbol}</strong></span>
          </div>
          <p className="muted">
            Emergency Withdraw always exits the full staked balance. The preview above follows the amount input so the fee rate is easier to understand.
          </p>
        </div>

        <div className="action-side action-form-side">
          {isUnlocked && pendingReward > 0n && (
            <p className="form-warning">
              Stake is unlocked. Avoid Emergency Withdraw if you want to keep rewards; use Claim Reward + Unstake instead.
            </p>
          )}

          <label>
            Amount
            <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.005" />
          </label>
          {paused && (
            <p className="form-warning">
              Protocol is paused. Normal unstake is disabled, but Emergency Withdraw remains available.
            </p>
          )}
        </div>
      </div>

      <div className="button-row action-row">
        <button className="primary" disabled={paused || isTransactionPending} onClick={handleUnstake}>
          {paused ? "Unstake Disabled" : isTransactionPending ? "Transaction Pending" : `Unstake Selected ${assetSymbol}`}
        </button>
        <button className="danger" disabled={isTransactionPending} onClick={handleEmergencyWithdraw}>
          {isTransactionPending ? "Transaction Pending" : "Emergency Withdraw All (Lose Rewards)"}
        </button>
      </div>
    </section>
  );
}

function calculateFee(amount, feeBps) {
  return ((amount || 0n) * (feeBps || 0n)) / 10000n;
}

function parseAmountToWei(amount) {
  const normalized = String(amount || "").trim();
  if (!/^\d*(\.\d*)?$/.test(normalized)) {
    return 0n;
  }

  const [whole = "0", fraction = ""] = normalized.split(".");
  const safeWhole = whole || "0";
  const safeFraction = fraction.slice(0, 18).padEnd(18, "0");

  return BigInt(safeWhole) * 10n ** 18n + BigInt(safeFraction || "0");
}
