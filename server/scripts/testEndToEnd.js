/**
 * Heirloom Protocol - Automated End-to-End Protocol & Integration Test Suite
 * Executes complete lifecycle across client crypto, IPFS proxy, smart contract, and backend APIs.
 */

import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { encryptPayload, decryptPayload } from '../../client/src/utils/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Hardhat environment pointing to contracts config
process.env.HARDHAT_CONFIG = path.resolve(__dirname, '../../contracts/hardhat.config.cjs');
const hardhatLib = await import('../../contracts/node_modules/hardhat/internal/lib/hardhat-lib.js');
const hre = hardhatLib.default || hardhatLib;

const API_BASE = process.env.API_BASE || 'http://localhost:5001';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function logStage(stage, title) {
  console.log(`\n${colors.cyan}${colors.bright}======================================================================${colors.reset}`);
  console.log(`${colors.yellow}${colors.bright}Stage ${stage}:${colors.reset} ${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.cyan}======================================================================${colors.reset}`);
}

function logSuccess(message) {
  console.log(` ${colors.green}✔${colors.reset} ${message}`);
}

function logDetail(label, value) {
  console.log(`   ${colors.dim}${label}:${colors.reset} ${value}`);
}

async function runEndToEndTestSuite() {
  console.log(`\n${colors.magenta}${colors.bright}🛡️  HEIRLOOM PROTOCOL — END-TO-END VERIFICATION SUITE${colors.reset}`);
  console.log(`${colors.dim}Target API Gateway: ${API_BASE}${colors.reset}`);
  console.log(`${colors.dim}Ethereum Network: Hardhat (chainId: 31337)${colors.reset}\n`);

  const startTime = Date.now();

  try {
    // ------------------------------------------------------------------------
    // SETUP: Ethereum Signers & Smart Contract Deployment
    // ------------------------------------------------------------------------
    const [deployer, owner, beneficiary, guardian1, guardian2] = await hre.ethers.getSigners();
    logDetail('Owner Address', owner.address);
    logDetail('Beneficiary Address', beneficiary.address);
    logDetail('Guardian 1 Address', guardian1.address);
    logDetail('Guardian 2 Address', guardian2.address);

    const HeirloomVaultFactory = await hre.ethers.getContractFactory('HeirloomVault', deployer);
    const vaultContract = await HeirloomVaultFactory.deploy();
    await vaultContract.waitForDeployment();
    const contractAddress = await vaultContract.getAddress();
    logSuccess(`HeirloomVault deployed to ${contractAddress}`);

    // ------------------------------------------------------------------------
    // STAGE 1: Client Crypto & Payload Pinning
    // ------------------------------------------------------------------------
    logStage(1, 'Client Crypto & Payload Pinning');

    const rawMasterSecret =
      'Master Seed Phrase: alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray';
    const secretPassphrase = 'heirloom-e2e-master-passphrase-2026';

    logDetail('Original Secret Payload', `${rawMasterSecret.slice(0, 48)}...`);

    // 1.1 Web Crypto Client-side Encryption
    const encryptedEnvelope = await encryptPayload(rawMasterSecret, secretPassphrase);
    assert.strictEqual(encryptedEnvelope.algorithm, 'AES-GCM-256', 'Expected algorithm AES-GCM-256');
    assert.ok(encryptedEnvelope.salt, 'Salt must be present');
    assert.ok(encryptedEnvelope.iv, 'IV must be present');
    assert.ok(encryptedEnvelope.ciphertext, 'Ciphertext must be present');
    logSuccess('Client-side AES-GCM-256 encryption completed (100k iteration PBKDF2)');

    // 1.2 Pin encrypted envelope via Backend Storage Proxy
    const pinResponse = await axios.post(`${API_BASE}/api/v1/vaults/pin`, {
      encryptedData: encryptedEnvelope,
      metadata: {
        title: 'E2E Family Inheritance Vault',
        createdBy: owner.address,
      },
    });

    assert.strictEqual(pinResponse.data.success, true, 'Pin API should respond with success: true');
    const ipfsHash = pinResponse.data.data.ipfsHash;
    assert.ok(ipfsHash && ipfsHash.length > 10, 'IPFS CID/Hash must be returned');
    logSuccess('Encrypted envelope pinned to IPFS gateway');
    logDetail('IPFS CID / Mock Hash', ipfsHash);
    logDetail('Payload Size (bytes)', pinResponse.data.data.pinSize || JSON.stringify(encryptedEnvelope).length);

    // ------------------------------------------------------------------------
    // STAGE 2: Smart Contract Vault Minting
    // ------------------------------------------------------------------------
    logStage(2, 'Smart Contract Vault Minting');

    const heartbeatInterval = 60; // 60 seconds interval for testing
    const guardianAddresses = [guardian1.address, guardian2.address];
    const quorumThreshold = 1; // 1-of-2 required for release

    logDetail('Heartbeat Countdown', `${heartbeatInterval} seconds`);
    logDetail('Guardian Quorum Threshold', `${quorumThreshold} of ${guardianAddresses.length}`);

    // Call createVault from owner signer
    const mintTx = await vaultContract
      .connect(owner)
      .createVault(
        beneficiary.address,
        ipfsHash,
        BigInt(heartbeatInterval),
        guardianAddresses,
        BigInt(quorumThreshold)
      );

    const mintReceipt = await mintTx.wait();
    logSuccess(`Mint transaction confirmed on-chain in block #${mintReceipt.blockNumber}`);
    logDetail('Transaction Hash', mintTx.hash);

    // Parse VaultCreated event
    let createdVaultId = null;
    for (const log of mintReceipt.logs) {
      try {
        const parsed = vaultContract.interface.parseLog(log);
        if (parsed && parsed.name === 'VaultCreated') {
          createdVaultId = Number(parsed.args.vaultId);
          break;
        }
      } catch {}
    }

    assert.ok(createdVaultId && createdVaultId > 0, 'VaultCreated event must emit a positive vault ID');
    logSuccess(`On-chain Vault created with ID #${createdVaultId}`);

    // Verify initial contract state
    const onchainVault = await vaultContract.getVault(BigInt(createdVaultId));
    assert.strictEqual(onchainVault.owner.toLowerCase(), owner.address.toLowerCase());
    assert.strictEqual(onchainVault.beneficiary.toLowerCase(), beneficiary.address.toLowerCase());
    assert.strictEqual(Number(onchainVault.status), 0); // 0 = Active
    logSuccess('Contract state validated: Status is Active (0)');

    // ------------------------------------------------------------------------
    // STAGE 3: Indexing & Sentinel Sync
    // ------------------------------------------------------------------------
    logStage(3, 'Metadata Indexing & Sentinel Dashboard Sync');

    const indexPayload = {
      vaultId: createdVaultId,
      ownerAddress: owner.address,
      beneficiaryAddress: beneficiary.address,
      guardians: guardianAddresses,
      guardianThreshold: quorumThreshold,
      title: 'E2E Family Inheritance Vault',
      description: 'Securing master recovery seed for beneficiary succession.',
      ipfsHash: ipfsHash,
      heartbeatInterval: heartbeatInterval,
      status: 'Active',
    };

    const indexRes = await axios.post(`${API_BASE}/api/v1/vaults/index`, indexPayload);
    assert.strictEqual(indexRes.data.success, true, 'Index API must respond with success: true');
    logSuccess(`Vault #${createdVaultId} metadata indexed into MongoDB database`);

    // Verify dashboard reflects the indexed vault under ownedVaults
    const dashboardRes = await axios.get(`${API_BASE}/api/v1/dashboard/${owner.address.toLowerCase()}`);
    assert.strictEqual(dashboardRes.data.success, true);
    const ownedList = dashboardRes.data.data.ownedVaults || [];
    const matchedVault = ownedList.find((v) => Number(v.vaultId) === createdVaultId);
    assert.ok(matchedVault, `Vault #${createdVaultId} must appear in owner's dashboard`);
    logSuccess(`Owner dashboard queried: Vault #${createdVaultId} found in ownedVaults list`);
    logDetail('Total Owned Vaults', dashboardRes.data.data.summary.totalOwned);

    // ------------------------------------------------------------------------
    // STAGE 4: Owner Heartbeat Reset
    // ------------------------------------------------------------------------
    logStage(4, 'Owner Heartbeat Signal & Recovery');

    const heartbeatTx = await vaultContract.connect(owner).heartbeat(BigInt(createdVaultId));
    const heartbeatReceipt = await heartbeatTx.wait();
    logSuccess(`Heartbeat transaction confirmed on-chain (tx: ${heartbeatTx.hash.slice(0, 18)}...)`);

    const vaultAfterHeartbeat = await vaultContract.getVault(BigInt(createdVaultId));
    assert.ok(vaultAfterHeartbeat.lastHeartbeat > 0, 'Last heartbeat must be updated');
    logSuccess('On-chain lastHeartbeat timestamp refreshed');

    // Synchronize state with backend
    const syncRes = await axios.patch(`${API_BASE}/api/v1/vaults/${createdVaultId}/sync`, {
      lastKnownHeartbeat: new Date().toISOString(),
      status: 'Active',
    });
    assert.strictEqual(syncRes.data.success, true);
    logSuccess('Backend sync endpoint notified: Heartbeat updated');

    // ------------------------------------------------------------------------
    // STAGE 5: Inactivity, Guardian Attestation & Quorum
    // ------------------------------------------------------------------------
    logStage(5, 'Inactivity Trigger & Guardian Consensus Quorum');

    // 5.1 Fast-forward time on the blockchain past heartbeatInterval (60s + 15s buffer)
    await hre.network.provider.send('evm_increaseTime', [75]);
    await hre.network.provider.send('evm_mine');
    logSuccess('Simulated time-travel: +75s elapsed (heartbeat interval expired)');

    // 5.2 Trigger Inactivity
    const triggerTx = await vaultContract.connect(deployer).triggerInactivity(BigInt(createdVaultId));
    await triggerTx.wait();
    const vaultInGrace = await vaultContract.getVault(BigInt(createdVaultId));
    assert.strictEqual(Number(vaultInGrace.status), 1); // 1 = InGracePeriod
    logSuccess('Inactivity triggered: Vault transitioned to InGracePeriod (1)');

    // Sync InGracePeriod status to backend
    await axios.patch(`${API_BASE}/api/v1/vaults/${createdVaultId}/sync`, {
      status: 'InGracePeriod',
    });

    // 5.3 Guardian Attestation
    logDetail('Guardian 1 signing attestation', guardian1.address);
    const attestTx = await vaultContract.connect(guardian1).attestVault(BigInt(createdVaultId));
    await attestTx.wait();
    logSuccess(`Guardian 1 attested vault release (tx: ${attestTx.hash.slice(0, 18)}...)`);

    // Verify status flips to Approved (quorum 1 reached)
    const vaultApproved = await vaultContract.getVault(BigInt(createdVaultId));
    assert.strictEqual(Number(vaultApproved.status), 2); // 2 = Approved
    assert.strictEqual(Number(vaultApproved.approvalsCount), 1);
    logSuccess('Quorum achieved (1/1): Vault status transitioned to Approved (2)');

    // Sync Approved status to backend
    await axios.patch(`${API_BASE}/api/v1/vaults/${createdVaultId}/sync`, {
      status: 'Approved',
    });

    // ------------------------------------------------------------------------
    // STAGE 6: Beneficiary Claim & Decryption
    // ------------------------------------------------------------------------
    logStage(6, 'Beneficiary Claim & Client-Side Decryption');

    // 6.1 Beneficiary calls claimVault on-chain
    logDetail('Beneficiary executing claim', beneficiary.address);
    const claimTx = await vaultContract.connect(beneficiary).claimVault(BigInt(createdVaultId));
    await claimTx.wait();
    logSuccess(`Beneficiary claimed vault on-chain (tx: ${claimTx.hash.slice(0, 18)}...)`);

    const vaultClaimed = await vaultContract.getVault(BigInt(createdVaultId));
    assert.strictEqual(Number(vaultClaimed.status), 3); // 3 = Claimed
    logSuccess('On-chain status finalized: Claimed (3)');

    // Sync Claimed status to backend
    await axios.patch(`${API_BASE}/api/v1/vaults/${createdVaultId}/sync`, {
      status: 'Claimed',
    });

    // 6.2 Fetch encrypted payload from backend proxy via IPFS hash
    const payloadRes = await axios.get(`${API_BASE}/api/v1/vaults/payload/${ipfsHash}`);
    assert.strictEqual(payloadRes.data.success, true, 'Payload fetch must succeed');
    const storedEnvelope = payloadRes.data.data;
    assert.ok(storedEnvelope, 'Fetched envelope must not be empty');
    logSuccess('Encrypted payload fetched via /api/v1/vaults/payload/:ipfsHash');

    // 6.3 Decrypt payload using original passphrase
    const recoveredPlaintext = await decryptPayload(
      storedEnvelope.encryptedData || storedEnvelope,
      secretPassphrase
    );

    assert.strictEqual(
      recoveredPlaintext,
      rawMasterSecret,
      'Decrypted plaintext must match the original secret verbatim'
    );

    logSuccess('Client-side AES-GCM decryption completed successfully!');
    logDetail('Recovered Secret', `${recoveredPlaintext.slice(0, 52)}...`);

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${colors.green}${colors.bright}======================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bright}🎉 ALL 6 PROTOCOL STAGES PASSED CLEANLY (${elapsedSec}s)${colors.reset}`);
    console.log(`${colors.green}${colors.bright}======================================================================${colors.reset}\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}❌ TEST SUITE FAILED:${colors.reset}`, error.message);
    if (error.response?.data) {
      console.error(`${colors.red}API Response Error:${colors.reset}`, error.response.data);
    }
    console.error(error);
    process.exit(1);
  }
}

runEndToEndTestSuite();
