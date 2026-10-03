const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment of HeirloomVault...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const HeirloomVault = await hre.ethers.getContractFactory("HeirloomVault");
  const vault = await HeirloomVault.deploy();
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("HeirloomVault deployed successfully to:", vaultAddress);

  // Export contract address and ABI to frontend client
  const clientContractsDir = path.resolve(__dirname, "../../client/src/contracts");
  if (!fs.existsSync(clientContractsDir)) {
    fs.mkdirSync(clientContractsDir, { recursive: true });
  }

  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/HeirloomVault.sol/HeirloomVault.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contractData = {
    address: vaultAddress,
    network: hre.network.name,
    abi: artifact.abi,
  };

  const outputPath = path.join(clientContractsDir, "HeirloomVault.json");
  fs.writeFileSync(outputPath, JSON.stringify(contractData, null, 2));
  console.log(`Contract metadata exported to ${outputPath}`);
  console.log(`Sepolia Etherscan URL: https://sepolia.etherscan.io/address/${vaultAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
