import { VaultRecord } from '../models/VaultRecord.js';
import { isDBConnected } from '../config/db.js';
import storageService from '../services/storageService.js';
import { fetchOnchainVault, verifyTxHashOnchain } from '../services/chainService.js';

// In-memory store fallback when MongoDB is not connected
const mockVaultStore = new Map();

/**
 * @route POST /api/v1/vaults/pin
 * @desc Pin encrypted payload to IPFS (via Pinata or resilient mock fallback)
 */
export const pinVaultPayload = async (req, res) => {
  try {
    const { encryptedData, metadata } = req.body;

    if (!encryptedData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: encryptedData',
      });
    }

    const result = await storageService.uploadEncryptedPayload(encryptedData, metadata);

    return res.status(200).json({
      success: true,
      data: {
        ipfsHash: result.ipfsHash,
        isMock: result.isMock,
        pinSize: result.pinSize,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    console.error('Error in pinVaultPayload:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to pin payload',
    });
  }
};

/**
 * @route GET /api/v1/vaults/payload/:ipfsHash
 * @desc Retrieve encrypted payload from IPFS or local cache
 */
export const getVaultPayload = async (req, res) => {
  try {
    const { ipfsHash } = req.params;

    if (!ipfsHash) {
      return res.status(400).json({
        success: false,
        error: 'IPFS hash parameter is required',
      });
    }

    const payload = await storageService.fetchEncryptedPayload(ipfsHash);

    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error('Error in getVaultPayload:', error);
    return res.status(404).json({
      success: false,
      error: error.message || 'Encrypted payload not found',
    });
  }
};

/**
 * @route POST /api/v1/vaults/index
 * @desc Create or update indexed vault metadata in database
 */
