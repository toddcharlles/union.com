import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '../config';

// Funcao para obter o provider da wallet (suporta Trust Wallet, MetaMask, etc)
const getWalletProvider = () => {
  if (typeof window === 'undefined') return null;

  // Trust Wallet pode injetar de diferentes formas
  if (window.trustwallet?.ethereum) return window.trustwallet.ethereum;
  if (window.trustwallet) return window.trustwallet;

  // Verificar ethereum com flags especificas
  if (window.ethereum?.isTrust) return window.ethereum;
  if (window.ethereum?.isTrustWallet) return window.ethereum;
  if (window.ethereum?.isMetaMask) return window.ethereum;
  if (window.ethereum?.isCoinbaseWallet) return window.ethereum;

  // Fallback para ethereum generico
  if (window.ethereum) return window.ethereum;

  return null;
};

export const useWallet = () => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Use ref to track if we've initialized
  const providerRef = useRef(null);

  // Check if wallet is already connected
  useEffect(() => {
    checkConnection();

    const walletProvider = getWalletProvider();
    if (walletProvider) {
      walletProvider.on('accountsChanged', handleAccountsChanged);
      walletProvider.on('chainChanged', handleChainChanged);
    }

    return () => {
      const walletProvider = getWalletProvider();
      if (walletProvider) {
        walletProvider.removeListener('accountsChanged', handleAccountsChanged);
        walletProvider.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  const checkConnection = async () => {
    const walletProvider = getWalletProvider();
    if (walletProvider) {
      try {
        // Reuse existing provider if available
        let ethProvider = providerRef.current;
        if (!ethProvider) {
          ethProvider = new ethers.providers.Web3Provider(walletProvider);
          providerRef.current = ethProvider;
        }

        const accounts = await ethProvider.listAccounts();

        if (accounts.length > 0) {
          const signer = ethProvider.getSigner();
          const network = await ethProvider.getNetwork();

          // Only update state if values actually changed
          setProvider(ethProvider);
          setSigner(signer);
          setAccount(accounts[0]);
          setChainId(network.chainId);
        }
      } catch (err) {
        console.error('Error checking connection:', err);
      }
    }
  };

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      disconnect();
    } else if (accounts[0] !== account) {
      // Only update if account actually changed
      setAccount(accounts[0]);
      checkConnection();
    }
  };

  const handleChainChanged = async (newChainId) => {
    // Instead of reloading the page, update state gracefully
    console.log('Chain changed to:', newChainId);

    try {
      // Update chain ID immediately (it comes as hex string from MetaMask)
      const chainIdNumber = parseInt(newChainId, 16);
      setChainId(chainIdNumber);

      // Reinitialize provider with new network
      const walletProvider = getWalletProvider();
      if (walletProvider) {
        const ethProvider = new ethers.providers.Web3Provider(walletProvider);
        providerRef.current = ethProvider;

        const newSigner = ethProvider.getSigner();
        const accounts = await ethProvider.listAccounts();

        setProvider(ethProvider);
        setSigner(newSigner);
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        }
      }
    } catch (error) {
      console.error('Error handling chain change:', error);
      // Only reload as last resort if update fails
      window.location.reload();
    }
  };

  const connect = useCallback(async () => {
    let walletProvider = getWalletProvider();

    // Aguardar um pouco para a wallet injetar o provider
    if (!walletProvider) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      walletProvider = getWalletProvider();
    }

    // Tentar mais uma vez
    if (!walletProvider) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      walletProvider = getWalletProvider();
    }

    if (!walletProvider) {
      setError('Wallet not detected. Please open this site in your wallet browser (Trust Wallet, MetaMask, etc).');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const provider = new ethers.providers.Web3Provider(walletProvider);
      const accounts = await provider.send('eth_requestAccounts', []);

      const signer = provider.getSigner();
      const network = await provider.getNetwork();

      setProvider(provider);
      setSigner(signer);
      setAccount(accounts[0]);
      setChainId(network.chainId);

      // Check if we're on the correct network
      if (network.chainId !== CHAIN_CONFIG.chainId) {
        await switchNetwork();
      }
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
  }, []);

  const switchNetwork = async () => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;

    try {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CHAIN_CONFIG.chainId.toString(16)}` }],
      });
    } catch (switchError) {
      // This error code indicates that the chain has not been added
      if (switchError.code === 4902) {
        try {
          await walletProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${CHAIN_CONFIG.chainId.toString(16)}`,
              chainName: CHAIN_CONFIG.chainName,
              nativeCurrency: CHAIN_CONFIG.nativeCurrency,
              rpcUrls: CHAIN_CONFIG.rpcUrls,
              blockExplorerUrls: CHAIN_CONFIG.blockExplorerUrls,
            }],
          });
        } catch (addError) {
          console.error('Error adding network:', addError);
          setError('Failed to add BSC network to wallet');
        }
      } else {
        console.error('Error switching network:', switchError);
        setError('Failed to switch network');
      }
    }
  };

  const isCorrectNetwork = chainId === CHAIN_CONFIG.chainId;

  return {
    account,
    provider,
    signer,
    chainId,
    isConnecting,
    isConnected: !!account,
    isCorrectNetwork,
    error,
    connect,
    disconnect,
    switchNetwork,
  };
};
