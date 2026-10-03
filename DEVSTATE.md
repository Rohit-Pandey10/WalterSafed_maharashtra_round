# Heirloom Protocol — Development State & Tracking

## Current Status: Milestone 4 Completed (End-to-End Protocol & Integration Test Suite)

### Milestone 1: HeirloomVault Contract & Deployment Setup

- [x] **Smart Contract (`contracts/contracts/HeirloomVault.sol`)**:
  - Implemented with Solidity `^0.8.20` and OpenZeppelin `ReentrancyGuard`.
  - Enum `VaultStatus` with 5 states: `Active`, `InGracePeriod`, `Approved`, `Claimed`, `Cancelled`.
  - Core methods: `createVault`, `heartbeat` (with grace period recovery), `triggerInactivity`, `attestVault` (guardian multisig approval), `claimVault` (`nonReentrant`).
  - View methods: `getVault`, `getGuardians`, `isGuardian`, `hasApproved`.
  - Events: `VaultCreated`, `Heartbeat`, `InactivityTriggered`, `GuardianAttested`, `VaultApproved`, `VaultClaimed`, `VaultCancelled`.
- [x] **Deployment Script (`contracts/scripts/deploy.cjs`)**:
  - Deploys `HeirloomVault` and automatically exports ABI + contract address to `client/src/contracts/HeirloomVault.json`.
- [x] **Automated Test Suite (`contracts/test/HeirloomVault.test.cjs`)**:
  - Unit tests staged for vault creation, timer resets, inactivity triggers, guardian multisig thresholds, and claim protection.
- [x] **Compilation**: Verified clean compilation with zero errors.

---

### Milestone 2: Backend Services, Storage Proxy & Vault Indexer

- [x] **Environment Configuration**:
  - `server/.env.example` with `PORT`, `MONGO_URI`, `PINATA_API_KEY`, `PINATA_SECRET_KEY`, `PINATA_JWT`, and `JWT_SECRET`.
  - `server/config/keys.js` with dynamic Pinata detection and fallback mode.
  - `server/config/db.js` with graceful connection handling and memory fallback.
- [x] **Mongoose Schema (`server/models/VaultRecord.js`)**:
  - Indexed fields: `vaultId`, `ownerAddress`, `beneficiaryAddress`, `guardians`, `guardianThreshold`, `title`, `description`, `ipfsHash`, `heartbeatInterval`, `lastKnownHeartbeat`, `status`.
  - Compound indexes for fast role queries by wallet address.
- [x] **Storage Proxy Service (`server/services/storageService.js`)**:
  - `uploadEncryptedPayload(encryptedData, metadata)`: Live Pinata IPFS pinning with automatic fallback to deterministic mock CID generation & caching.
  - `fetchEncryptedPayload(ipfsHash)`: Multi-gateway resolution + local cache lookup.
- [x] **REST API Routes (`server/routes/vaultRoutes.js` mounted at `/api/v1/vaults`)**:
  - `POST /api/v1/vaults/pin`: Pin encrypted payload to IPFS/Mock.
  - `POST /api/v1/vaults/index`: Index newly minted vault record into MongoDB.
  - `GET /api/v1/vaults/user/:address`: Query vaults associated with an address as Owner, Beneficiary, or Guardian.
  - `GET /api/v1/vaults/:vaultId`: Fetch single vault metadata by ID.
  - `PATCH /api/v1/vaults/:vaultId/sync`: Synchronize vault status/heartbeat from blockchain state.
  - `GET /api/v1/vaults/payload/:ipfsHash`: Retrieve stored encrypted payload.

---

### Milestone 2.5: Backend Sentinel Monitor, Aggregated Dashboard APIs & Seeder

- [x] **Sentinel Cron Service (`server/services/sentinelService.js`)**:
  - Automated 30-second heartbeat scanner.
  - Queries `Active` vaults and checks if `Date.now() > lastKnownHeartbeat + heartbeatInterval`.
  - Triggers and verifies `triggerInactivity` on-chain first (`triggerOnchainInactivity` / `fetchOnchainVault`); only transitions MongoDB records to `InGracePeriod` after on-chain confirmation.
  - If the on-chain transaction fails or reverts, database mutation is suppressed, preserving blockchain-first consistency.
  - Exported `startSentinel()` wired into `server/server.js` following database initialization.