export const indexVault = async (req, res) => {
  try {
    const {
      vaultId,
      ownerAddress,
      beneficiaryAddress,
      guardians,
      guardianThreshold,
      title,
      description,
      ipfsHash,
      heartbeatInterval,
      lastKnownHeartbeat,
      status,
      txHash,
    } = req.body;

    if (vaultId === undefined || vaultId === null || !ownerAddress || !beneficiaryAddress || !ipfsHash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required vault fields: vaultId, ownerAddress, beneficiaryAddress, and ipfsHash are required',
      });
    }

    const numericId = Number(vaultId);
    if (isNaN(numericId) || numericId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vaultId: must be a positive integer',
      });
    }

    // 1. Fetch the actual vault from the configured HeirloomVault smart contract
    const onchainResult = await fetchOnchainVault(numericId);
    if (!onchainResult.success || !onchainResult.data) {
      return res.status(404).json({
        success: false,
        error: `Vault #${numericId} does not exist on blockchain: ${onchainResult.error || 'VaultNotFound'}`,
      });
    }

    const onchain = onchainResult.data;

    // 2. Verify supplied metadata against actual on-chain vault
    // Normalize Ethereum addresses before comparison so checksum/case differences do not cause false mismatches.
    const normOwner = ownerAddress.toLowerCase().trim();
    const normBeneficiary = beneficiaryAddress.toLowerCase().trim();

    if (onchain.owner !== normOwner) {
      return res.status(400).json({
        success: false,
        error: `Metadata mismatch for ownerAddress: client provided ${ownerAddress}, but on-chain owner is ${onchain.owner}`,
      });
    }

    if (onchain.beneficiary !== normBeneficiary) {
      return res.status(400).json({
        success: false,
        error: `Metadata mismatch for beneficiaryAddress: client provided ${beneficiaryAddress}, but on-chain beneficiary is ${onchain.beneficiary}`,
      });
    }

    if (guardianThreshold !== undefined && guardianThreshold !== null) {
      if (Number(guardianThreshold) !== onchain.guardianThreshold) {
        return res.status(400).json({
          success: false,
          error: `Metadata mismatch for guardianThreshold: client provided ${guardianThreshold}, but on-chain threshold is ${onchain.guardianThreshold}`,
        });
      }
    }

    if (guardians !== undefined && guardians !== null) {
      const clientGuardians = (Array.isArray(guardians) ? guardians : [])
        .map((g) => (typeof g === 'string' ? g.toLowerCase().trim() : ''))
        .filter(Boolean);
      const onchainGuardians = onchain.guardians || [];

      if (clientGuardians.length !== onchainGuardians.length) {
        return res.status(400).json({
          success: false,
          error: `Metadata mismatch for guardians: client provided ${clientGuardians.length} guardians, but on-chain vault has ${onchainGuardians.length}`,
        });
      }

      const onchainSet = new Set(onchainGuardians);
      const allGuardiansMatch = clientGuardians.every((g) => onchainSet.has(g));
      if (!allGuardiansMatch) {
        return res.status(400).json({
          success: false,
          error: 'Metadata mismatch for guardians: provided guardian addresses do not match on-chain guardians',
        });
      }
    }

    if (heartbeatInterval !== undefined && heartbeatInterval !== null) {
      if (Number(heartbeatInterval) !== onchain.heartbeatInterval) {
        return res.status(400).json({
          success: false,
          error: `Metadata mismatch for heartbeatInterval: client provided ${heartbeatInterval}, but on-chain interval is ${onchain.heartbeatInterval}`,
        });
      }
    }

    if (ipfsHash !== undefined && ipfsHash !== null) {
      if (ipfsHash.trim() !== onchain.ipfsHash.trim()) {
        return res.status(400).json({
          success: false,
          error: `Metadata mismatch for ipfsHash: client provided ${ipfsHash}, but on-chain ipfsHash is ${onchain.ipfsHash}`,
        });
      }
    }

    if (status !== undefined && status !== null) {
      if (status !== onchain.status) {
        return res.status(400).json({
          success: false,
          error: `Metadata mismatch for status: client provided ${status}, but on-chain status is ${onchain.status}`,
        });
      }
    }

    // 3. Verify txHash if provided - do not blindly trust client-supplied txHash
    let verifiedTxHash = undefined;
    if (txHash && typeof txHash === 'string') {
      const txCheck = await verifyTxHashOnchain(txHash);
      if (txCheck.valid) {
        verifiedTxHash = txHash;
      } else {
        console.warn(`[Index Warning] Unverified client txHash ignored for Vault #${numericId}: ${txCheck.reason}`);
      }
    }

    // Check existing vault to preserve existing trusted txHash
    let existingVault = null;
    if (isDBConnected()) {
      existingVault = await VaultRecord.findOne({ vaultId: numericId });
    } else {
      existingVault = mockVaultStore.get(numericId);
    }

    const finalTxHash = existingVault?.txHash || verifiedTxHash;

    const vaultData = {
      vaultId: numericId,
      ownerAddress: onchain.owner,
      beneficiaryAddress: onchain.beneficiary,
      guardians: onchain.guardians,
      guardianThreshold: onchain.guardianThreshold,
      approvalsCount: onchain.approvalsCount,
      title: title || 'Digital Inheritance Vault',
      description: description || '',
      ipfsHash: onchain.ipfsHash,
      heartbeatInterval: onchain.heartbeatInterval,
      lastKnownHeartbeat: onchain.lastHeartbeat || (lastKnownHeartbeat ? new Date(lastKnownHeartbeat) : new Date()),
      status: onchain.status,
      updatedAt: new Date(),
    };

    if (finalTxHash) {
      vaultData.txHash = finalTxHash;
    }

    let savedVault;

    if (isDBConnected()) {
      savedVault = await VaultRecord.findOneAndUpdate(
        { vaultId: numericId },
        { $set: vaultData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      savedVault = {
        ...vaultData,
        createdAt: existingVault?.createdAt || new Date(),
        _id: existingVault?._id || `mock-${numericId}`,
      };
      mockVaultStore.set(numericId, savedVault);
    }

    return res.status(200).json({
      success: true,
      data: savedVault,
    });
  } catch (error) {
    console.error('Error in indexVault:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to index vault',
    });
  }
};

/**
 * @route GET /api/v1/vaults/user/:address
 * @desc Get all vaults associated with an address (as owner, beneficiary, or guardian)
 */
export const getVaultsByUser = async (req, res) => {
  try {
    const rawAddress = req.params.address;
    if (!rawAddress) {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required',
      });
    }

    const address = rawAddress.toLowerCase().trim();
    let vaults = [];

    if (isDBConnected()) {
      vaults = await VaultRecord.find({
        $or: [
          { ownerAddress: address },
          { beneficiaryAddress: address },
          { guardians: address },
        ],
      }).sort({ updatedAt: -1 });
    } else {
      vaults = Array.from(mockVaultStore.values()).filter(
        (v) =>
          v.ownerAddress === address ||
          v.beneficiaryAddress === address ||
          (Array.isArray(v.guardians) && v.guardians.includes(address))
      );
    }

    return res.status(200).json({
      success: true,
      data: vaults,
    });
  } catch (error) {
    console.error('Error in getVaultsByUser:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user vaults',
    });
  }
};

/**
 * @route GET /api/v1/vaults/:vaultId
 * @desc Retrieve vault details by vault ID
 */
