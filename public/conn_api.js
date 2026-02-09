// conn_api.js — API única de conexão (ethers v6) — BSC Testnet por padrão
// Exporte global: window.ZodConn
// Eventos disparados no window: 'wallet:connected', 'wallet:disconnected', 'wallet:chainChanged', 'wallet:accountsChanged'
(function () {
  if (window.ZodConn) return; // evita duplicar

  const CHAIN_CONFIG = {
    chainId: "0x61", // 97 (hex) — BSC Testnet
    chainName: "BSC Testnet",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
    blockExplorerUrls: ["https://testnet.bscscan.com"]
  };

  const state = {
    provider: null,
    signer: null,
    account: null,
    chainIdHex: null,
    connected: false
  };

  function formatAddress(address) {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async function ensureChain(chainHex = CHAIN_CONFIG.chainId) {
    if (!window.ethereum) throw new Error("Carteira não encontrada (ethereum provider ausente).");
    const current = await window.ethereum.request({ method: "eth_chainId" });
    state.chainIdHex = current;
    if (current === chainHex) return true;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      state.chainIdHex = chainHex;
      return true;
    } catch (err) {
      if (err?.code === 4902 || /add.*chain/i.test(err?.message || "")) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chainHex,
            chainName: CHAIN_CONFIG.chainName,
            nativeCurrency: CHAIN_CONFIG.nativeCurrency,
            rpcUrls: CHAIN_CONFIG.rpcUrls,
            blockExplorerUrls: CHAIN_CONFIG.blockExplorerUrls
          }]
        });
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
        state.chainIdHex = chainHex;
        return true;
      }
      throw err;
    }
  }

  async function connect() {
    try {
      if (!window.ethereum) {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const msg = isMobile
          ? "📱 Abra no navegador do MetaMask/Trust Wallet para conectar."
          : "🦊 Instale o MetaMask para conectar.";
        throw new Error(msg);
      }
      state.provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await state.provider.send("eth_requestAccounts", []);
      state.account = accounts[0];
      await ensureChain();
      state.signer = await state.provider.getSigner();
      state.connected = true;
      window.isWalletConnected = true;
      window.userWallet = state.account;
      window.userAddress = state.account;
      window.dispatchEvent(new CustomEvent('wallet:connected', { detail: { account: state.account, chainId: state.chainIdHex } }));

      // auto-wire listeners (uma única vez)
      if (!window.__zodconn_wired__) {
        window.ethereum.on('accountsChanged', (accs) => {
          state.account = (accs && accs[0]) || null;
          window.userWallet = state.account;
          window.userAddress = state.account;
          window.dispatchEvent(new CustomEvent('wallet:accountsChanged', { detail: { account: state.account } }));
          if (!state.account) disconnect();
        });
        window.ethereum.on('chainChanged', (hex) => {
          state.chainIdHex = hex;
          window.dispatchEvent(new CustomEvent('wallet:chainChanged', { detail: { chainId: hex } }));
          // por compatibilidade com implementações anteriores:
          if (typeof window.location !== 'undefined') {
            try { window.location.reload(); } catch(_) {}
          }
        });
        window.__zodconn_wired__ = true;
      }
      return state.account;
    } catch (e) {
      disconnect();
      throw e;
    }
  }

  function disconnect() {
    state.provider = null;
    state.signer = null;
    state.account = null;
    state.connected = false;
    window.isWalletConnected = false;
    window.userWallet = null;
    window.userAddress = null;
    window.dispatchEvent(new CustomEvent('wallet:disconnected'));
  }

  function getProvider() { return state.provider; }
  function getSigner() { return state.signer; }
  function getAccount() { return state.account; }
  function isConnected() { return !!state.connected; }

  // helper de servidor (mantém compat com index.html)
  function getServerUrl() {
    const el = document.getElementById("serverUrl");
    if (el && typeof el.value === 'string' && el.value.trim()) return el.value.trim();
    // fallback usado no index.html atual
    return "https://zodplay.space";
  }

  window.ZodConn = {
    CHAIN_CONFIG,
    state,
    connect,
    disconnect,
    ensureChain,
    getProvider,
    getSigner,
    getAccount,
    isConnected,
    formatAddress,
    getServerUrl
  };

  // adapters de compatibilidade com o front existente
  window.connectWallet = connect;
  window.disconnectWallet = disconnect;
})(); 
