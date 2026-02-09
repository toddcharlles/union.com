import React, { useState, useEffect, useCallback } from 'react';
import { CHAIN_CONFIG, CONTRACTS, formatEther } from '../config';
import logo from '../assets/unionzod-logo.png';
import GlobalChat from './chat/GlobalChat';

const WalletConnect = ({ account, isConnecting, connect, disconnect, isCorrectNetwork, switchNetwork, error, contracts }) => {
  const [balances, setBalances] = useState({
    usdt: '0',
    zod: '0'
  });
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Load balances - using useCallback to avoid stale closure
  const loadBalances = useCallback(async () => {
    if (!contracts || !account) return;

    try {
      const [usdtBalance, zodBalance] = await Promise.all([
        contracts.usdt.balanceOf(account),
        contracts.zod.balanceOf(account)
      ]);

      const formattedBalances = {
        usdt: formatEther(usdtBalance.toString(), 2),
        zod: formatEther(zodBalance.toString(), 2)
      };

      setBalances(formattedBalances);
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  }, [contracts, account]);

  // Load balances when dependencies change
  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadBalances();
      const interval = setInterval(loadBalances, 10000);
      return () => clearInterval(interval);
    }
  }, [contracts, account, isCorrectNetwork, loadBalances]);

  // Listen for balance update events from other components
  useEffect(() => {
    const handleBalanceUpdate = () => {
      if (contracts && account && isCorrectNetwork) {
        loadBalances();
      }
    };

    window.addEventListener('balancesUpdated', handleBalanceUpdate);
    return () => window.removeEventListener('balancesUpdated', handleBalanceUpdate);
  }, [contracts, account, isCorrectNetwork, loadBalances]);

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <>
      {/* Barra superior compacta */}
      <div className="bg-gray-900 border-b border-gray-700 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <img src={logo} alt="UnionZod" className="h-16 sm:h-20 md:h-24 lg:h-28" />
            </div>

            {/* Chat, Saldos e Conexão */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Botão do Chat */}
              <button
                onClick={() => setIsChatOpen(true)}
                className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-md border border-gray-700 transition-colors flex items-center gap-2"
                title="Chat Global"
              >
                <span className="text-xl">💬</span>
                <span className="text-xs text-gray-300 hidden sm:inline">Chat</span>
              </button>

              {/* Saldos (apenas quando conectado) */}
              {account && isCorrectNetwork && (
                <div className="flex items-center gap-3">
                  <div className="bg-gray-800 px-4 py-2 rounded-md border border-gray-700">
                    <p className="text-xs text-gray-400">USDT</p>
                    <p className="text-sm font-bold text-white">{balances.usdt}</p>
                  </div>
                  <div className="bg-gray-800 px-4 py-2 rounded-md border border-gray-700">
                    <p className="text-xs text-gray-400">ZOD</p>
                    <p className="text-sm font-bold text-yellow-400">{balances.zod}</p>
                  </div>
                </div>
              )}

              {/* Botão de Conexão/Desconexão */}
              {!account ? (
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 sm:px-6 rounded-md transition-colors text-sm"
                >
                  {isConnecting ? 'Conectando...' : 'Conectar'}
                </button>
              ) : !isCorrectNetwork ? (
                <button
                  onClick={switchNetwork}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 sm:px-6 py-2 rounded-md font-semibold text-sm"
                >
                  Mudar Rede
                </button>
              ) : (
                <button
                  onClick={disconnect}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 py-2 rounded-md text-sm font-semibold"
                >
                  Desconectar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Aviso de erro ou rede incorreta */}
      {error && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-4">
          <div className="bg-red-50 border border-red-300 text-red-700 px-3 py-2 rounded-md text-xs sm:text-sm">
            {error}
          </div>
        </div>
      )}

      {account && !isCorrectNetwork && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-4">
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-3 py-2 rounded-md text-xs sm:text-sm">
            ⚠️ Por favor, mude para {CHAIN_CONFIG.chainName} para usar esta aplicação
          </div>
        </div>
      )}

      {/* Global Chat Modal */}
      <GlobalChat
        account={account}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </>
  );
};

export default WalletConnect;