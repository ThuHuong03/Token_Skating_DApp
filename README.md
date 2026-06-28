# Secure Native ETH Staking DApp

Do an mon Blockchain: ung dung DeFi staking cho phep user stake native ETH tren Sepolia, nhan reward tu reward pool do admin nap vao, dong thoi minh hoa cac co che bao mat smart contract nhu lock period, pause, owner-only control, non-reentrancy va protocol fee.

SepoliaETH la ETH testnet, khong co gia tri tien that. Frontend co tich hop Chainlink Sepolia ETH/USD Price Feed de hien thi gia ETH/USD tham chieu va uoc tinh gia tri vi cho muc dich demo.

## Tom Tat Chuc Nang Moi Nhat

- Stake native SepoliaETH truc tiep tu MetaMask, khong dung token gia lap.
- Reward tinh theo cong thuc: `reward = stakedAmount x rewardRate x elapsedTime / 1e18`.
- Reward chi duoc claim sau lock period.
- Claim reward dung snapshot amount de tranh MetaMask thay doi gia tri transaction lien tuc.
- Normal unstake chi rut principal theo amount user chon.
- Emergency withdraw rut toan bo principal, mat pending reward va bi tinh emergency fee.
- Protocol fee cho admin:
  - Claim fee mac dinh `500 bps = 5%`.
  - Emergency withdraw fee mac dinh `1000 bps = 10%`.
  - Fee toi da `2000 bps = 20%`.
  - Admin co the withdraw protocol fees ve vi admin.
- Admin co the fund reward pool, update reward rate, lock period, claim fee, emergency fee, pause/unpause.
- User va admin co activity history:
  - Local history cho pending/failed action.
  - On-chain event logs cho confirmed activity.
- Pause/unpause cap nhat bang event `Paused`/`Unpaused`, khong phu thuoc hoan toan vao polling.
- UI tach user page `/` va admin page `/admin`.

## Y Tuong Nghiep Vu

Nen tang mo phong mot staking protocol:

- User gui SepoliaETH vao smart contract de khoa trong mot thoi gian ngan.
- Trong thoi gian stake, user tich luy reward theo ty le do admin thiet lap.
- Admin nap reward pool de chi tra reward cho user.
- Protocol thu phi tu claim reward va emergency withdraw de tao revenue cho admin.
- Smart contract giu tien, tinh reward, thu phi, ghi event va enforce security rules.

## Actors

- **User/Investor**
  - Connect MetaMask.
  - Stake SepoliaETH.
  - Claim reward sau lock period.
  - Unstake principal sau lock period.
  - Emergency withdraw neu can thoat som, chap nhan mat reward va tra emergency fee.

- **Admin/Platform Owner**
  - Deploy contract.
  - Fund reward pool.
  - Set reward rate, lock period.
  - Set claim fee va emergency withdraw fee.
  - Withdraw protocol fees.
  - Pause/unpause protocol khi co rui ro.

- **Smart Contract**
  - Giu staked principal, reward pool, protocol fees.
  - Tinh reward theo thoi gian.
  - Enforce lock period, fee, pause, owner-only rules.
  - Emit event logs de frontend va admin theo doi activity.

## Smart Contract Design

### `EthStaking.sol`

File chinh cua protocol:

- `stake()` - user stake native ETH bang `msg.value`.
- `unstake(uint256 amount)` - user rut selected principal sau lock period.
- `claimReward(uint256 amount)` - user claim reward snapshot sau lock period.
- `emergencyWithdraw()` - user rut toan bo principal, mat reward va tra emergency fee.
- `fundRewardPool()` - admin nap ETH vao reward pool.
- `withdrawUnusedRewards()` - admin rut reward pool chua dung.
- `withdrawProtocolFees()` - admin rut fee revenue.
- `setRewardRate()` - admin cap nhat toc do reward.
- `setLockPeriod()` - admin cap nhat lock period.
- `pause()` / `unpause()` - admin bat/tat che do khan cap.
- `earned(address user)` - view function tinh pending reward.
- `getStakeInfo(address user)` - tra thong tin stake cua user.

### `ProtocolFees.sol`

File tach rieng de code de doc hon:

- Luu `protocolFees`, `claimFeeBps`, `emergencyWithdrawFeeBps`.
- Gioi han fee bang `MAX_FEE_BPS = 2000`.
- Tinh fee theo basis points:

