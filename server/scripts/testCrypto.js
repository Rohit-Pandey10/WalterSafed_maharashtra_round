/**
 * Isolated Verification Script for Heirloom Web Crypto Engine
 * Verifies key derivation, AES-GCM encryption, decryption, and error resilience.
 */

import {
  encryptPayload,
  decryptPayload,
} from '../../client/src/utils/crypto.js';

async function runCryptoTestSuite() {
  console.log('🔒 Starting Heirloom Protocol Crypto Engine Verification Suite...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Plaintext String Roundtrip
  try {
    const secret = 'ethereum-private-key-0x987654321fedcba0123456789abcdef';
    const passphrase = 'UltraSecureUserPassphrase!2026';

    const encryptedPkg = await encryptPayload(secret, passphrase);
    console.log('✓ [Test 1.1] Encrypted Payload Generated:');
    console.log(`    Algorithm:  ${encryptedPkg.algorithm}`);
    console.log(`    Salt:       ${encryptedPkg.salt}`);
    console.log(`    IV:         ${encryptedPkg.iv}`);
    console.log(`    Ciphertext: ${encryptedPkg.ciphertext.slice(0, 32)}...`);

    const decrypted = await decryptPayload(encryptedPkg, passphrase);
    if (decrypted === secret) {
      console.log('✓ [Test 1.2] Decryption matched original secret exactly.');
      passed++;
    } else {
      throw new Error(`Decrypted text mismatch: ${decrypted}`);
    }
  } catch (err) {
    console.error('✗ [Test 1 Failed]:', err.message);
    failed++;
  }

  // Test 2: Structured JSON Object Serialization
  try {
    const complexSecret = JSON.stringify({
      seedPhrase: 'witch collapse practice feed shame open despair creek road again ice least',
      note: 'Transfer 50% to wallet 0x123... upon trigger',
      timestamp: Date.now(),
    });
    const passphrase = 'GuardianSignatureOrKey_0xABCDEF';

    const encryptedPkg = await encryptPayload(complexSecret, passphrase);
    const serializedJson = JSON.stringify(encryptedPkg);

    // Decrypt from raw JSON string (simulating IPFS gateway payload response)
    const decryptedJsonStr = await decryptPayload(serializedJson, passphrase);
    const parsedSecret = JSON.parse(decryptedJsonStr);

    if (parsedSecret.seedPhrase.startsWith('witch collapse')) {
      console.log('✓ [Test 2] Complex JSON payload encrypted, stringified, and recovered successfully.');
      passed++;
    } else {
      throw new Error('Parsed secret fields corrupted.');
    }
  } catch (err) {
    console.error('✗ [Test 2 Failed]:', err.message);
    failed++;
  }

  // Test 3: Bad Passphrase Rejection
  try {
    const secret = 'TopSecretInheritanceInstructions';
    const goodPass = 'CorrectPassphrase123';
    const badPass = 'WrongPassphrase456';

    const encryptedPkg = await encryptPayload(secret, goodPass);

    let failedAsExpected = false;
    try {
      await decryptPayload(encryptedPkg, badPass);
    } catch (err) {
      failedAsExpected = true;
      console.log(`✓ [Test 3] Bad passphrase rejected gracefully: "${err.message}"`);
    }

    if (failedAsExpected) {
      passed++;
    } else {
      throw new Error('Decryption succeeded with invalid passphrase!');
    }
  } catch (err) {
    console.error('✗ [Test 3 Failed]:', err.message);
    failed++;
  }

  // Test 4: Tampered Ciphertext Rejection
  try {
    const secret = 'TamperProofPayload';
    const pass = 'StandardPassword';
    const encryptedPkg = await encryptPayload(secret, pass);

    // Tamper with the ciphertext base64
    const tamperedPkg = {
      ...encryptedPkg,
      ciphertext: encryptedPkg.ciphertext.substring(0, encryptedPkg.ciphertext.length - 4) + 'AAAA',
    };

    let tamperedRejected = false;
    try {
      await decryptPayload(tamperedPkg, pass);
    } catch (err) {
      tamperedRejected = true;
      console.log(`✓ [Test 4] Tampered ciphertext rejected: "${err.message}"`);
    }

    if (tamperedRejected) {
      passed++;
    } else {
      throw new Error('Tampered payload was decrypted without error!');
    }
  } catch (err) {
    console.error('✗ [Test 4 Failed]:', err.message);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Crypto Engine Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCryptoTestSuite();
