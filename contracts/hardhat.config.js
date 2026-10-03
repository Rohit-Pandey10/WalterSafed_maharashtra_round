require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const fs = require("fs");

// Load .env from contracts directory if exists, otherwise fallback to root .env
const contractsEnv = path.resolve(__dirname, ".env");
const rootEnv = path.resolve(__dirname, "../.env");

if (fs.existsSync(contractsEnv)) {
  require("dotenv").config({ path: contractsEnv });
} else if (fs.existsSync(rootEnv)) {
  require("dotenv").config({ path: rootEnv });
} else {
  require("dotenv").config();
}

const rawKey = process.env.DEPLOYER_PRIVATE_KEY ? process.env.DEPLOYER_PRIVATE_KEY.trim() : "";
const deployerKey = rawKey
  ? (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`)
  : null;

module.exports = {
  solidity: "0.8.20",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: deployerKey ? [deployerKey] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