```text
100 bps = 1%
500 bps = 5%
1000 bps = 10%
fee = amount x feeBps / 10000
```

- Emit event:
  - `ProtocolFeeCollected`
  - `ProtocolFeesWithdrawn`
  - `ClaimFeeUpdated`
  - `EmergencyWithdrawFeeUpdated`

## Reward Va Fee Flow

### Stake

```text
User nhap amount -> MetaMask ky transaction -> contract nhan msg.value
account.balance += msg.value
totalStaked += msg.value
```

Gas la phi user tra rieng cho network, khong bi tru vao amount stake.

### Reward

```text
elapsed = block.timestamp - lastUpdateTime
pending = stakedBalance x rewardRate x elapsed / 1e18
earned = rewardStored + pending
```

Reward lay tu `rewardPool`, nen neu reward pool khong du thi claim se revert `Insufficient reward pool`.

### Claim Reward

```text
claimAmount = snapshot reward amount
claimFee = claimAmount x claimFeeBps / 10000
payout = claimAmount - claimFee
rewardPool -= claimAmount
protocolFees += claimFee
user receives payout
```

Vi du:

```text
Reward = 0.001 SepoliaETH
Claim fee = 500 bps = 5%
Fee = 0.00005 SepoliaETH
User receives = 0.00095 SepoliaETH truoc gas
```

### Normal Unstake

```text
User chon amount
Contract tra dung selected principal amount
Khong claim reward
Khong thu protocol fee
User van tra gas rieng
```

### Emergency Withdraw

```text
Principal = full staked balance
Emergency fee = principal x emergencyWithdrawFeeBps / 10000
Payout = principal - emergency fee
Pending reward = 0
protocolFees += emergency fee
```

Vi du:

```text
Principal = 0.005 SepoliaETH
Emergency fee = 1000 bps = 10%
Fee = 0.0005 SepoliaETH
User receives = 0.0045 SepoliaETH truoc gas
```

## Security Features

- `Ownable`: chi admin moi goi duoc function quan tri.
- `Pausable`: admin co the pause protocol khi co loi/rui ro.
- `ReentrancyGuard`: bao ve cac function chuyen ETH.
- Lock period: `claimReward` va normal `unstake` chi thuc hien sau unlock time.
- Reward pool accounting: khong tra reward vuot qua pool.
- Protocol fee cap: fee khong vuot qua 20%.
- Checks-effects-interactions: update state truoc khi transfer ETH.
- `receive()` revert: bat buoc nap reward qua `fundRewardPool`.
- Event logs: giup audit va tracking activity.

## Frontend Features

- React + Vite.
- `ethers.js` de connect MetaMask va goi contract.
- Chainlink ETH/USD Price Feed tren Sepolia de hien thi gia tham chieu.
- User page `/`:
  - Dashboard protocol va portfolio.
  - Stake form.
  - Claim reward panel.
  - Withdraw/emergency panel.
  - Protocol activity.
- Admin page `/admin`:
  - Fund reward pool.
  - Update reward rate va lock period.
  - Update claim fee va emergency fee bang bps.
  - Withdraw protocol fees.
  - Pause/unpause protocol.
  - Activity history.
- Activity:
  - Local storage cho pending/failed transaction.
  - On-chain event logs cho confirmed activity.
  - Query logs theo chunk nho do gioi han Alchemy free tier.
- UX:
  - Popup confirm truoc action quan trong.
  - Error message than thien cho revert reason.
  - Button disabled khi transaction pending hoac protocol paused.
  - Event-driven status update cho pause/unpause.

## Project Structure

```text
Token_Skating_DApp/
├─ contracts/
│  ├─ EthStaking.sol          # Core staking, reward, admin controls
│  └─ ProtocolFees.sol        # Protocol fee accounting and fee config
├─ scripts/
│  ├─ deploy.js               # Deploy contract, fund reward pool, export ABI/config
│  └─ seed.js                 # Read/display deployed contract state
├─ test/
│  └─ EthStaking.test.js      # Hardhat test suite
├─ deployments/
│  ├─ sepolia.json            # Latest Sepolia deployment info
│  └─ default.json            # Local deployment info
├─ frontend/
│  ├─ src/
│  │  ├─ abi/EthStaking.json  # ABI generated from deploy script
│  │  ├─ config/contracts.js  # Chain ID, contract address, asset symbol
│  │  ├─ hooks/useContracts.js
│  │  ├─ components/
│  │  │  ├─ WalletConnect.jsx
│  │  │  ├─ StakingDashboard.jsx
│  │  │  ├─ StakeForm.jsx
│  │  │  ├─ RewardPanel.jsx
│  │  │  ├─ WithdrawPanel.jsx
│  │  │  ├─ AdminPanel.jsx
│  │  │  └─ ActivityHistory.jsx
│  │  ├─ App.jsx
│  │  └─ styles.css
│  ├─ vercel.json             # Rewrite rule for /admin
│  └─ package.json
├─ hardhat.config.js
├─ package.json
└─ README.md
```