- [x] **Dashboard Aggregation Endpoint (`server/controllers/dashboardController.js` & `server/routes/dashboardRoutes.js`)**:
  - `GET /api/v1/dashboard/:address`: Returns role-segregated vaults (`ownedVaults`, `guardianVaults`, `beneficiaryVaults`) and computed summary stats (`totalOwned`, `pendingGuardianApprovals`, `claimableVaults`).
- [x] **Database Seeder (`server/scripts/seed.js`)**:
  - Populates MongoDB with 3 realistic testing vaults (Active countdown, InGracePeriod awaiting guardian attestations, and Approved awaiting beneficiary claim).
  - Added `"seed": "node scripts/seed.js"` script to `server/package.json`.
- [x] **Syntax & Module Verification**: Verified clean with `node --check`.

---

### Milestone 2.6: Client-Side Cryptographic Engine (Web Crypto AES-GCM-256)

- [x] **Key Derivation & Web Crypto Engine (`client/src/utils/crypto.js`)**:
  - Browser-native PBKDF2 key derivation using 100,000 SHA-256 iterations and random 16-byte salt (`crypto.getRandomValues`).
  - Zero-dependency client-side AES-GCM-256 encryption (`encryptPayload`) and decryption (`decryptPayload`).
  - Formats payloads into structured `{ version, algorithm, salt, iv, ciphertext }` base64 envelopes ready for IPFS pinning via `/api/v1/vaults/pin`.
  - Comprehensive error handling for invalid passphrases, malformed JSON, and tampered ciphertext.
- [x] **Isolated Verification Test Suite (`server/scripts/testCrypto.js`)**:
  - Verified 4/4 test suites passing: plaintext string roundtrip, complex JSON object encryption, bad passphrase rejection, and tampered ciphertext detection.

---

### Milestone 2.7: Web3 Wallet Provider & Contract Hook Bridge (`client/src`)

- [x] **Web3 Client Dependency**:
  - `ethers@^6.17.0` integrated into `client/package.json`.
- [x] **Wallet Context & Provider (`client/src/context/WalletContext.jsx`)**:
  - React Context exposing `account` (lowercase), `isConnected`, `chainId`, `isCorrectNetwork` (Hardhat 31337 / Sepolia 11155111), `provider`, `signer`.
  - Actions: `connectWallet()`, `disconnectWallet()`, and `switchNetwork()`.
  - Subscribes dynamically to `accountsChanged` and `chainChanged` events with automated state hydration.
  - Exported `useWallet()` custom hook and wrapped `<App />` in `client/src/main.jsx`.
- [x] **Heirloom Contract Integration Hook (`client/src/hooks/useHeirloomVault.js`)**:
  - Deployed contract artifact & ABI connected via `client/src/contracts/HeirloomVault.json`.
  - Full async mutation methods: `createVault` (supports positional or object arguments, parses `vaultId`), `pingHeartbeat`, `attestVault`, `claimVault`, `triggerInactivity`.
  - View methods: `getVault`, `getGuardians`, `isGuardian`, `hasApproved`.
  - State tracking: `isTransacting`, `txHash`, and human-readable contract revert error parser (`parseContractError`).
- [x] **Dashboard Data Hook (`client/src/hooks/useDashboardData.js`)**:
  - Automatically fetches role-segregated vault data and aggregated summary stats from `/api/v1/dashboard/:address` (with dual-port resilience 5001 / 5000).
  - Returns `{ data, loading, error, refresh() }`.

---

### Milestone 2.8: Multi-Network Configuration for Live Testnet Deployment (`contracts/`)

- [x] **Hardhat Multi-Network Config (`contracts/hardhat.config.cjs` & `contracts/hardhat.config.js`)**:
  - Integrated `dotenv` to load environment variables from `contracts/.env` or root `.env`.
  - Configured `sepolia` testnet (`chainId: 11155111`, `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY` with automated `0x` formatting) and `localhost` (`chainId: 31337`).
  - Retained `defaultNetwork: "hardhat"` for rapid, isolated unit testing.
  - Added optional `etherscan` block with `ETHERSCAN_API_KEY` for on-chain contract verification.
