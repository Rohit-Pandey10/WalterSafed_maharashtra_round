import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/keys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read contract artifact from client/src/contracts/HeirloomVault.json
const artifactPath = path.resolve(__dirname, '../../client/src/contracts/HeirloomVault.json');
let artifact = { address: '', abi: [] };
try {
  if (fs.existsSync(artifactPath)) {
    artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  }
} catch (e) {
  console.warn('[ChainService] Could not load contract artifact:', e.message);
}

export const STATUS_MAP = ['Active', 'InGracePeriod', 'Approved', 'Claimed', 'Cancelled'];

/**
 * Creates an active JsonRpcProvider configured for local Hardhat or Sepolia
 */
export const getProvider = () => {
  const rpcUrl = config.rpcUrl || 'https://ethereum-sepolia-rpc.publicnode.com';
  const isLocal = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost') || rpcUrl.includes('8545');
  const chainId = isLocal ? 31337 : 11155111;

  return new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
};

/**
 * Returns an instantiated contract connected to the RPC provider or signer
 */
export const getContractInstance = (signerOrProvider = null) => {
  const activeProvider = signerOrProvider || getProvider();

  let contractAddress = process.env.CONTRACT_ADDRESS || config.contractAddress || artifact.address;

  // If running against local Hardhat node and no custom address is specified, use Hardhat deployment address
  const rpcUrl = config.rpcUrl || '';
  const isLocal = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost') || rpcUrl.includes('8545');
  if (isLocal && !process.env.CONTRACT_ADDRESS) {
    contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  } else if (!contractAddress) {
    contractAddress = '0xeD889820174F4B2502f81953e2304Bf9758DfaA3';
  }

  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error(`Invalid or missing contract address: ${contractAddress}`);
  }

  return new ethers.Contract(contractAddress, artifact.abi, activeProvider);
};

/**
 * Query actual on-chain vault state from smart contract
 * Strictly uses configured contract address — no arbitrary address overrides permitted
 */
export const fetchOnchainVault = async (vaultId) => {
  try {
    const contract = getContractInstance();
    const [v, guardians] = await Promise.all([
      contract.getVault(BigInt(vaultId)),
      contract.getGuardians(BigInt(vaultId)),
    ]);

    const statusCode = Number(v.status);
    return {
      success: true,
      data: {
        id: Number(v.id),
        owner: (v.owner || '').toLowerCase(),
        beneficiary: (v.beneficiary || '').toLowerCase(),
        ipfsHash: v.ipfsHash,
        lastHeartbeat: new Date(Number(v.lastHeartbeat) * 1000),
        heartbeatInterval: Number(v.heartbeatInterval),
        guardianThreshold: Number(v.guardianThreshold),
        approvalsCount: Number(v.approvalsCount),
        guardians: Array.isArray(guardians)
          ? guardians.map((g) => (typeof g === 'string' ? g.toLowerCase() : ''))
          : [],
        status: STATUS_MAP[statusCode] || 'Active',
        statusCode,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch vault from smart contract',
    };
  }
};

/**
 * Verify whether a given transaction hash is an authentic, successful transaction
 * on the HeirloomVault smart contract
 */
export const verifyTxHashOnchain = async (txHash) => {
  if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x') || txHash.length !== 66) {
    return { valid: false, reason: 'Invalid transaction hash format' };
  }

  try {
    const provider = getProvider();
    const contract = getContractInstance();
    const targetAddress = (contract.target || (await contract.getAddress())).toLowerCase();

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return { valid: false, reason: 'Transaction receipt not found or transaction reverted on-chain' };
    }

    if (receipt.to && receipt.to.toLowerCase() !== targetAddress) {
      return { valid: false, reason: 'Transaction destination does not match HeirloomVault contract' };
    }

    return { valid: true, receipt };
  } catch (err) {
    return { valid: false, reason: err.message || 'Failed to verify transaction on-chain' };
  }
};

/**
 * Relayer triggers on-chain inactivity when heartbeat interval expires
 */
export const triggerOnchainInactivity = async (vaultId) => {
  const privateKey = config.relayerPrivateKey || process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    return {
      success: false,
      error: 'No relayer/deployer private key configured for automated on-chain execution.',
    };
  }

  try {
    const provider = getProvider();
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const signer = new ethers.Wallet(formattedKey, provider);
    const contract = getContractInstance(signer);

    const tx = await contract.triggerInactivity(BigInt(vaultId));
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: tx.hash,
      receipt,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'On-chain triggerInactivity execution failed',
    };
  }
};

export default {
  STATUS_MAP,
  getProvider,
  getContractInstance,
  fetchOnchainVault,
  verifyTxHashOnchain,
  triggerOnchainInactivity,
};