## Latest Sepolia Deployment

```text
Network: Sepolia
Chain ID: 11155111
Contract: 0x4B5d60789F120B6277FC2647502777D813F29848
Admin: 0x287FFc821362C2Ded90038cEa9dbD50CBc35c515
Initial reward pool: 0.01 SepoliaETH
Initial reward rate: 0.000001 SepoliaETH per 1 ETH staked / sec
Lock period: 60 sec
Claim fee: 500 bps = 5%
Emergency fee: 1000 bps = 10%
```

## Setup

```bash
npm install
npm install --prefix frontend
```

## Run Local Demo

Terminal 1:

```bash
npm run node
```

Terminal 2:

```bash
npm run deploy:local
```

Terminal 3:

```bash
npm run frontend
```

Open:

```text
http://127.0.0.1:5173
```

## Run Sepolia Testnet Demo

1. Lay SepoliaETH tu faucet cho admin va user wallet.
2. Tao `.env`:

```powershell
Copy-Item .env.example .env
```

3. Dien bien moi truong:

```text
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
SEPOLIA_PRIVATE_KEY=admin_wallet_private_key
```

Khong commit hoac chia se `.env`.

4. Deploy contract:

```bash
npm run deploy:sepolia
```

Deploy script se:

- Deploy `EthStaking`.
- Fund reward pool voi `0.01 SepoliaETH`.
- Ghi `deployments/sepolia.json`.
- Ghi `frontend/src/config/contracts.js`.
- Ghi `frontend/src/abi/EthStaking.json`.

5. Chay frontend:

```bash
npm run frontend
```

6. MetaMask:

```text
Network: Sepolia
Chain ID: 11155111
Currency: SepoliaETH
```

## Vercel Deployment

Production alias:

```text
https://token-skating.vercel.app
```

Sau moi lan deploy contract moi, can deploy lai frontend len Vercel de production dung ABI va contract address moi.

## Demo Flow De Thuyet Trinh

1. Mo user page `/`, connect MetaMask user.
2. Stake `0.005 SepoliaETH`.
3. Giai thich gas: wallet tra `stake amount + gas`, contract nhan dung `0.005`.
4. Cho reward accruing theo `stake x rate x time`.
5. Mo admin page `/admin`, connect admin wallet.
6. Thay doi reward rate, lock period, claim fee, emergency fee.
7. Pause protocol va xem user page tu dong nhan event status moi.
8. User claim reward sau lock period:
   - reward bi tru claim fee
   - user nhan net reward truoc gas
   - admin protocol fees tang
9. User emergency withdraw:
   - user nhan principal - emergency fee
   - pending reward bi xoa
   - admin protocol fees tang
10. Admin withdraw protocol fees ve vi admin.
11. Mo Protocol Activity de xem event logs.

## Test

```bash
npm run compile
npm run test
npm run build --prefix frontend
```

Current test coverage:

- Stake native ETH.
- Reject zero amount stake.
- Lock period before unstake.
- Reward accrual and claim.
- Snapshot claim leaves later rewards pending.
- Insufficient reward pool protection.
- Claim blocked before lock period.
- Emergency withdraw clears pending rewards.
- Claim fee and emergency fee accounting.
- Owner updates and withdraws protocol fees.
- Fee cap validation.
- Owner-only admin functions.
- Pause behavior.
- Over-withdraw prevention.

## Important Notes

- SepoliaETH la testnet asset, khong co gia tri tien that.
- Redeploy contract se tao state moi; stake/reward cua contract cu khong tu dong migrate sang contract moi.
- MetaMask "Estimated changes" co the hien thi net balance simulation. Source of truth la transaction receipt va contract events.
- Project nay phuc vu hoc tap/demo. Neu chay mainnet can audit, key management, monitoring, economic model va incident response nghiem tuc hon.
