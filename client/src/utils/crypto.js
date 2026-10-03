/**
 * Heirloom Protocol - Client-Side Cryptographic Engine
 * Browser-native AES-GCM-256 encryption & PBKDF2 key derivation using Web Crypto API.
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Universal Web Crypto resolver (works seamlessly in Browser and Node.js environments)
 */
const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  throw new Error('Web Crypto API is not supported in this environment.');
};

/**
 * Robust Base64 helper utilities supporting both browser and runtime environments
 */
export const buffToBase64 = (buf) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buf).toString('base64');
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToBuff = (b64) => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Derives a 256-bit AES-GCM key from a passphrase or signature and salt using PBKDF2
 * @param {string} passphrase User passphrase or wallet signature
 * @param {Uint8Array} salt Cryptographic salt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, salt) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Passphrase must be a non-empty string');
  }
  if (!salt || !(salt instanceof Uint8Array)) {
    throw new Error('Salt must be a valid Uint8Array');
  }

  const cryptoObj = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await cryptoObj.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string into a structured AES-GCM-256 package
 * @param {string} plaintext Secret text or stringified JSON
 * @param {string} passphrase Secret passphrase or wallet signature
 * @returns {Promise<{ version: string, algorithm: string, salt: string, iv: string, ciphertext: string }>}
 */
export async function encryptPayload(plaintext, passphrase) {
  if (typeof plaintext !== 'string' || !plaintext.trim()) {
    throw new Error('Plaintext payload cannot be empty');
  }
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Passphrase is required for encryption');
  }

  const cryptoObj = getCrypto();
  const enc = new TextEncoder();
  const salt = cryptoObj.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = cryptoObj.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(passphrase, salt);
  const encryptedBuf = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    version: '1.0.0',
    algorithm: 'AES-GCM-256',
    salt: buffToBase64(salt),
    iv: buffToBase64(iv),
    ciphertext: buffToBase64(encryptedBuf),
  };
}

/**
 * Decrypts an AES-GCM package back into UTF-8 plaintext
 * @param {object|string} encryptedPackage Object or JSON string containing { ciphertext, iv, salt }
 * @param {string} passphrase Secret passphrase or wallet signature
 * @returns {Promise<string>} Decrypted UTF-8 plaintext
 */
export async function decryptPayload(encryptedPackage, passphrase) {
  if (!encryptedPackage) {
    throw new Error('Encrypted package is required');
  }
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Passphrase is required for decryption');
  }

  let pkg = encryptedPackage;
  if (typeof encryptedPackage === 'string') {
    try {
      pkg = JSON.parse(encryptedPackage);
    } catch {
      throw new Error('Invalid encrypted package: Failed to parse JSON format');
    }
  }

  if (!pkg.ciphertext || !pkg.iv || !pkg.salt) {
    throw new Error('Malformed encrypted package: Missing ciphertext, iv, or salt');
  }

  try {
    const salt = base64ToBuff(pkg.salt);
    const iv = base64ToBuff(pkg.iv);
    const ciphertext = base64ToBuff(pkg.ciphertext);

    const key = await deriveKey(passphrase, salt);
    const cryptoObj = getCrypto();
    const decryptedBuf = await cryptoObj.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuf);
  } catch (error) {
    throw new Error('Decryption failed: Invalid passphrase or corrupted ciphertext');
  }
}

export default {
  deriveKey,
  encryptPayload,
  decryptPayload,
  buffToBase64,
  base64ToBuff,
};