- [x] **Environment Template (`contracts/.env.example`)**:
  - Provided variables for `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and `ETHERSCAN_API_KEY`.
- [x] **Deployment Pipeline Verification (`contracts/scripts/deploy.cjs`)**:
  - Automatically exports contract address and ABI to `client/src/contracts/HeirloomVault.json`.
  - Outputs live Sepolia Etherscan address link upon deployment.
  - Verified: 14/14 smart contract unit tests passing, deployment verified cleanly.

---

### Milestone 3: Figma UI Cockpit Integration & Live Web3/Backend Wiring (`client/`)

- [x] **Component Architecture & Styling Integration**:
  - Extracted and merged all Figma UI components into `client/src/components/`:
    - [`Navbar.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/Navbar.tsx): Web3 wallet connection, chain status indicator, and dynamic role navigation tabs (`all`, `owner`, `guardian`, `beneficiary`).
    - [`MetricsRow.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/MetricsRow.tsx): Role-aggregated statistics dynamically populated from `/api/v1/dashboard/:address` (`totalOwned`, `pendingGuardianApprovals`, `claimableVaults`).
    - [`VaultCard.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/VaultCard.tsx): Interactive vault card with live heartbeat window countdowns, quorum progress bars, and role-specific action buttons (`Ping Heartbeat`, `Recover`, `Attest & Approve`, `Claim & Decrypt`).
    - [`CreateVaultModal.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/CreateVaultModal.tsx): Complete inheritance creation modal with guardian configuration, quorum slider, and client-side encryption hooks.
    - [`SecretPayloadViewer.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/SecretPayloadViewer.tsx): IPFS payload resolver with Web Crypto decryption key derivation and one-click clipboard copying.
    - [`Toast.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/Toast.tsx) & [`EmptyState.tsx`](file:///Users/rohitpandey/Code/WalterSafed_maharashtra_round/client/src/components/EmptyState.tsx): Real-time transaction feedback and zero-state views.
  - Enhanced styling in `client/src/index.css` and `client/tailwind.config.js` with Google Fonts (`DM Sans`, `Manrope`), input fields, and custom scrollbar utilities.
- [x] **Live Web3 & Backend Infrastructure Wiring (`client/src/App.jsx`)**:
  - **Wallet & Chain State**: Integrated `useWallet()` for connection, disconnect, address formatting, and multi-network status tracking.
  - **Aggregated Dashboard**: Connected `useDashboardData()` to automatically fetch, format, and render vaults from `/api/v1/dashboard/:address`.
  - **On-Chain Vault Creation Pipeline**:
    1. Encrypts plaintext secret client-side via `encryptPayload` (AES-GCM-256 + 100k iteration PBKDF2).
    2. Pins encrypted JSON envelope to IPFS via `/api/v1/vaults/pin`.
    3. Deploys vault on-chain via smart contract `createVault(...)`.
    4. Indexes record into MongoDB via `/api/v1/vaults/index`.
  - **On-Chain Action Triggers**:
    - `Ping Heartbeat` & `Recover` -> `contract.heartbeat(vaultId)` + `/api/v1/vaults/:vaultId/sync`.
    - `Attest & Approve` -> `contract.attestVault(vaultId)` + `/api/v1/vaults/:vaultId/sync`.
    - `Claim Vault` -> `contract.claimVault(vaultId)` + `/api/v1/vaults/:vaultId/sync` + auto-launch `SecretPayloadViewer`.
  - **Scenario Lab**: Embedded interactive simulator allowing instant testing of all roles and states without requiring live network gas.
- [x] **Compilation & Integrity Verification**:
  - Maintained complete integrity of all underlying crypto, contract, and hook files.
  - Verified `npm run build` succeeds cleanly: 2,110 modules transformed, 0 errors.

---

### Milestone 4: End-to-End Protocol & Integration Test Suite (`server/scripts/testEndToEnd.js`)

- [x] **Automated Verification Harness (`server/scripts/testEndToEnd.js`)**:
  - Added `"test:e2e": "node scripts/testEndToEnd.js"` to `server/package.json`.
  - Connects client Web Crypto engine, live backend APIs (`http://localhost:5001`), MongoDB database, and Ethereum smart contract layer.
- [x] **All 6 Protocol Lifecycle Stages Verified**:
  - **Stage 1 (Client Crypto & IPFS Pinning)**: Client-side AES-GCM-256 encryption using PBKDF2 (100k iterations) and HTTP POST to `/api/v1/vaults/pin`.
  - **Stage 2 (Smart Contract Vault Minting)**: Executed `createVault(...)`, parsed `VaultCreated` event from block receipt, and validated initial on-chain `Active (0)` state.
  - **Stage 3 (Metadata Indexing & Dashboard Sync)**: Indexed metadata via `/api/v1/vaults/index` and verified presence in `/api/v1/dashboard/:ownerAddress` (`ownedVaults`).
  - **Stage 4 (Owner Heartbeat Reset)**: Executed `heartbeat(vaultId)` on-chain, refreshed `lastHeartbeat` timestamp, and synced state via `/api/v1/vaults/:vaultId/sync`.
  - **Stage 5 (Inactivity & Guardian Quorum Consensus)**: Simulated blockchain time-travel (`evm_increaseTime`), triggered grace period (`InGracePeriod`), submitted guardian attestation (`attestVault`), and verified status transitioned to `Approved (2)`.
  - **Stage 6 (Beneficiary Claim & Decryption)**: Executed beneficiary claim on-chain (`claimVault`), transitioned to `Claimed (3)`, fetched encrypted payload from `/api/v1/vaults/payload/:ipfsHash`, and decrypted payload with passphrase to verify 100% byte-for-byte fidelity with the original master seed phrase.
- [x] **Test Execution**: Verified all 6 stages passing cleanly in 1.75s.
- [x] **Full-Stack MongoDB Persistence Wiring**:
  - Wired `CreateVaultModal` to execute client-side AES-GCM-256 encryption, IPFS pinning, and direct persistence to MongoDB via `POST /api/v1/vaults/index`.
  - Configured `useDashboardData` to default to `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` on page load/refresh, ensuring real MongoDB records persist and render seamlessly across reloads.
  - Replaced static array placeholders in `App.jsx` with live MongoDB records.
- [x] **Web3 UX: Automatic Network Switching & Global "All Vaults" View**:
  - **Automatic EIP-3085 / EIP-3326 Switcher (`WalletContext.jsx`)**: Verifies connection chain ID (`0xaa36a7` Sepolia or `0x7a69` Hardhat); prompts automated switch to Sepolia via `wallet_switchEthereumChain` and handles code `4902` by automatically adding Sepolia RPC/explorer metadata via `wallet_addEthereumChain`.
  - **Global Protocol Vault View (`useDashboardData.js` & `App.jsx`)**: When the "All vaults" tab is selected, fetches from `GET /api/v1/vaults` to show all seeded and minted vaults across the network. Strictly isolates role-based views (`ownedVaults`, `guardianVaults`, `beneficiaryVaults`) when respective tabs are clicked.

---

### Milestone 5: Architecture Integrity, On-Chain Cancellation & Trust Boundary

- [x] **Smart Contract On-Chain Cancellation (`contracts/contracts/HeirloomVault.sol`)**:
  - Implemented `cancelVault(uint256 _vaultId)` restricted to `vault.owner`.
  - Enforced eligibility check: can only cancel from `Active` or `InGracePeriod` states.
  - Emits `VaultCancelled(vaultId, owner, timestamp)` and sets status to `VaultStatus.Cancelled (4)`.
  - Cancelled vaults strictly reject any further heartbeat pings, inactivity triggers, guardian attestations, or beneficiary claims.
- [x] **Comprehensive Contract Unit Tests (`contracts/test/HeirloomVault.test.cjs`)**:
  - Added test suite for `cancelVault`: verified owner can cancel from `Active` and `InGracePeriod`; non-owner callers revert with `NotOwner`; cancelled vaults revert guardian attestations, beneficiary claims, duplicate cancellations, and heartbeats with `InvalidVaultStatus`.
  - All 18 tests passing cleanly in ~330ms.
- [x] **Frontend Blockchain Failure Handling (`client/src/App.jsx`)**:
  - In all mutation handlers (`heartbeat`, `attestation`, `claim`, `cancel`), enforced awaiting transaction receipt (`const receipt = await tx.wait()`).
  - Added strict guard: if transaction reverts, errors, or is rejected in MetaMask, execution stops immediately, displaying an error toast with NO `PATCH /api/v1/vaults/:id/sync` call.
  - Only syncs database when `receipt?.status === 1`.
  - For guardian attestation, queries `getVault(numericId)` on-chain to verify whether quorum was truly reached before dispatching state update (`Approved` vs `InGracePeriod`).
- [x] **Elimination of Fallback Vault Creation (`client/src/components/CreateVaultModal.tsx`)**:
  - Removed `Math.floor(1000 + Math.random() * 9000)` fallback vault ID generator completely.
  - Enforced `contractCreateVault` execution and receipt verification (`receipt.status === 1`).
  - If the transaction reverts, throws, or is rejected in MetaMask: execution halts immediately with error toast; `POST /api/v1/vaults/index` is NEVER called, preventing ghost or unverified records from ever entering MongoDB.
  - When disconnected from wallet, only allows deterministic demo IDs if demo mode is explicitly enabled (`VITE_ENABLE_DEMO === 'true'` or `heirloom_demo_mode`).
- [x] **Heartbeat Interval Unit Conversion (`client/src/components/CreateVaultModal.tsx`)**:
  - Standardized interval option conversion to strictly pass integer seconds to smart contracts and database:
    - 30 days: `30 * 86400` = `2592000` seconds
    - 90 days: `90 * 86400` = `7776000` seconds
    - 180 days: `180 * 86400` = `15552000` seconds
    - 365 days: `365 * 86400` = `31536000` seconds
    - Demo (180s): `180` seconds explicitly.
- [x] **Backend `/sync` Security Lockdown & Deprecation of Fallbacks (`server/controllers/vaultController.js`)**:
  - Stripped `x-contract-address` header and body `contractAddress` injection completely; binds strictly to verified contract deployment address.
  - Eliminated unverified `ALLOWED_STATUS_TRANSITIONS` fallback that allowed trusting client-supplied status when RPC failed.
  - Requires on-chain verification via `contract.getVault(numericId)`. Returns HTTP `503 Service Unavailable` (`{ success: false, error: "Blockchain verification unavailable. State sync rejected." }`) if blockchain verification fails.
  - Updates MongoDB strictly with values retrieved directly from on-chain state (`onchain.status`, `onchain.approvalsCount`, `onchain.lastHeartbeat`).
- [x] **Guard Sentinel InGracePeriod Transition (`server/services/sentinelService.js`)**:
  - When heartbeat expiration is detected, dispatches `triggerOnchainInactivity(vault.vaultId)`.
  - If on-chain transaction fails: suppresses DB transition, logs `[SENTINEL WARNING] On-chain inactivity trigger failed for Vault #${vault.vaultId}. Suppressing DB transition.`, and continues to next vault.
  - Only updates `vault.status = 'InGracePeriod'` and `vault.save()` after verified on-chain confirmation or reading verified on-chain state.
- [x] **Static Provider & E2E JSON-RPC Test Harness (`server/services/chainService.js` & `server/scripts/testEndToEnd.js`)**:
  - Configured ethers `JsonRpcProvider` with `staticNetwork: true` to prevent infinite network auto-detection retry loops.
  - Integrated zero-dependency in-process HTTP JSON-RPC bridge in `testEndToEnd.js` on port 8545 to allow the backend server on port 5001 to verify real on-chain Hardhat state during automated test execution.
- [x] **Verification Suite**:
  - Hardhat Unit Tests: 18/18 passing (344ms).
  - Crypto Engine Verification: 4/4 passing (AES-GCM-256 roundtrip, JSON payloads, tamper rejection).
  - End-to-End Protocol Suite (`npm run test:e2e`): All 6 stages passing cleanly in 1.65s.
  - Client Build: `vite build` completed cleanly with 0 compilation errors (586kB bundle).

---

### Milestone 6: Decoupled Blockchain State Pattern & Client Resilience

- [x] **Decoupled Blockchain-First State Execution (`client/src/App.jsx`)**:
  - **Single Source of Truth**: Smart contract transactions mined on Ethereum/Sepolia (`receipt.status === 1`) are permanent, non-custodial, and authoritative. Off-chain MongoDB indexing is strictly an eventual read-cache.
  - **Independent Transaction Pipeline**:
    1. **Execute On-Chain**: Dispatches transaction and awaits block confirmation (`await tx.wait()`).
    2. **On-Chain Failure Boundary**: If the transaction reverts or is rejected in MetaMask (`!receipt || receipt.status !== 1`), execution halts immediately. An error toast is displayed: `"Transaction failed on blockchain."` with 0 database sync attempted.
    3. **Immediate On-Chain Success**: The instant `receipt.status === 1` is confirmed, the action is marked as successful in the UI with toast: `"Transaction confirmed on-chain!"`.
    4. **Optimistic Local State Update**: UI immediately updates local vault status (and re-verifies quorum via `contract.getVault(numericId)` for guardian attestations) so the interface reflects on-chain truth without depending on network API latency.
    5. **Isolated Off-Chain Sync**: Attempts `PATCH /api/v1/vaults/${numericId}/sync` inside an isolated `try/catch`. If network drops, timeout occurs, or MongoDB indexing fails, it logs a warning and notifies `"Blockchain updated successfully. Database index sync pending."` with a warning toast. It NEVER marks the confirmed on-chain action as failed.
  - **Applied Mutation Handlers**:
    - `pingHeartbeat` (Active reset & heartbeat timestamp update)
    - `attestVault` (Guardian quorum evaluation & InGracePeriod -> Approved transition)
    - `claimVault` (Release authorization & automatic secret payload decryptor opening)
    - `cancelVault` (Owner revocation & state transition to Cancelled)
- [x] **Post-Attestation Blockchain Read Failure Resilience (`client/src/App.jsx`)**:
  - Eliminated fallback inference of blockchain state (`approvalsCount` / `status`) from MongoDB when post-transaction `getVault()` reads fail.
  - Keeps last known state and notifies user that the transaction was confirmed on-chain while state sync is pending.
- [x] **Smart Contract Metadata Verification for `/index` (`server/controllers/vaultController.js`)**:
  - `POST /api/v1/vaults/index` strictly queries `fetchOnchainVault(numericId)` before writing to MongoDB.
  - Verifies `vaultId`, normalized `ownerAddress`, normalized `beneficiaryAddress`, `guardianThreshold`, normalized `guardians`, `heartbeatInterval`, `ipfsHash`, and `status`. Rejects mismatches with 400.
- [x] **Untrusted `txHash` Protection (`server/controllers/vaultController.js` & `server/services/chainService.js`)**:
  - Added `verifyTxHashOnchain` to independently verify transaction receipts on-chain.
  - Rejects arbitrary client-supplied hashes and preserves existing trusted transaction hashes.
- [x] **Toast & UI Notification System (`client/src/components/Toast.tsx` & `client/src/types.ts`)**:
  - Expanded `ToastState` union to support `success` and `warning` types alongside `confirmed`, `failed`, and `pending`.
  - Added Lucide `AlertTriangle` with amber warning styling and `CheckCircle2` with emerald success styling.

---

### Current Architecture: Decoupled Blockchain-First Source of Truth

```
[ Client (React 19 + Vite + Web Crypto) ]
      │
      ├── (1. PBKDF2 + AES-GCM-256 Client-Side Encryption)
      │
      ├── (2. IPFS Envelope Pinning) ───────> [ Storage Proxy (Pinata / Mock IPFS) ]
      │
      ├── (3. Smart Contract Mutation) ─────> [ HeirloomVault.sol (Sepolia / Hardhat) ]
      │      (Wait for receipt.status === 1)           │
      │      (Immediate UI Confirmation Toast)         │ ─── On-Chain Single Source of Truth ───
      │      (Optimistic Local State Update)           │
      │                                                │ (Heartbeat / Grace Period Loop)
      └── (4. Decoupled Non-Blocking Index Sync)       ▼
             (PATCH /api/v1/vaults/:id/sync)    [ Sentinel Service ]
             (Catch error -> Warning Toast)            │ (Relayer triggerInactivity verified on-chain
                    │                                  │  BEFORE updating database status)
                    ▼                                  ▼
          [ MongoDB Atlas Cluster ] <──────────────────┘
```

---

### Upcoming Milestones

- **Live Hackathon Demo & Multi-Party Journey**: End-to-end verification across 3 distinct MetaMask browser profiles (Owner, Guardian, Beneficiary) on Ethereum Sepolia testnet.

