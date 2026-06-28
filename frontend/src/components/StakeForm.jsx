import { useState } from "react";
import { ethers } from "ethers";
import { formatEth } from "../hooks/useContracts";

export function StakeForm({ stake, nativeBalance, rewardRate, assetSymbol, paused, isTransactionPending }) {
  const [amount, setAmount] = useState("0.005");
  const parsedAmount = parseAmount(amount);
  const hasEnoughBalance = parsedAmount !== null && nativeBalance > parsedAmount;
  const estimatedRewardPerMinute = parsedAmount === null ? 0n : calculateRewardForSeconds(parsedAmount, rewardRate, 60);

  const handleStake = () => {
    const confirmed = window.confirm(
      `You are about to stake ${amount || "0"} ${assetSymbol}.\n\nContract receives exactly: ${amount || "0"} ${assetSymbol}\nYour wallet pays: stake amount + network gas fee shown by MetaMask.\n\nGas is not deducted from the staked amount. Continue?`
    );

    if (confirmed) {
      stake(amount);
    }
  };

  return (
    <section className="card action-card">
      <p className="eyebrow">Stake</p>
      <h2>Lock {assetSymbol}</h2>
      <div className="action-content">
        <div className="action-side">
          <p className="muted">Stake directly from your MetaMask balance. Keep some {assetSymbol} for gas fees.</p>

          <div className="mini-stats">
            <span>{assetSymbol} available: <strong>{formatEth(nativeBalance)} {assetSymbol}</strong></span>
            <span>Contract receives: <strong>{amount || "0"} {assetSymbol}</strong></span>
            <span>Estimated reward / 60s: <strong>{formatEth(estimatedRewardPerMinute)} {assetSymbol}</strong></span>
            <span>Wallet pays: <strong>stake amount + gas</strong></span>
          </div>
        </div>

        <div className="action-side action-form-side">
          <label>
            Amount
            <div className="input-with-action">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.005" />
              <button type="button" onClick={() => setAmount("0.005")}>
                Demo
              </button>
            </div>
          </label>

          {parsedAmount !== null && !hasEnoughBalance && (
            <p className="form-warning">Not enough {assetSymbol}. Leave some balance for gas.</p>
          )}
          {paused && <p className="form-warning">Protocol is paused. Staking is temporarily disabled.</p>}
        </div>
      </div>

      <div className="button-row action-row">
        <button className="primary" disabled={paused || isTransactionPending} onClick={handleStake}>
          {paused ? "Stake Disabled" : isTransactionPending ? "Transaction Pending" : `Stake ${assetSymbol}`}
        </button>
      </div>
    </section>
  );
}

function calculateRewardForSeconds(stakedAmount, rewardRate, seconds) {
  return ((stakedAmount || 0n) * (rewardRate || 0n) * BigInt(seconds)) / (10n ** 18n);
}

function parseAmount(amount) {
  try {
    const parsedAmount = ethers.parseEther(amount || "0");
    return parsedAmount > 0n ? parsedAmount : null;
  } catch {
    return null;
  }
}
