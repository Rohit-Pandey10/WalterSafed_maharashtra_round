import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

export const WalletContext = createContext({
  account: null,
  isConnected: false,
  chainId: null,
  isCorrectNetwork: true,
  provider: null,
  signer: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  switchNetwork: async () => {},
  error: null,
});

// Supported networks: Hardhat local (31337 / 1337) and Sepolia testnet (11155111)
const SUPPORTED_CHAIN_IDS = [31337, 1337, 11155111];

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  const normalizeChainId = (rawChainId) => {
    if (!rawChainId) return null;
    return typeof rawChainId === 'string' && rawChainId.startsWith('0x')
      ? parseInt(rawChainId, 16)
      : Number(rawChainId);
  };

  const isConnected = Boolean(account);
  const numericChainId = normalizeChainId(chainId);
  const isCorrectNetwork = !isConnected || !numericChainId || SUPPORTED_CHAIN_IDS.includes(numericChainId);

  // Sync state from active Ethereum provider
  const syncWalletState = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });

      setProvider(browserProvider);
      setChainId(Number(network.chainId));

      if (accounts && accounts.length > 0) {
        const lowerAccount = accounts[0].toLowerCase();
        setAccount(lowerAccount);
        const userSigner = await browserProvider.getSigner();
        setSigner(userSigner);
      } else {
        setAccount(null);
        setSigner(null);
      }
      setError(null);
    } catch (err) {
      console.warn('[WalletContext] Failed to sync wallet state:', err);
    }
  }, []);

  // Connect wallet action
  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      const err = new Error('No Ethereum wallet detected. Please install MetaMask or another Web3 wallet.');
      setError(err.message);
      throw err;
    }

    try {
      setError(null);
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected in wallet.');
      }

      const lowerAccount = accounts[0].toLowerCase();
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const userSigner = await browserProvider.getSigner();

      setAccount(lowerAccount);
      setChainId(Number(network.chainId));
      setProvider(browserProvider);
      setSigner(userSigner);

      return lowerAccount;
    } catch (err) {
      console.error('[WalletContext] Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      throw err;
    }
  }, []);

  // Disconnect wallet action
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setSigner(null);
    setError(null);
  }, []);

  // Switch network helper
  const switchNetwork = useCallback(async (targetChainIdHex = '0x7a69') => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (err) {
      console.error('[WalletContext] Network switch error:', err);
      throw err;
    }
  }, []);

  // Listen to provider events
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      return;
    }

    // Hydrate existing connection on mount
    syncWalletState();

    const handleAccountsChanged = async (accounts) => {
      if (accounts && accounts.length > 0) {
        const lowerAccount = accounts[0].toLowerCase();
        setAccount(lowerAccount);
        if (window.ethereum) {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          setProvider(browserProvider);
          const userSigner = await browserProvider.getSigner();
          setSigner(userSigner);
        }
      } else {
        setAccount(null);
        setSigner(null);
      }
    };

    const handleChainChanged = (newChainId) => {
      setChainId(normalizeChainId(newChainId));
      syncWalletState();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [syncWalletState]);

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnected,
        chainId: numericChainId,
        isCorrectNetwork,
        provider,
        signer,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export default WalletContext;
