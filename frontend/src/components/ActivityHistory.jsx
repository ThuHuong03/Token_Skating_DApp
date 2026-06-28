import { formatEth, shortAddress } from "../hooks/useContracts";

export function ActivityHistory({
  activity,
  assetSymbol,
  chainId,
  clearActivity,
  emptyMessage = "No actions recorded yet. Stake, claim, unstake, or admin actions will appear here.",
  refreshActivity,
  showActor = false,
  title = "Your Actions",
}) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Activity</p>
          <h2>{title}</h2>
        </div>
        <div className="button-row">
          {refreshActivity && <button onClick={refreshActivity}>Refresh Activity</button>}
          {clearActivity && activity.length > 0 && <button onClick={clearActivity}>Clear History</button>}
        </div>
      </div>

      {activity.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <div className="activity-list">
          {activity.map((item) => (
            <article className="activity-item" key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <p>
                  {formatActivityAmount(item, assetSymbol)}
                  {" · "}
                  {new Date(item.timestamp).toLocaleString()}
                </p>
                {showActor && item.actor && <p className="activity-actor">Wallet: {shortAddress(item.actor)}</p>}
                {item.error && <p className="activity-error">{item.error}</p>}
              </div>

              <div className="activity-meta">
                <span className={`activity-status ${item.status}`}>{item.status}</span>
                {item.hash && (
                  <a href={explorerUrl(chainId, item.hash)} target="_blank" rel="noreferrer">
                    {shortAddress(item.hash)}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function explorerUrl(chainId, hash) {
  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${hash}`;
  }

  return `https://etherscan.io/tx/${hash}`;
}

function formatActivityAmount(item, assetSymbol) {
  if (!item.amount) {
    return "No amount";
  }

  if (item.type === "setLockPeriod") {
    return `${item.amount} sec`;
  }

  if (item.type === "setClaimFee" || item.type === "setEmergencyWithdrawFee") {
    return `${(Number(item.amount) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  }

  return `${formatEth(BigInt(item.amount))} ${assetSymbol}`;
}
