import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { network } from "hardhat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connection = await network.create();
const { ethers } = connection;

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${connection.networkName}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}. Run deploy first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const staking = await ethers.getContractAt("EthStaking", deployment.staking);
  const [admin] = await ethers.getSigners();

  console.log("Network:", deployment.network);
  console.log("EthStaking:", deployment.staking);
  console.log("Admin:", admin?.address ?? deployment.deployer);
  console.log("Total staked:", ethers.formatEther(await staking.totalStaked()), deployment.assetSymbol);
  console.log("Reward pool:", ethers.formatEther(await staking.rewardPool()), deployment.assetSymbol);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
