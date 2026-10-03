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

// Hex definitions for supported networks
const SEPOLIA_HEX = '0xaa36a7';
const HARDHAT_HEX = '0x7a69';
const LOCALHOST_HEX = '0x539';

// Decimal IDs: Sepolia 11155111, Hardhat 31337, Localhost 1337
const SUPPORTED_CHAIN_IDS = [11155111, 31337, 1337];

const SEPOLIA_NETWORK_PARAMS = {
  chainId: SEPOLIA_HEX,
  chainName: 'Sepolia Test Network',
  nativeCurrency: {
    name: 'Sepolia ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

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
  const isCorrectNetwork =
    !isConnected ||
    !numericChainId ||
    SUPPORTED_CHAIN_IDS.includes(numericChainId);

  // EIP-3085 / EIP-3326 Automatic Network Switcher & On-Demand Adder
  const ensureCorrectNetwork = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    try {
      const currentChainHex = await window.ethereum.request({
        method: 'eth_chainId',
      });
      const normalizedHex = currentChainHex ? currentChainHex.toLowerCase() : '';

      // If already on Sepolia or local testnet, no switch needed
      if (
        normalizedHex === SEPOLIA_HEX ||
        normalizedHex === HARDHAT_HEX ||
        normalizedHex === LOCALHOST_HEX
      ) {
        return;
      }

      console.log(
        `[WalletContext] Unsupported chain detected (${currentChainHex}). Prompting auto-switch to Sepolia...`
      );

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SEPOLIA_HEX }],
        });
      } catch (switchError) {
        // Error code 4902 indicates that the chain has not been added to MetaMask
        if (
          switchError.code === 4902 ||
          switchError.message?.includes('4902') ||
          switchError.message?.includes('Unrecognized chain')
        ) {
          console.log('[WalletContext] Sepolia not found in wallet. Auto-adding network via wallet_addEthereumChain...');
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [SEPOLIA_NETWORK_PARAMS],
          });
        } else {
          throw switchError;
        }
      }
    } catch (err) {
      console.warn('[WalletContext] Automatic network switch error:', err.message);
    }
  }, []);

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
      const currentNumChainId = Number(network.chainId);
      setChainId(currentNumChainId);

      if (accounts && accounts.length > 0) {
        const lowerAccount = accounts[0].toLowerCase();
        setAccount(lowerAccount);
        const userSigner = await browserProvider.getSigner();
        setSigner(userSigner);

        // Auto verify and switch network if wallet is connected to an unsupported chain
        if (!SUPPORTED_CHAIN_IDS.includes(currentNumChainId)) {
          await ensureCorrectNetwork();
        }
      } else {
        setAccount(null);
        setSigner(null);
      }
      setError(null);
    } catch (err) {
      console.warn('[WalletContext] Failed to sync wallet state:', err);
    }
  }, [ensureCorrectNetwork]);

  // Connect wallet action
  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      const err = new Error(
        'No Ethereum wallet detected. Please install MetaMask or another Web3 wallet.'
      );
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
      const currentNumChainId = Number(network.chainId);
      const userSigner = await browserProvider.getSigner();

      setAccount(lowerAccount);
      setChainId(currentNumChainId);
      setProvider(browserProvider);
      setSigner(userSigner);

      // Automatically switch network to Sepolia if unsupported
      if (!SUPPORTED_CHAIN_IDS.includes(currentNumChainId)) {
        await ensureCorrectNetwork();
      }

      return lowerAccount;
    } catch (err) {
      console.error('[WalletContext] Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      throw err;
    }
  }, [ensureCorrectNetwork]);

  // Disconnect wallet action
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setSigner(null);
    setError(null);
  }, []);

  // Switch network helper
  const switchNetwork = useCallback(
    async (targetChainIdHex = SEPOLIA_HEX) => {
      if (typeof window === 'undefined' || !window.ethereum) return;
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChainIdHex }],
        });
      } catch (err) {
        if (err.code === 4902 && targetChainIdHex === SEPOLIA_HEX) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [SEPOLIA_NETWORK_PARAMS],
          });
        } else {
          console.error('[WalletContext] Network switch error:', err);
          throw err;
        }
      }
    },
    []
  );

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

    const handleChainChanged = async (newChainId) => {
      const parsedChainId = normalizeChainId(newChainId);
      setChainId(parsedChainId);
      if (!SUPPORTED_CHAIN_IDS.includes(parsedChainId)) {
        await ensureCorrectNetwork();
      }
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
  }, [syncWalletState, ensureCorrectNetwork]);

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
        ensureCorrectNetwork,
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
