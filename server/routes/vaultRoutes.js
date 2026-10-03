import express from 'express';
import {
  pinVaultPayload,
  indexVault,
  getVaultsByUser,
  getVaultById,
  syncVaultState,
  getVaultPayload,
} from '../controllers/vaultController.js';

const router = express.Router();

// Storage proxy route (IPFS / Pinata)
router.post('/pin', pinVaultPayload);
router.get('/payload/:ipfsHash', getVaultPayload);

// Vault metadata indexing & querying
router.post('/index', indexVault);
router.get('/user/:address', getVaultsByUser);
router.get('/:vaultId', getVaultById);
router.patch('/:vaultId/sync', syncVaultState);

export default router;
