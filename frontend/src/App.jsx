import { AdminPanel } from "./components/AdminPanel.jsx";
import { ActivityHistory } from "./components/ActivityHistory.jsx";
import { RewardPanel } from "./components/RewardPanel.jsx";
import { StakeForm } from "./components/StakeForm.jsx";
import { StakingDashboard } from "./components/StakingDashboard.jsx";
import { WalletConnect } from "./components/WalletConnect.jsx";
import { WithdrawPanel } from "./components/WithdrawPanel.jsx";
import { CONTRACTS } from "./config/contracts.js";
import { useContracts } from "./hooks/useContracts.js";

export default function App() {
  const contracts = useContracts();
  const page = getInitialPage();

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Secure Token Staking DApp</p>
          <h1>Decentralized Reward Management</h1>
          <p>
            Stake {contracts.assetSymbol}, earn on-chain rewards, and demonstrate DeFi security controls such as
            pause, owner-only administration, lock periods, and emergency withdraw.
          </p>
        </div>
      </header>

      <WalletConnect
        account={contracts.account}
        chainId={contracts.chainId}
        isCorrectNetwork={contracts.isCorrectNetwork}
        connectWallet={contracts.connectWallet}
      />

      {!contracts.isMetaMaskAvailable && <div className="alert error">MetaMask is required for this demo.</div>}
      {contracts.account && !contracts.isCorrectNetwork && (
        <div className="alert warning">Switch MetaMask to chain ID {CONTRACTS.chainId} before sending transactions.</div>
      )}
      {contracts.account && contracts.isCorrectNetwork && (
        <div className={contracts.displayData.paused ? "status-banner paused" : "status-banner active"}>
          <strong>Protocol status: {contracts.displayData.paused ? "Paused" : "Active"}</strong>
          <span>
            {contracts.displayData.paused
              ? "Normal stake, unstake, and claim actions are disabled. Emergency withdraw remains available."
              : "Users can stake, claim rewards, and unstake after the lock period."}
          </span>
        </div>
      )}
      {contracts.status && <div className="alert">{contracts.status}</div>}
      {contracts.error && <div className="alert error">{contracts.error}</div>}

      {page === "user" ? (
        <>
          <StakingDashboard data={contracts.displayData} />

          <section className="grid three">
            <StakeForm
              assetSymbol={contracts.assetSymbol}
              stake={contracts.stake}
              nativeBalance={contracts.displayData.nativeBalance}
              rewardRate={contracts.displayData.rewardRate}
              paused={contracts.displayData.paused}
              isTransactionPending={contracts.isTransactionPending}
            />
            <RewardPanel
              assetSymbol={contracts.assetSymbol}
              pendingReward={contracts.displayData.pendingReward}
              claimFeeBps={contracts.displayData.claimFeeBps}
              paused={contracts.displayData.paused}
              unlockTime={contracts.displayData.unlockTime}
              isTransactionPending={contracts.isTransactionPending}
              claimReward={contracts.claimReward}
            />
            <WithdrawPanel
              assetSymbol={contracts.assetSymbol}
              paused={contracts.displayData.paused}
              isTransactionPending={contracts.isTransactionPending}
              stakedBalance={contracts.displayData.stakedBalance}
              pendingReward={contracts.displayData.pendingReward}
              emergencyWithdrawFeeBps={contracts.displayData.emergencyWithdrawFeeBps}
              unlockTime={contracts.displayData.unlockTime}
              unstake={contracts.unstake}
              emergencyWithdraw={contracts.emergencyWithdraw}
            />
          </section>
        </>
      ) : (
        <>
          <section className="page-heading card">
            <p className="eyebrow">Admin Console</p>
            <h2>Protocol Management</h2>
            <p className="muted">
              Manage reward funding, pause controls, reward rate, and lock period from the contract owner wallet.
            </p>
          </section>

          <StakingDashboard data={contracts.displayData} />

          {contracts.account && contracts.isCorrectNetwork && !contracts.data.isOwner ? (
            <section className="card">
              <p className="eyebrow">Access Restricted</p>
              <h2>Admin Wallet Required</h2>
              <p className="muted">
                This page is only for the contract owner. Switch MetaMask to the admin wallet to manage the protocol.
              </p>
            </section>
          ) : (
            <AdminPanel
              assetSymbol={contracts.assetSymbol}
              data={contracts.data}
              fundRewardPool={contracts.fundRewardPool}
              setRewardRate={contracts.setRewardRate}
              setLockPeriod={contracts.setLockPeriod}
              setClaimFeeBps={contracts.setClaimFeeBps}
              setEmergencyWithdrawFeeBps={contracts.setEmergencyWithdrawFeeBps}
              withdrawProtocolFees={contracts.withdrawProtocolFees}
              setPaused={contracts.setPaused}
            />
          )}

          {contracts.account && contracts.isCorrectNetwork && contracts.data.isOwner && (
            <ActivityHistory
              activity={contracts.adminActivity}
              assetSymbol={contracts.assetSymbol}
              chainId={contracts.chainId}
              emptyMessage="No on-chain protocol activity found in the recent event window."
              refreshActivity={contracts.refreshAdminActivity}
              showActor
              title="Protocol Activity"
            />
          )}
        </>
      )}
    </main>
  );
}

function getInitialPage() {
  return window.location.pathname === "/admin" ? "admin" : "user";
}
