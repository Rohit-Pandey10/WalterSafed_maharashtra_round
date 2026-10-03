# Heirloom Protocol — Agent & Architecture Guidelines

Heirloom is a trust-minimized, non-custodial digital inheritance protocol implementing a dead man's switch mechanism with guardian multi-signature attestation, browser-native client-side AES-GCM-256 encryption, and IPFS persistence.

## System Architecture

```
[ Client (React + Vite + Web Crypto) ]
      │
      ├── (1. PBKDF2 + AES-GCM-256 Client-Side Encryption)
      │
      ├── (2. IPFS Envelope Pinning) ───────> [ Storage Proxy (Pinata / Mock IPFS) ]
      │
      ├── (3. Smart Contract Deployment) ───> [ HeirloomVault.sol (Sepolia / Hardhat) ]
      │                                                │
      └── (4. Vault Metadata Indexing)                 │ (Heartbeat / Grace Period Loop)
                    │                                  ▼
                    ▼                          [ Sentinel Service ]
          [ MongoDB Atlas Cluster ] <──────────────────┘ (Automated Scanner)
```

## Repository Structure

- `contracts/`: Solidity `^0.8.20` smart contracts, OpenZeppelin `ReentrancyGuard`, Hardhat test suites, and multi-network deployment scripts (`deploy.cjs`).
- `server/`: Express 5 REST API gateway, Mongoose models (`VaultRecord.js`), Sentinel background cron scanner (`sentinelService.js`), Pinata IPFS proxy (`storageService.js`), and E2E integration test suite (`scripts/testEndToEnd.js`).
- `client/`: React 19 frontend application styled with Tailwind CSS, browser Web Crypto engine (`utils/crypto.js`), Ethers v6 contract hook (`hooks/useHeirloomVault.js`), role dashboard data hook (`hooks/useDashboardData.js`), and wallet context (`context/WalletContext.jsx`).

## Essential Commands

```bash
# Install dependencies across services
npm install --prefix contracts
npm install --prefix server
npm install --prefix client

# Run Smart Contract Test Suite (14 passing tests)
cd contracts && npx hardhat test

# Run Crypto Engine Verification Suite (4 passing tests)
cd server && node scripts/testCrypto.js

# Run Automated End-to-End Integration Suite (All 6 stages)
cd server && npm run test:e2e

# Start Backend API Server (Port 5001)
cd server && npm start

# Start Frontend Dev Server (Port 5173)
cd client && npm run dev
```

## Security & Privacy Guarantee

- **Zero-Knowledge Storage**: Secrets are encrypted in the user's browser using Web Crypto API (`window.crypto.subtle`) with AES-GCM-256 and PBKDF2 (100,000 iterations of SHA-256) before any data is sent over the network.
- **No Private Keys Stored**: Server and IPFS gateways only store opaque ciphertext blobs. Plaintext is only decryptable by the beneficiary holding the decryption secret upon on-chain consensus.
