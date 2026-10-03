import { VaultRecord } from '../models/VaultRecord.js';
import { isDBConnected } from '../config/db.js';

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
        vault.status = 'InGracePeriod';
        vault.updatedAt = new Date();
        await vault.save();

        console.warn(
          `[SENTINEL ALERT] Vault ID ${vault.vaultId} heartbeat expired. Status shifted to InGracePeriod.`
        );
      }
    }
  } catch (error) {
    console.error('[Sentinel Error] Failed to scan vaults:', error.message);
  }
};

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
