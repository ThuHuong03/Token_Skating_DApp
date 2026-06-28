import { useState } from "react";
import { formatEth, shortAddress } from "../hooks/useContracts";

export function AdminPanel({
  assetSymbol,
  data,
  fundRewardPool,
  setRewardRate,
  setLockPeriod,
  setClaimFeeBps,
  setEmergencyWithdrawFeeBps,
  withdrawProtocolFees,
  setPaused,
}) {
  const [fundAmount, setFundAmount] = useState("0.005");
  const [rewardRateInput, setRewardRateInput] = useState("0.000001");
  const [lockPeriodInput, setLockPeriodInput] = useState("60");
  const [claimFeeInput, setClaimFeeInput] = useState("500");
  const [emergencyFeeInput, setEmergencyFeeInput] = useState("1000");
  const [withdrawFeeAmount, setWithdrawFeeAmount] = useState("0.001");

  const confirmAdminAction = (message, action) => {
    const confirmed = window.confirm(`${message}\n\nThis admin wallet pays the network gas fee separately. Continue?`);

    if (confirmed) {
      action();
    }
  };

  if (!data.isOwner) {
    return (
      <section className="card">
        <p className="eyebrow">Admin</p>
        <h2>Owner Controls</h2>
        <p className="muted">
          Connect the deployer/admin wallet to manage protocol settings. Owner: {shortAddress(data.owner)}
        </p>
      </section>
    );
  }

  return (
    <section className="card admin-card">
      <p className="eyebrow">Admin</p>
      <h2>Owner Controls</h2>
      <p className={data.paused ? "admin-state paused" : "admin-state active"}>
        Current protocol state: <strong>{data.paused ? "Paused" : "Active"}</strong>
      </p>

      <div className="admin-sections">
        <section className="admin-section">
          <div>
            <p className="eyebrow">Funding</p>
            <h3>Reward Liquidity</h3>
            <p className="muted">Admin deposits ETH used to pay user rewards.</p>
          </div>
          <div className="admin-section-grid single">
            <label>
              Fund reward pool ({assetSymbol})
              <input value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} />
              <button onClick={() => confirmAdminAction(`Fund reward pool with ${fundAmount || "0"} ${assetSymbol}.`, () => fundRewardPool(fundAmount))}>Fund Pool</button>
            </label>
          </div>
        </section>

        <section className="admin-section">
          <div>
            <p className="eyebrow">Rewards</p>
            <h3>Reward Rules</h3>
            <p className="muted">Reward = stake amount x reward rate x time.</p>
          </div>
          <div className="admin-section-grid">
            <label>
              Reward rate ({assetSymbol} per 1 ETH staked / sec)
              <input value={rewardRateInput} onChange={(event) => setRewardRateInput(event.target.value)} />
              <div className="button-row preset-row">
                <button type="button" onClick={() => setRewardRateInput("0.000002")}>
                  30s demo
                </button>
                <button type="button" onClick={() => setRewardRateInput("0.000001")}>
                  60s slow
                </button>
              </div>
              <button onClick={() => confirmAdminAction(`Update reward rate to ${rewardRateInput || "0"} ${assetSymbol}/ETH/sec.`, () => setRewardRate(rewardRateInput))}>Update Rate</button>
            </label>

            <label>
              Lock period seconds
              <input value={lockPeriodInput} onChange={(event) => setLockPeriodInput(event.target.value)} />
              <button onClick={() => confirmAdminAction(`Update lock period to ${lockPeriodInput || "0"} seconds.`, () => setLockPeriod(lockPeriodInput))}>Update Lock</button>
            </label>
          </div>
        </section>

        <section className="admin-section">
          <div>
            <p className="eyebrow">Revenue</p>
            <h3>Protocol Fees</h3>
            <p className="muted">Fees use basis points: 100 bps = 1%, 500 bps = 5%, 1000 bps = 10%.</p>
          </div>
          <div className="admin-section-grid">
            <label>
              Claim fee (bps)
              <input value={claimFeeInput} onChange={(event) => setClaimFeeInput(event.target.value)} />
              <p className="muted">{claimFeeInput || "0"} bps = {formatBps(claimFeeInput)}</p>
              <button onClick={() => confirmAdminAction(`Update claim fee to ${claimFeeInput || "0"} bps (${formatBps(claimFeeInput)}).`, () => setClaimFeeBps(claimFeeInput))}>Update Claim Fee</button>
            </label>

            <label>
              Emergency fee (bps)
              <input value={emergencyFeeInput} onChange={(event) => setEmergencyFeeInput(event.target.value)} />
              <p className="muted">{emergencyFeeInput || "0"} bps = {formatBps(emergencyFeeInput)}</p>
              <button onClick={() => confirmAdminAction(`Update emergency fee to ${emergencyFeeInput || "0"} bps (${formatBps(emergencyFeeInput)}).`, () => setEmergencyWithdrawFeeBps(emergencyFeeInput))}>Update Emergency Fee</button>
            </label>

            <label>
              Withdraw protocol fees ({assetSymbol})
              <input value={withdrawFeeAmount} onChange={(event) => setWithdrawFeeAmount(event.target.value)} />
              <p className="muted">Available: {formatEth(data.protocolFees)} {assetSymbol}</p>
              <button onClick={() => confirmAdminAction(`Withdraw ${withdrawFeeAmount || "0"} ${assetSymbol} in protocol fees.`, () => withdrawProtocolFees(withdrawFeeAmount))}>Withdraw Fees</button>
            </label>
          </div>
        </section>
      </div>

      <div className="button-row admin-control-row">
        {data.paused ? (
          <button className="primary" onClick={() => confirmAdminAction("Unpause the protocol.", () => setPaused(false))}>
            Unpause Protocol
          </button>
        ) : (
          <button className="danger" onClick={() => confirmAdminAction("Pause the protocol. Normal stake, claim, and unstake actions will be disabled.", () => setPaused(true))}>
            Pause Protocol
          </button>
        )}
      </div>
    </section>
  );
}

function formatBps(value) {
  return `${(Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}
