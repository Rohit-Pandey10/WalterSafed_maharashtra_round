import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../context/WalletContext.jsx';
import contractArtifact from '../contracts/HeirloomVault.json';

const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  contractArtifact.address ||
  '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const CONTRACT_ABI = contractArtifact.abi;

/**
 * Parses contract revert errors and custom errors into human-readable messages
 */
const parseContractError = (error, iface) => {
  if (!error) return 'Unknown transaction error occurred';

  // Check if ethers decoded custom error
  if (error.data && iface) {
    try {
      const decoded = iface.parseError(error.data);
      if (decoded) {
        return `Contract Error: ${decoded.name}`;
      }
    } catch {
      // Fall through to standard parsing
    }
  }

  // Check for common error properties in Ethers v6
  if (error.reason) return error.reason;
  if (error.shortMessage) return error.shortMessage;
  if (error.info?.error?.message) return error.info.error.message;
  if (error.message) {
    if (error.message.includes('user rejected')) {
      return 'Transaction rejected by user in wallet.';
    }
    if (error.message.includes('NotOwner')) return 'Transaction reverted: Caller is not the vault owner.';
    if (error.message.includes('NotBeneficiary')) return 'Transaction reverted: Caller is not the designated beneficiary.';
    if (error.message.includes('NotGuardian')) return 'Transaction reverted: Caller is not an authorized guardian.';
    if (error.message.includes('AlreadyApproved')) return 'Transaction reverted: Guardian has already attested this vault.';
    if (error.message.includes('InactivityConditionNotMet')) return 'Transaction reverted: Heartbeat interval has not lapsed yet.';
    if (error.message.includes('VaultNotFound')) return 'Transaction reverted: Vault does not exist.';
    if (error.message.includes('InvalidVaultStatus')) return 'Transaction reverted: Vault is not in an eligible state for this action.';
    return error.message;
  }

  return 'Transaction failed. Please check parameters and try again.';
};

/**
 * Custom React hook for HeirloomVault smart contract interactions
 */
