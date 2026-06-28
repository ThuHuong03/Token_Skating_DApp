import { CONTRACTS } from "../config/contracts";
import { shortAddress } from "../hooks/useContracts";

export function WalletConnect({ account, chainId, isCorrectNetwork, connectWallet }) {
  return (
    <section className="card wallet-card">
      <div>
        <p className="eyebrow">Wallet</p>
        <h2>MetaMask Connection</h2>
        <p className="muted">
          Connect MetaMask on the configured network to stake native testnet ETH.
        </p>
      </div>

      <div className="wallet-actions">
        {account ? (
          <>
            <span className="badge">Connected: {shortAddress(account)}</span>
            <span className={isCorrectNetwork ? "badge success" : "badge warning"}>
              Chain: {chainId || "-"} / Expected {CONTRACTS.chainId}
            </span>
          </>
        ) : (
          <button onClick={connectWallet}>Connect Wallet</button>
        )}
      </div>
    </section>
  );
}
