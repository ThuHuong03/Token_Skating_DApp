import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { artifacts, network } from "hardhat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connection = await network.create();
const { ethers } = connection;

const REWARD_POOL = ethers.parseEther("0.01");
const REWARD_RATE = ethers.parseUnits("0.000001", 18);
const LOCK_PERIOD = 60;
const DEPLOY_GAS_LIMIT = 3_000_000;
const FUND_GAS_LIMIT = 100_000;

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No deployer account available for network "${connection.networkName}". Set SEPOLIA_PRIVATE_KEY in .env before deploying to Sepolia.`
    );
  }

  const staking = await ethers.deployContract("EthStaking", [REWARD_RATE, LOCK_PERIOD], {
    gasLimit: DEPLOY_GAS_LIMIT,
  });
  await staking.waitForDeployment();

  const fundTx = await staking.fundRewardPool({ value: REWARD_POOL, gasLimit: FUND_GAS_LIMIT });
  await fundTx.wait();

  const chain = await ethers.provider.getNetwork();
  const deployment = {
    network: connection.networkName,
    chainId: Number(chain.chainId),
    deployer: deployer.address,
    staking: await staking.getAddress(),
    rewardRate: REWARD_RATE.toString(),
    lockPeriod: LOCK_PERIOD,
    rewardPool: REWARD_POOL.toString(),
    assetSymbol: chain.chainId === 11155111n ? "SepoliaETH" : "ETH",
  };

  await writeDeploymentFiles(deployment);

  console.log("EthStaking deployed to:", deployment.staking);
  console.log("Deployer/admin:", deployment.deployer);
  console.log("Reward pool funded:", ethers.formatEther(REWARD_POOL), deployment.assetSymbol);
  console.log("Demo lock period:", LOCK_PERIOD, "seconds");
}

async function writeDeploymentFiles(deployment) {
  const rootDir = path.join(__dirname, "..");
  const deploymentsDir = path.join(rootDir, "deployments");
  const frontendAbiDir = path.join(rootDir, "frontend", "src", "abi");
  const frontendConfigDir = path.join(rootDir, "frontend", "src", "config");

  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.mkdirSync(frontendAbiDir, { recursive: true });
  fs.mkdirSync(frontendConfigDir, { recursive: true });

  fs.writeFileSync(
    path.join(deploymentsDir, `${deployment.network}.json`),
    `${JSON.stringify(deployment, null, 2)}\n`
  );

  const stakingArtifact = await artifacts.readArtifact("EthStaking");

  fs.writeFileSync(path.join(frontendAbiDir, "EthStaking.json"), `${JSON.stringify(stakingArtifact.abi, null, 2)}\n`);

  const frontendConfig = `export const CONTRACTS = ${JSON.stringify(
    {
      chainId: deployment.chainId,
      stakingAddress: deployment.staking,
      rewardRate: deployment.rewardRate,
      lockPeriod: deployment.lockPeriod,
      assetSymbol: deployment.assetSymbol,
    },
    null,
    2
  )};\n`;

  fs.writeFileSync(path.join(frontendConfigDir, "contracts.js"), frontendConfig);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