export const useHeirloomVault = () => {
  const { provider, signer, isConnected } = useWallet();
  const [isTransacting, setIsTransacting] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const getContract = useCallback(
    (useSigner = true) => {
      if (useSigner) {
        if (!signer) {
          throw new Error('Wallet not connected. Signer required for transaction.');
        }
        return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      }

      const activeProvider =
        provider ||
        new ethers.JsonRpcProvider(
          import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545'
        );
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeProvider);
    },
    [provider, signer]
  );

  /**
   * Create a new vault on-chain
   * Supports positional args (beneficiary, heartbeatInterval, guardians, threshold, ipfsHash)
   * or object parameter { beneficiary, heartbeatInterval, guardians, threshold, ipfsHash }
   */
  const createVault = useCallback(
    async (arg1, arg2, arg3, arg4, arg5) => {
      setIsTransacting(true);
      setError(null);
      setTxHash(null);

      try {
        let beneficiary, interval, guardians, threshold, ipfsHash;

        if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
          // Object call signature
          beneficiary = arg1.beneficiary;
          interval = arg1.heartbeatInterval || arg1.interval;
          guardians = arg1.guardians;
          threshold = arg1.threshold || arg1.guardianThreshold;
          ipfsHash = arg1.ipfsHash;
        } else {
          // Positional arguments support:
          // Either (beneficiary, heartbeatInterval, guardians, threshold, ipfsHash)
          // or (beneficiary, ipfsHash, interval, guardians, threshold)
          beneficiary = arg1;
          if (typeof arg2 === 'string' && (arg2.startsWith('Qm') || arg2.startsWith('bafk'))) {
            ipfsHash = arg2;
            interval = arg3;
            guardians = arg4;
            threshold = arg5;
          } else {
            interval = arg2;
            guardians = arg3;
            threshold = arg4;
            ipfsHash = arg5;
          }
        }

        if (!beneficiary || !ipfsHash || !interval || !guardians || !threshold) {
          throw new Error('All vault parameters are required to create vault on-chain.');
        }

        const contract = getContract(true);
        // Smart contract method signature:
        // createVault(address _beneficiary, string _ipfsHash, uint256 _interval, address[] _guardians, uint256 _threshold)
        const tx = await contract.createVault(
          beneficiary,
          ipfsHash,
          BigInt(interval),
          guardians,
          BigInt(threshold)
        );

        setTxHash(tx.hash);
        const receipt = await tx.wait();

        // Extract vaultId from VaultCreated event
        let createdVaultId = null;
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === 'VaultCreated') {
              createdVaultId = Number(parsed.args.vaultId);
              break;
            }
          } catch {
            // Ignore non-contract logs
          }
        }

        return {
          receipt,
          txHash: tx.hash,
          vaultId: createdVaultId,
        };
      } catch (err) {
        const parsedMessage = parseContractError(err, new ethers.Interface(CONTRACT_ABI));
        setError(parsedMessage);
        throw new Error(parsedMessage);
      } finally {
        setIsTransacting(false);
      }
    },
    [getContract]
  );

  /**
   * Ping owner heartbeat to keep vault active or recover from grace period
   */
  const pingHeartbeat = useCallback(
    async (vaultId) => {
      setIsTransacting(true);
      setError(null);
      setTxHash(null);

      try {
        const contract = getContract(true);
        const tx = await contract.heartbeat(BigInt(vaultId));
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        return { receipt, txHash: tx.hash };
      } catch (err) {
        const parsedMessage = parseContractError(err, new ethers.Interface(CONTRACT_ABI));
        setError(parsedMessage);
        throw new Error(parsedMessage);
      } finally {
        setIsTransacting(false);
      }
    },
    [getContract]
  );

  /**
   * Trigger grace period if heartbeat interval expired
   */
  const triggerInactivity = useCallback(
    async (vaultId) => {
      setIsTransacting(true);
      setError(null);
      setTxHash(null);

      try {
        const contract = getContract(true);
        const tx = await contract.triggerInactivity(BigInt(vaultId));
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        return { receipt, txHash: tx.hash };
      } catch (err) {
        const parsedMessage = parseContractError(err, new ethers.Interface(CONTRACT_ABI));
        setError(parsedMessage);
        throw new Error(parsedMessage);
      } finally {
        setIsTransacting(false);
      }
    },
    [getContract]
  );

  /**
   * Guardian attestation to approve vault release
   */
  const attestVault = useCallback(
    async (vaultId) => {
      setIsTransacting(true);
      setError(null);
      setTxHash(null);

      try {
        const contract = getContract(true);
        const tx = await contract.attestVault(BigInt(vaultId));
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        return { receipt, txHash: tx.hash };
      } catch (err) {
        const parsedMessage = parseContractError(err, new ethers.Interface(CONTRACT_ABI));
        setError(parsedMessage);
        throw new Error(parsedMessage);
      } finally {
        setIsTransacting(false);
      }
    },
    [getContract]
  );

  /**
   * Beneficiary claims vault and accesses release payload
   */
  const claimVault = useCallback(
    async (vaultId) => {
      setIsTransacting(true);
      setError(null);
      setTxHash(null);

      try {
        const contract = getContract(true);
        const tx = await contract.claimVault(BigInt(vaultId));
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        return { receipt, txHash: tx.hash };
      } catch (err) {
        const parsedMessage = parseContractError(err, new ethers.Interface(CONTRACT_ABI));
        setError(parsedMessage);
        throw new Error(parsedMessage);
      } finally {
        setIsTransacting(false);
      }
    },
    [getContract]
  );

  /**
   * Vault owner cancels an Active or InGracePeriod vault on-chain
   */
  const cancelVault = useCallback(
    async (vaultId) => {
      setIsTransacting(true);
      setError(null);
      setTxHash(null);

      try {
        const contract = getContract(true);
        const tx = await contract.cancelVault(BigInt(vaultId));
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        return { receipt, txHash: tx.hash };
      } catch (err) {
        const parsedMessage = parseContractError(err, new ethers.Interface(CONTRACT_ABI));
        setError(parsedMessage);
        throw new Error(parsedMessage);
      } finally {
        setIsTransacting(false);
      }
    },
    [getContract]
  );

  /**
   * Read-only view helpers
   */
  const getVault = useCallback(
    async (vaultId) => {
      const contract = getContract(false);
      return await contract.getVault(BigInt(vaultId));
    },
    [getContract]
  );

  const getGuardians = useCallback(
    async (vaultId) => {
      const contract = getContract(false);
      return await contract.getGuardians(BigInt(vaultId));
    },
    [getContract]
  );

  const isGuardian = useCallback(
    async (vaultId, guardianAddress) => {
      const contract = getContract(false);
      return await contract.isGuardian(BigInt(vaultId), guardianAddress);
    },
    [getContract]
  );

  const hasApproved = useCallback(
    async (vaultId, guardianAddress) => {
      const contract = getContract(false);
      return await contract.hasApproved(BigInt(vaultId), guardianAddress);
    },
    [getContract]
  );

  return {
    contractAddress: CONTRACT_ADDRESS,
    isConnected,
    isTransacting,
    txHash,
    error,
    createVault,
    pingHeartbeat,
    triggerInactivity,
    attestVault,
    claimVault,
    cancelVault,
    getVault,
    getGuardians,
    isGuardian,
    hasApproved,
  };
};

export default useHeirloomVault;
