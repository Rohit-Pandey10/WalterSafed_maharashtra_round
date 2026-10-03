import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/keys.js';

// Resilient in-memory store for mock/offline IPFS payloads
const mockIpfsStore = new Map();

/**
 * Generate deterministic mock IPFS CIDv1 from payload content
 */
const generateMockCid = (data) => {
  const hash = crypto
    .createHash('sha256')
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
  return `bafkrei${hash.slice(0, 46)}`;
};

/**
 * Upload encrypted payload to IPFS via Pinata or Mock Storage Fallback
 * @param {object|string} encryptedData The encrypted secret payload
 * @param {object} metadata Optional metadata tags for Pinata pinning
 * @returns {Promise<{ ipfsHash: string, isMock: boolean, pinSize?: number }>}
 */
export const uploadEncryptedPayload = async (encryptedData, metadata = {}) => {
  if (!encryptedData) {
    throw new Error('No encrypted data provided for storage');
  }

  const payload = {
    encryptedData,
    timestamp: new Date().toISOString(),
    metadata: metadata || {},
  };

  if (config.pinata.isConfigured) {
    try {
      const headers = {};
      if (config.pinata.jwt) {
        headers['Authorization'] = `Bearer ${config.pinata.jwt}`;
      } else {
        headers['pinata_api_key'] = config.pinata.apiKey;
        headers['pinata_secret_api_key'] = config.pinata.secretKey;
      }

      const body = {
        pinataOptions: {
          cidVersion: 1,
        },
        pinataMetadata: {
          name: metadata.title || `heirloom-vault-${Date.now()}`,
          keyvalues: {
            app: 'heirloom-protocol',
            ...metadata,
          },
        },
        pinataContent: payload,
      };

      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        body,
        { headers, timeout: 8000 }
      );

      const ipfsHash = response.data.IpfsHash;
      // Also cache in local memory for zero-latency retrieval
      mockIpfsStore.set(ipfsHash, payload);

      return {
        ipfsHash,
        isMock: false,
        pinSize: response.data.PinSize,
        timestamp: response.data.Timestamp,
      };
    } catch (error) {
      console.warn(
        `[Storage Service Warning] Pinata upload failed (${error.message}). Falling back to local mock storage.`
      );
    }
  } else {
    console.log(
      '[Storage Service] Pinata credentials not provided. Using resilient local mock IPFS storage.'
    );
  }

  // Resilient mock hash fallback
  const mockCid = generateMockCid(payload);
  mockIpfsStore.set(mockCid, payload);

  return {
    ipfsHash: mockCid,
    isMock: true,
    pinSize: JSON.stringify(payload).length,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Fetch encrypted payload from IPFS / Pinata Gateway or Local Cache
 * @param {string} ipfsHash IPFS CID or mock hash
 * @returns {Promise<object>} The stored encrypted payload
 */
export const fetchEncryptedPayload = async (ipfsHash) => {
  if (!ipfsHash) {
    throw new Error('IPFS hash is required');
  }

  // 1. Check local cache first
  if (mockIpfsStore.has(ipfsHash)) {
    return mockIpfsStore.get(ipfsHash);
  }

  // 2. Fetch from IPFS gateways
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
    `https://ipfs.io/ipfs/${ipfsHash}`,
    `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
    `https://dweb.link/ipfs/${ipfsHash}`,
  ];

  for (const url of gateways) {
    try {
      const response = await axios.get(url, { timeout: 4000 });
      if (response.data) {
        mockIpfsStore.set(ipfsHash, response.data);
        return response.data;
      }
    } catch {
      // Try next gateway
      continue;
    }
  }

  throw new Error(`Failed to fetch IPFS payload for hash: ${ipfsHash}`);
};

export default {
  uploadEncryptedPayload,
  fetchEncryptedPayload,
};