export const getVaultById = async (req, res) => {
  try {
    const { vaultId } = req.params;
    const numericId = Number(vaultId);

    if (isNaN(numericId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vault ID provided',
      });
    }

    let vault;

    if (isDBConnected()) {
      vault = await VaultRecord.findOne({ vaultId: numericId });
    } else {
      vault = mockVaultStore.get(numericId);
    }

    if (!vault) {
      return res.status(404).json({
        success: false,
        error: `Vault #${vaultId} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: vault,
    });
  } catch (error) {
    console.error('Error in getVaultById:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vault by ID',
    });
  }
};

/**
 * @route PATCH /api/v1/vaults/:vaultId/sync
 * @desc Synchronize/update vault status, heartbeat, or approvals count strictly from verified on-chain state
 */
export const syncVaultState = async (req, res) => {
  try {
    const { vaultId } = req.params;
    const numericId = Number(vaultId);

    if (isNaN(numericId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vault ID provided',
      });
    }

    // 1. Fetch current vault from DB or mock store
    let existingVault = null;
    if (isDBConnected()) {
      existingVault = await VaultRecord.findOne({ vaultId: numericId });
    } else {
      existingVault = mockVaultStore.get(numericId);
    }

    if (!existingVault) {
      return res.status(404).json({
        success: false,
        error: `Vault #${vaultId} not found for sync update`,
      });
    }

    // 2. Query actual verified on-chain state from smart contract
    // Strict requirement: ignore x-contract-address header and body contractAddress injection
    const onchainResult = await fetchOnchainVault(numericId);

    if (!onchainResult.success || !onchainResult.data) {
      console.warn(
        `[Sync Rejection] On-chain verification failed for Vault #${numericId}: ${onchainResult.error}`
      );
      return res.status(503).json({
        success: false,
        error: 'Blockchain verification unavailable. State sync rejected.',
      });
    }

    // 3. Update ONLY with values directly retrieved from on-chain read call
    const onchain = onchainResult.data;
    const safeUpdates = {
      status: onchain.status,
      approvalsCount: onchain.approvalsCount,
      updatedAt: new Date(),
    };

    if (onchain.lastHeartbeat && onchain.lastHeartbeat.getTime() > 0) {
      safeUpdates.lastKnownHeartbeat = onchain.lastHeartbeat;
    }

    // 4. Do not treat client-provided txHash as authoritative.
    // If the backend cannot independently verify a txHash, do not overwrite an existing trusted txHash with a client-supplied arbitrary value.
    // Preserve the existing verified txHash when available.
    if (existingVault.txHash) {
      safeUpdates.txHash = existingVault.txHash;
    } else if (req.body.txHash && typeof req.body.txHash === 'string') {
      const txCheck = await verifyTxHashOnchain(req.body.txHash);
      if (txCheck.valid) {
        safeUpdates.txHash = req.body.txHash;
      } else {
        console.warn(
          `[Sync Warning] Client-supplied txHash rejected for Vault #${numericId}: ${txCheck.reason}`
        );
      }
    }

    let updatedVault;
    if (isDBConnected()) {
      updatedVault = await VaultRecord.findOneAndUpdate(
        { vaultId: numericId },
        { $set: safeUpdates },
        { returnDocument: 'after' }
      );
    } else {
      updatedVault = { ...existingVault, ...safeUpdates };
      mockVaultStore.set(numericId, updatedVault);
    }

    return res.status(200).json({
      success: true,
      message: `Vault #${numericId} synchronized directly from verified on-chain state (${onchain.status})`,
      data: updatedVault,
    });
  } catch (error) {
    console.error('Error in syncVaultState:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync vault state',
    });
  }
};



/**
 * @route GET /api/v1/vaults
 * @desc Retrieve all indexed vaults across all users
 */
export const getAllVaults = async (req, res) => {
  try {
    let vaults = [];
    if (isDBConnected()) {
      vaults = await VaultRecord.find().sort({ updatedAt: -1 });
    } else {
      vaults = Array.from(mockVaultStore.values()).sort((a, b) => (b.vaultId || 0) - (a.vaultId || 0));
    }

    return res.status(200).json({
      success: true,
      data: vaults,
    });
  } catch (error) {
    console.error('Error in getAllVaults:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch all vaults',
    });
  }
};

// Aliases for compatibility
export const pinPayload = pinVaultPayload;
export const getUserVaults = getVaultsByUser;
export const syncVault = syncVaultState;
export const getPayload = getVaultPayload;

export default {
  pinVaultPayload,
  pinPayload,
  getVaultPayload,
  getPayload,
  indexVault,
  getVaultsByUser,
  getUserVaults,
  getVaultById,
  getAllVaults,
  syncVaultState,
  syncVault,
};

