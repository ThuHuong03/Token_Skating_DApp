import { formatEth } from "../hooks/useContracts";

export function RewardPanel({
  pendingReward,
  claimFeeBps,
  assetSymbol,
  paused,
  unlockTime,
  isTransactionPending,
  claimReward,
}) {
  const isRewardLocked = Boolean(unlockTime) && Date.now() < unlockTime * 1000;
  const hasReward = pendingReward > 0n;
  const claimFee = calculateFee(pendingReward, claimFeeBps);
  const netReward = pendingReward - claimFee;
  const disabled = paused || isRewardLocked || isTransactionPending || !hasReward;

  const handleClaimReward = () => {
    const confirmed = window.confirm(
      `You are about to claim ${formatEth(pendingReward)} ${assetSymbol} in rewards.\n\nProtocol fee: ${formatEth(claimFee)} ${assetSymbol}\nExpected receive before gas: ${formatEth(netReward)} ${assetSymbol}\n\nYou still pay the network gas fee separately. Continue?`
    );

    if (confirmed) {
      claimReward();
    }
  };

  return (
    <section className="card action-card">
      <p className="eyebrow">Rewards</p>
      <h2>Claim Earnings</h2>
      <div className="action-content">
        <div className="action-side">
          <p className="large-number">{formatEth(pendingReward)} {assetSymbol}</p>
          <p className="muted">
            Rewards accrue in {assetSymbol}. Claiming is available after the lock period ends.
          </p>
        </div>

        <div className="action-side">
          <div className="mini-stats">
            <span>Protocol claim fee: <strong>{formatEth(claimFee)} {assetSymbol}</strong></span>
            <span>Expected receive before gas: <strong>{formatEth(netReward)} {assetSymbol}</strong></span>
          </div>
          {paused && <p className="form-warning">Protocol is paused. Claiming rewards is temporarily disabled.</p>}
          {isRewardLocked && <p className="form-warning">Reward is locked until {new Date(unlockTime * 1000).toLocaleString()}.</p>}
        </div>
      </div>
      <div className="button-row action-row">
        <button className="primary" disabled={disabled} onClick={handleClaimReward}>
          {isTransactionPending ? "Transaction Pending" : !hasReward ? "No Reward" : disabled ? "Claim Disabled" : "Claim Reward"}
        </button>
      </div>
    </section>
  );
}

function calculateFee(amount, feeBps) {
  return ((amount || 0n) * (feeBps || 0n)) / 10000n;
}
