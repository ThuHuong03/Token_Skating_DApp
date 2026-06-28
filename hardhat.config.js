import "dotenv/config";
import { createRequire } from "module";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

const require = createRequire(import.meta.url);
const sepoliaPrivateKey = process.env.SEPOLIA_PRIVATE_KEY;
const sepoliaAccounts = sepoliaPrivateKey
  ? [sepoliaPrivateKey.startsWith("0x") ? sepoliaPrivateKey : `0x${sepoliaPrivateKey}`]
  : "remote";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  plugins: [hardhatEthers, hardhatMocha, hardhatNetworkHelpers],
  solidity: {
    version: "0.8.35",
    path: require.resolve("solc/soljson.js"),
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: "remote",
    },
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      chainType: "l1",
      accounts: sepoliaAccounts,
    },
  },
};
