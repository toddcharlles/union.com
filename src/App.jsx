import React, { useEffect, useState, useRef } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContracts } from './hooks/useContracts';
import WalletConnect from './components/WalletConnect';
import AdminPanel from './components/AdminPanel';
import PoolSwap from './components/PoolSwap';
import MiningPower from './components/MiningPower';
import NetworkEarnings from './components/NetworkEarnings';
import Redistribution from './components/Redistribution';
import NetworkTree from './components/NetworkTree';
import LandingPage from './components/LandingPage';
import Whitepaper from './components/Whitepaper';
import CapturePage from './components/CapturePage';
import DebugInfo from './components/DebugInfo';
import PokerPage from './components/poker/PokerPage';
import { canAccessPoker, isPokerAdmin, isPokerPublic, setPokerPublic } from './config/pokerAccess';
import './components/poker/poker.css';
import './index.css';

function App() {
  const [showWhitepaper, setShowWhitepaper] = useState(false);
  const [showCapturePage, setShowCapturePage] = useState(false);
  const [showPoker, setShowPoker] = useState(false);
  const [pokerPublic, setPokerPublicState] = useState(isPokerPublic());
  const [referrerFromUrl, setReferrerFromUrl] = useState(null);
  const autoConnectAttempted = useRef(false);
  const {
    account,
    provider,
    signer,
    chainId,
    isConnecting,
    isConnected,
    isCorrectNetwork,
    error,
    connect,
    disconnect,
    switchNetwork,
  } = useWallet();

  const contracts = useContracts(signer, provider);

  // Check for referrer in URL and capture parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    const showCapture = urlParams.get('capture') !== null;

    if (ref) {
      sessionStorage.setItem('referrer', ref);
      setReferrerFromUrl(ref);

      // Mostrar pagina de captura APENAS se tem o parametro &capture na URL
      if (showCapture) {
        setShowCapturePage(true);
      }
    }
  }, []);

  // Auto-connect quando vem do deep link (tem ref mas NAO tem capture)
  // Usa delay para dar tempo da wallet injetar o provider
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    const hasCapture = urlParams.get('capture') !== null;

    // Se tem ref, NAO tem capture, ainda nao esta conectado, e nao tentou ainda
    if (ref && !hasCapture && !isConnected && !isConnecting && connect && !autoConnectAttempted.current) {
      autoConnectAttempted.current = true;

      // Funcao para tentar conectar com retry
      const tryConnect = async () => {
        // Aguardar 1.5 segundos para a wallet injetar o provider
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Verificar se ainda nao conectou
        if (!isConnected) {
          connect();
        }
      };

      tryConnect();
    }
  }, [isConnected, isConnecting, connect]);

  const hasPokerAccess = canAccessPoker(account);
  const isAdmin = isPokerAdmin(account);

  const handleTogglePokerPublic = () => {
    const next = !pokerPublic;
    setPokerPublic(next);
    setPokerPublicState(next);
  };

  // Poker fullscreen mode — so entra se tem acesso
  if (showPoker && hasPokerAccess) {
    return (
      <div className="min-h-screen">
        <WalletConnect
          account={account}
          isConnecting={isConnecting}
          connect={connect}
          disconnect={disconnect}
          isCorrectNetwork={isCorrectNetwork}
          switchNetwork={switchNetwork}
          error={error}
          contracts={contracts}
        />
        <PokerPage
          account={account}
          onBack={() => setShowPoker(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Barra superior com conexão */}
      <WalletConnect
        account={account}
        isConnecting={isConnecting}
        connect={connect}
        disconnect={disconnect}
        isCorrectNetwork={isCorrectNetwork}
        switchNetwork={switchNetwork}
        error={error}
        contracts={contracts}
      />

      {/* Conteúdo principal com efeito parallax */}
      <div className="py-6 sm:py-8 px-3 sm:px-4">
        <div className="max-w-7xl mx-auto">

        {/* Landing Page - Show when not connected */}
        {(!isConnected || !isCorrectNetwork) && (
          <LandingPage
            connect={connect}
            isConnecting={isConnecting}
            onOpenWhitepaper={() => setShowWhitepaper(true)}
          />
        )}

        {/* Whitepaper Modal */}
        {showWhitepaper && (
          <Whitepaper onClose={() => setShowWhitepaper(false)} />
        )}

        {/* Capture Page Modal */}
        {showCapturePage && (
          <CapturePage
            onClose={() => setShowCapturePage(false)}
            referrerAddress={referrerFromUrl || account}
            connect={connect}
          />
        )}

        {/* Main Content - Only show if wallet is connected and on correct network */}
        {isConnected && isCorrectNetwork && contracts && (
          <div className="space-y-6">
            {/* Row 0: Admin Panel (only visible to admins) */}
            <AdminPanel
              contracts={contracts}
              account={account}
              isCorrectNetwork={isCorrectNetwork}
            />

            {/* Poker — so aparece para enderecos autorizados */}
            {hasPokerAccess && (
              <div className="card bg-gradient-to-r from-emerald-900 to-teal-900 border-emerald-700 cursor-pointer hover:shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300" onClick={() => setShowPoker(true)}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl sm:text-5xl" style={{ lineHeight: 1 }}>&#9824;</div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-white mb-1">ZOD Poker</h3>
                      <p className="text-sm text-emerald-300 opacity-80">
                        Multiplayer on-chain poker. Play Texas Hold'em with tokenized chips on BSC.
                      </p>
                    </div>
                  </div>
                  <button
                    className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 px-6 rounded-xl transition-colors text-sm shadow-lg shadow-emerald-500/30"
                    onClick={(e) => { e.stopPropagation(); setShowPoker(true); }}
                  >
                    Play Now &#8594;
                  </button>
                </div>

                {/* Admin: toggle acesso publico */}
                {isAdmin && (
                  <div className="mt-3 pt-3 border-t border-emerald-700 flex items-center justify-between">
                    <span className="text-xs text-emerald-400">
                      Public access: <strong>{pokerPublic ? 'ACTIVE' : 'RESTRICTED'}</strong>
                    </span>
                    <button
                      className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-colors ${
                        pokerPublic
                          ? 'bg-red-600 hover:bg-red-500 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                      onClick={(e) => { e.stopPropagation(); handleTogglePokerPublic(); }}
                    >
                      {pokerPublic ? 'Disable public access' : 'Open to all'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Row 1: Pool Swap */}
            <PoolSwap
              contracts={contracts}
              account={account}
              isCorrectNetwork={isCorrectNetwork}
            />

            {/* Row 3: Mining Power System (Full Width) */}
            <MiningPower
              contracts={contracts}
              account={account}
              isCorrectNetwork={isCorrectNetwork}
            />

            {/* Row 4: Network Earnings Dashboard */}
            <NetworkEarnings
              contracts={contracts}
              account={account}
              isCorrectNetwork={isCorrectNetwork}
            />

            {/* Row 5: Redistribution System */}
            <Redistribution
              contracts={contracts}
              account={account}
              isCorrectNetwork={isCorrectNetwork}
            />

            {/* Row 6: Network Matrix Visualization */}
            <NetworkTree
              contracts={contracts}
              account={account}
              isCorrectNetwork={isCorrectNetwork}
            />
          </div>
        )}

        {/* Debug Info - Floating button */}
        <DebugInfo
          contracts={contracts}
          account={account}
          provider={provider}
          chainId={chainId}
          isCorrectNetwork={isCorrectNetwork}
        />
        </div>
      </div>
    </div>
  );
}

export default App;