import { VaultRecord } from '../models/VaultRecord.js';
import { isDBConnected } from '../config/db.js';
import { triggerOnchainInactivity, fetchOnchainVault } from './chainService.js';
import config from '../config/keys.js';

let sentinelInterval = null;

/**
 * Perform a single scan of active vaults to detect heartbeat expirations
 */
export const scanActiveVaults = async () => {
  if (!isDBConnected()) {
    return;
  }

  try {
    const activeVaults = await VaultRecord.find({ status: 'Active' });
    const now = Date.now();

    for (const vault of activeVaults) {
      const lastHeartbeatMs = vault.lastKnownHeartbeat
        ? new Date(vault.lastKnownHeartbeat).getTime()
        : new Date(vault.createdAt || now).getTime();
      const expirationMs = lastHeartbeatMs + vault.heartbeatInterval * 1000;

      if (now > expirationMs) {
        console.warn(
          `[SENTINEL ALERT] Vault ID ${vault.vaultId} heartbeat expired (elapsed: ${Math.floor((now - expirationMs) / 1000)}s).`
        );

        // Check if on-chain state is already InGracePeriod
        let onchainConfirmed = false;
        const currentOnchain = await fetchOnchainVault(vault.vaultId);
        if (currentOnchain.success && currentOnchain.data.status === 'InGracePeriod') {
          onchainConfirmed = true;
        } else {
          // Dispatch triggerOnchainInactivity
          const onchainRes = await triggerOnchainInactivity(vault.vaultId);
          if (onchainRes.success === true) {
            console.log(
              `[SENTINEL CONFIRMED] On-chain triggerInactivity confirmed for Vault #${vault.vaultId} (tx: ${onchainRes.txHash})`
            );
            onchainConfirmed = true;
          } else {
            console.warn(
              `[SENTINEL WARNING] On-chain inactivity trigger failed for Vault #${vault.vaultId}. Suppressing DB transition.`
            );
            continue; // Suppress DB transition, proceed to next vault
          }
        }

        if (onchainConfirmed) {
          vault.status = 'InGracePeriod';
          vault.updatedAt = new Date();
          await vault.save();

          console.warn(
            `[SENTINEL CONFIRMED] Vault ID ${vault.vaultId} status updated to InGracePeriod in database.`
          );
        }
      }
    }
  } catch (error) {
    console.error('[Sentinel Error] Failed to scan vaults:', error.message);
  }
};

export const scanExpiredVaults = scanActiveVaults;

/**
 * Start the automated sentinel background loop
 * @param {number} intervalMs Scan interval in milliseconds (default: 30000ms / 30s)
 */
export const startSentinel = (intervalMs = 30000) => {
  if (sentinelInterval) {
    clearInterval(sentinelInterval);
  }

  console.log(`[Sentinel Service] Active sentinel monitor started (interval: ${intervalMs / 1000}s)`);

  // Run initial scan after a short startup delay
  setTimeout(() => {
    scanActiveVaults();
  }, 2000);

  sentinelInterval = setInterval(() => {
    scanActiveVaults();
  }, intervalMs);

  return sentinelInterval;
};

/**
 * Stop the sentinel background loop
 */
export const stopSentinel = () => {
  if (sentinelInterval) {
    clearInterval(sentinelInterval);
    sentinelInterval = null;
    console.log('[Sentinel Service] Sentinel monitor stopped.');
  }
};

export default {
  startSentinel,
  stopSentinel,
  scanActiveVaults,
};
