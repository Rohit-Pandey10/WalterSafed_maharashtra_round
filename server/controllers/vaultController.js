import { VaultRecord } from '../models/VaultRecord.js';
import { isDBConnected } from '../config/db.js';
import storageService from '../services/storageService.js';

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
    } = req.body;

    if (vaultId === undefined || vaultId === null || !ownerAddress || !beneficiaryAddress || !ipfsHash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required vault fields: vaultId, ownerAddress, beneficiaryAddress, and ipfsHash are required',
      });
    }

    const normalizedGuardians = Array.isArray(guardians)
      ? guardians.map((g) => (typeof g === 'string' ? g.toLowerCase().trim() : g))
      : [];

    const vaultData = {
      vaultId: Number(vaultId),
      ownerAddress: ownerAddress.toLowerCase().trim(),
      beneficiaryAddress: beneficiaryAddress.toLowerCase().trim(),
      guardians: normalizedGuardians,
      guardianThreshold: guardianThreshold ? Number(guardianThreshold) : 1,
      title: title || 'Digital Inheritance Vault',
      description: description || '',
      ipfsHash: ipfsHash.trim(),
      heartbeatInterval: heartbeatInterval ? Number(heartbeatInterval) : 180,
      lastKnownHeartbeat: lastKnownHeartbeat ? new Date(lastKnownHeartbeat) : new Date(),
      status: status || 'Active',
      updatedAt: new Date(),
    };

    let savedVault;

    if (isDBConnected()) {
      savedVault = await VaultRecord.findOneAndUpdate(
        { vaultId: Number(vaultId) },
        { $set: vaultData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      savedVault = {
        ...vaultData,
        createdAt: mockVaultStore.get(Number(vaultId))?.createdAt || new Date(),
        _id: `mock-${vaultId}`,
      };
      mockVaultStore.set(Number(vaultId), savedVault);
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
 * @desc Synchronize/update vault status, heartbeat, or approvals count
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

    const updates = { ...req.body, updatedAt: new Date() };

    if (updates.lastKnownHeartbeat) {
      updates.lastKnownHeartbeat = new Date(updates.lastKnownHeartbeat);
    }

    let updatedVault;

    if (isDBConnected()) {
      updatedVault = await VaultRecord.findOneAndUpdate(
        { vaultId: numericId },
        { $set: updates },
        { new: true }
      );
    } else {
      const existing = mockVaultStore.get(numericId);
      if (existing) {
        updatedVault = { ...existing, ...updates };
        mockVaultStore.set(numericId, updatedVault);
      }
    }

    if (!updatedVault) {
      return res.status(404).json({
        success: false,
        error: `Vault #${vaultId} not found for sync update`,
      });
    }

    return res.status(200).json({
      success: true,
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

