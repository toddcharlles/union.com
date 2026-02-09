// poker_web3.js - Frontend Web3 (Ethers v6) — COMMUNITY-ONLY (sem mesa padrão)
// Atualizado com sistema de popups (toasts), confirmação e loading
// - Toasts via window.notify.toast / window.showMessage
// - Confirmação via window.notify.confirm
// - Overlay de loading via window.notify.loading
// - **Sem mesa padrão**: só mesas da comunidade (Factory / importadas / conhecidas)
// - Compatível com mobile (MetaMask/TrustWallet mobile browsers)

/*****************************************************************
 * NOTIFIER (Toast + Confirm + Loading) — robusto (DOM ready, z-index alto)
 *****************************************************************/
(() => {
  function bootNotifier() {
    // FIX: getElementById (não getElementBy)
    if (document.getElementById('pkr-toast-wrap')) return; // evita duplicar

    const css = `
    .pkr-toast-wrap{
      position:fixed !important;
      left:0 !important; right:0 !important; bottom:20px !important; top:auto !important;
      display:flex; flex-direction:column; align-items:center; gap:8px;
      z-index:2147483647 !important; pointer-events:none
    }
    .pkr-toast{
      pointer-events:auto; min-width:260px; max-width:92vw; padding:12px 14px; border-radius:12px;
      box-shadow:0 10px 25px rgba(0,0,0,.18); background:#0b1020; color:#fff;
      font:14px/1.35 system-ui,Segoe UI,Roboto,Ubuntu,sans-serif;
      display:flex; align-items:center; gap:10px; transform:translateY(6px); opacity:.98
    }
    .pkr-toast.success{background:#064e3b}.pkr-toast.error{background:#7f1d1d}.pkr-toast.info{background:#1f2937}
    .pkr-toast .pkr-close{margin-left:auto;opacity:.8;cursor:pointer}

    .pkr-overlay{
      position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important;
      background:rgba(0,0,0,.35); backdrop-filter:saturate(180%) blur(2px);
      display:flex; align-items:center; justify-content:center; z-index:2147483646 !important
    }
    .pkr-dialog{
      background:#0b1020;color:#fff;padding:18px;width:min(92vw,380px);border-radius:12px;
      box-shadow:0 12px 30px rgba(0,0,0,.25)
    }
    .pkr-dialog h3{margin:0 0 8px;font-size:18px}.pkr-dialog p{margin:0 0 14px;color:#cbd5e1}
    .pkr-actions{display:flex;gap:8px;justify-content:flex-end}
    .pkr-btn{padding:8px 12px;border-radius:10px;border:none;cursor:pointer}
    .pkr-btn.primary{background:#2563eb;color:#fff}.pkr-btn.ghost{background:#111827;color:#e5e7eb}

    .pkr-loading{
      position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important;
      display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.25);
      z-index:2147483645 !important
    }
    .pkr-spin{width:44px;height:44px;border-radius:50%;border:4px solid #fff3;border-top-color:#fff;animation:pkr-spin 1s linear infinite}
    @keyframes pkr-spin{to{transform:rotate(360deg)}}
    `;

    const st = document.createElement('style');
    st.id = 'pkr-notifier-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);

    const wrap = document.createElement('div');
    wrap.id = 'pkr-toast-wrap';
    wrap.className = 'pkr-toast-wrap';
    (document.body || document.documentElement).appendChild(wrap);

    function toast(message, opts = {}) {
      const t = document.createElement('div');
      t.className = 'pkr-toast ' + (opts.type || 'info');
      t.innerHTML = `<span>${message}</span><span class="pkr-close">✕</span>`;
      wrap.appendChild(t);
      const close = () => { t.style.opacity='0'; t.style.transform='translateY(10px)'; setTimeout(()=>t.remove(),180); };
      t.querySelector('.pkr-close').onclick = close;
      const ms = (opts.duration ?? 4500);
      if (ms > 0) setTimeout(close, ms);
      return close;
    }

    function loading(message = 'Processando...') {
      const ov = document.createElement('div'); ov.className = 'pkr-loading';
      ov.innerHTML = `<div class="pkr-dialog" style="display:flex;gap:12px;align-items:center">
        <div class="pkr-spin"></div><div class="pkr-msg">${message}</div></div>`;
      (document.body || document.documentElement).appendChild(ov);
      // retorna função para atualizar texto ou fechar
      return (nextMsg) => {
        if (typeof nextMsg === 'string') ov.querySelector('.pkr-msg').textContent = nextMsg;
        else ov.remove();
      };
    }

    function confirmDialog({ title='Confirmar', message='', okText='Confirmar', cancelText='Cancelar' } = {}) {
      return new Promise(resolve => {
        const ov = document.createElement('div'); ov.className = 'pkr-overlay';
        ov.innerHTML = `<div class="pkr-dialog"><h3>${title}</h3><p>${message}</p>
          <div class="pkr-actions">
            <button class="pkr-btn ghost">${cancelText}</button>
            <button class="pkr-btn primary">${okText}</button>
          </div></div>`;
        (document.body || document.documentElement).appendChild(ov);
        const [btnCancel, btnOk] = ov.querySelectorAll('button');
        btnCancel.onclick = () => { ov.remove(); resolve(false); };
        btnOk.onclick = () => { ov.remove(); resolve(true); };
        ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); resolve(false); } });
      });
    }

    // API global
    window.notify = { toast, loading, confirm: confirmDialog, ping: () => true };

    // Substitui showMessage do app por toasts (sem quebrar se outro script sobrescrever depois)
    if (!window.showMessage || typeof window.showMessage !== 'function') {
      window.showMessage = (msg, isError = false) =>
        toast(msg, { type: isError ? 'error' : 'success' });
    } else {
      // Mantém a sua, mas expõe um atalho para chamar o toast direto:
      window.toast = (msg, type='info') => toast(msg, { type });
    }

    // Transformar erros não tratados em toasts
    window.addEventListener('unhandledrejection', (e) => {
      const m = (e.reason && (e.reason.message || e.reason.reason)) || String(e.reason || 'Erro desconhecido');
      toast('Erro: ' + m, { type: 'error' });
    });
  }

  // Garante que o body exista
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNotifier, { once: true });
  } else {
    bootNotifier();
  }
})();

/***********************
 * ESTADO GLOBAL
 ***********************/
let web3Provider = null;
window.userWallet = null; // global p/ poker.js acessar
let contracts = {};       // { chips, table, cashier, factory }
window.contracts = contracts; // exposto p/ poker.js
window.isWalletConnected = false; // exposto p/ poker.js
let lastNetworkId = null;
let factoryContract = null;

/***********************
 * CONFIG DA REDE (BSC Testnet)
 ***********************/
const CHAIN_CONFIG = {
  chainId: "0x61", // 97 (hex)
  chainName: "BSC Testnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
  blockExplorerUrls: ["https://testnet.bscscan.com"]
};

/***********************
 * ENDEREÇOS E ABIs
 ***********************/
const FALLBACK_CONTRACTS = {
  casinoChips: "0x03Aa87f7B6Ba0cda79EF6DECeF8FAbc9Af457D96",
  cashier:     "0xC2906be80C4EAf1085A558f6553936cD6115CaB1",

  // COMMUNITY-ONLY: removido pokerTable padrão
  pokerTable:  null,
};

const PREFERRED_USDT_ADDRESS = "0xE6D6c6CB1048Fb5341FA63D7DB934a8E5910eA6A";

const FACTORY_ABI = [
  "function createTable(string tableIdText, uint16 feeBps, bool makePublic, uint16 tableMaxSeats) external",
  "function getTable(string tableIdText) view returns (address)",
  "function canCreateTable(address user) view returns (bool ok, string reason)",
  "function createPrice() view returns (uint256)",
  "function isEligibleToCreate(address user) view returns (bool)",
  "event TableCreated(string indexed tableIdText, address indexed table, address indexed creator)"
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const CHIPS_ABI = ERC20_ABI.slice();

const TABLE_ABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function withdrawAll()",
  "function balance(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function balances(address) view returns (uint256)",
  "function playerBalance(address) view returns (uint256)",
  "function feeBps() view returns (uint16)",
  "function occupancy() view returns (uint16 _seated, uint16 _max, bool _full, bool _empty, uint256 _wait)",
  "function playerBalances(address) view returns (uint256)"
];

const CASHIER_ABI = [
  "function buyChips(uint256 usdtAmount)",
  "function redeemChips(uint256 chipAmount)",
  "function previewBuy(uint256) view returns (uint256 chipsOut, uint256 feeLiquidity, uint256 feeTreasury)",
  "function previewRedeem(uint256) view returns (uint256 usdtOut)",
  "function isEligible(address) view returns (bool)",
  "function usdt() view returns (address)",
  "function stable() view returns (address)",
  "function stableToken() view returns (address)",
  "function paymentToken() view returns (address)",
  "function quote() view returns (address)",
  "function quoteToken() view returns (address)",
  "function token() view returns (address)",
  "function minBuy() view returns (uint256)",
  "function maxBuy() view returns (uint256)"
];

const ERC20_ERRORS = [
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)"
];
const OZ_ERR_IFACE = new ethers.Interface(ERC20_ERRORS);

const TABLE_ERRORS = [
  "error NotSeated(address player)",
  "error RoundActive()",
  "error StillSeated(address player)",
  "error InsufficientBalance()",
  "error ZeroAmount()"
];
const TABLE_ERR_IFACE = new ethers.Interface(TABLE_ERRORS);

/***********************
 * HELPERS
 ***********************/
async function readTableMetaById(tableIdText) {
  const provider = window.web3Provider ?? new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcUrls[0]);
  const fac = new ethers.Contract(await getFactoryAddress(), FACTORY_ABI, provider);
  const tableAddr = await fac.getTable(tableIdText);
  if (!tableAddr || tableAddr === ethers.ZeroAddress) return null;

  const table = new ethers.Contract(tableAddr, TABLE_ABI, provider);
  const [bps, occ] = await Promise.all([
    table.feeBps(),
    table.occupancy().catch(()=>null)
  ]);
  return {
    tableAddr,
    feePct: (Number(bps)/100).toFixed(2),
    seated: occ ? Number(occ._seated) : null,
    max:    occ ? Number(occ._max)    : null,
    full:   occ ? !!occ._full         : null
  };
}



function resolveCurrentTableIdText(addrMaybe) {
  // 1) fontes mais fortes (setadas ao entrar pelo lobby / contexto atual)
  const byGlobals =
    window.selectedTableName ||
    window.activeTableIdText ||
    window.currentTableIdText ||
    window.lastTableIdText ||
    null;
  if (byGlobals) return byGlobals;

  // 2) localStorage do último uso
  try {
    const last = JSON.parse(localStorage.getItem('poker_last_table') || 'null');
    if (last?.id) return last.id;
  } catch {}

  // 3) procurar por endereço nas mesas conhecidas
  const addr = addrMaybe || deriveCurrentTableAddress();
  if (addr && Array.isArray(window.knownTables)) {
    const hit = window.knownTables.find(t => (t.address || '').toLowerCase() === String(addr).toLowerCase());
    if (hit?.id || hit?.name) return hit.id || hit.name;
  }

  return null; // não achou
}

async function waitUntilSeated(tableAddr, { timeoutMs = 45000, tickMs = 1200 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ok = await isSeatedOnChain(tableAddr);
      if (ok === true) return { ok: true };
    } catch (_) {}
    await new Promise(r => setTimeout(r, tickMs));
  }
  return { ok: false };
}

async function seatOnChainNow() {
  try {
    if (!window.isWalletConnected) return window.showMessage("Conecte sua wallet primeiro.", true);
    if (!await ensureBSCTestnet()) return;

    // garante contexto e descobre addr/idText sozinhos
    await ensureSelectedTableFromContext();
    const addr = deriveCurrentTableAddress();
    const idText = resolveCurrentTableIdText(addr);

    if (!addr)  return window.showMessage("Nenhuma mesa ativa. Entre na mesa primeiro.", true);
    if (!idText) return window.showMessage("Não consegui identificar o nome da mesa. Entre pelo lobby e tente novamente.", true);

    // Estado atual
    const [seated, active] = await Promise.all([isSeatedOnChain(addr), isRoundActive(addr)]);
    const btn = document.getElementById('seatOnChainBtn');
    const statusEl = document.getElementById('seatOnChainStatus');

    if (seated === true) {
      if (btn) { btn.disabled = true; btn.textContent = "✅ Já sentado"; }
      if (statusEl) statusEl.textContent = "Você já está sentado on-chain.";
      return;
    }

    // Dispara pedido de assento no servidor (fila se round ativo)
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Enviando pedido..."; }
    if (statusEl) statusEl.textContent = active ? "Round ativo: seu assento será aplicado após o settlement." : "Pedindo assento on-chain...";

    const res  = await fetch(`${getServerUrl()}/api/seat/${encodeURIComponent(idText)}/${window.userWallet}`, { method: 'POST' });
    let data = {};
    try { data = await res.json(); } catch { /* pode não vir JSON, ignorar */ }

    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = "🪑 Sentar on-chain"; }
      return window.showMessage(`Falha ao pedir assento: ${data?.error || res.statusText}`, true);
    }

    if (data?.queued) {
      window.showMessage("Pedido de assento enfileirado (round ativo). Será aplicado após o próximo settlement.", false);
      if (statusEl) statusEl.textContent = "Aguardando settlement para aplicar assento...";
    } else {
      window.showMessage("Assento solicitado. Verificando on-chain...", false);
      if (statusEl) statusEl.textContent = "Confirmando assento na blockchain...";
    }

    // Aguarda refletir on-chain
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Aguardando assento..."; }
    const { ok } = await waitUntilSeated(addr, { timeoutMs: data?.queued ? 120000 : 45000 });

    if (ok) {
      if (btn) { btn.disabled = true; btn.textContent = "✅ Já sentado"; }
      if (statusEl) statusEl.textContent = "Assento confirmado on-chain. Você já pode depositar.";
      try { await refreshBalances(); } catch {}
    } else {
      if (btn) { btn.disabled = false; btn.textContent = active ? "🪑 Sentar após round" : "🪑 Sentar on-chain"; }
      if (statusEl) statusEl.textContent = "Ainda não refletiu on-chain. Tente novamente após o settlement.";
      window.showMessage("Ainda não apareceu como sentado on-chain. Tente de novo mais tarde.", true);
    }
  } catch (e) {
    const btn = document.getElementById('seatOnChainBtn');
    if (btn) { btn.disabled = false; btn.textContent = "🪑 Sentar on-chain"; }
    window.showMessage("Erro ao sentar on-chain: " + (e?.message || e), true);
  } finally {
    // manter UI coerente mesmo após exceções
    try { await updateSeatButtonUI(); } catch {}
  }
}

async function isSeatedOnChain(tableAddr) {
  try {
    const r = await callViewRaw(tableAddr, 'function seated(address) view returns (bool)', 'seated', [window.userWallet]);
    return r === true;
  } catch { return null; }
}

async function isRoundActive(tableAddr) {
  try {
    const r = await callViewRaw(tableAddr, 'function roundActive() view returns (bool)', 'roundActive', []);
    return r === true;
  } catch { return null; }
}

async function assertValidTableAddress(tableAddr) {
  if (!ethers.isAddress(tableAddr)) throw new Error('Mesa inválida.');
  const [chipsAddr, cashierAddr, code] = await Promise.all([
    getChipsAddress().catch(() => null),
    getCashierAddress().catch(() => null),
    web3Provider.getCode(tableAddr).catch(() => '0x')
  ]);
  if (code === '0x') throw new Error('Endereço da mesa sem bytecode (contrato inexistente).');
  const bad = [chipsAddr, cashierAddr].filter(Boolean).map(a => a.toLowerCase());
  if (bad.includes(tableAddr.toLowerCase())) {
    throw new Error('Endereço da mesa está apontando para CHIPS/Cashier. Corrija o /api/blockchain/status.');
  }
  return true;
}

// --- 2) Ativar mesa por endereço: instancia com signer SE existir; senão, read-only ---
window.setActiveTableByAddress = async function (tableAddr) {
  if (!ethers.isAddress(tableAddr)) throw new Error("Endereço inválido");

  const hasWallet = !!window.web3Provider;
  const runner = hasWallet ? await window.web3Provider.getSigner()
                           : getReadProvider();

  window.contracts = window.contracts || {};
  window.contracts.table = new ethers.Contract(tableAddr, TABLE_ABI, runner);
  window.selectedTableAddress = tableAddr;

  // tenta casar com uma mesa conhecida para guardar o nome
  const known = (window.knownTables || []).find(
    t => (t.address || '').toLowerCase() === tableAddr.toLowerCase()
  );
  if (known?.name) window.selectedTableName = known.name;

  // persiste último contexto
  localStorage.setItem('poker_last_table', JSON.stringify({
    id: known?.id || known?.name || window.selectedTableName || '',
    address: tableAddr
  }));

  try { await syncContractLinks(); } catch {}
  try { await window.refreshBalances?.(); } catch {}

  console.log("[setActiveTableByAddress] usando mesa:", tableAddr,
              hasWallet ? "(signer)" : "(read-only)");
};

async function getTableContractById(tableIdText) {
  if (!window.web3Provider) throw new Error('web3Provider não inicializado');
  const signer = await window.web3Provider.getSigner();
  const fac =
    factoryContract ||
    window.contracts?.factory ||
    new ethers.Contract(await getFactoryAddress(), FACTORY_ABI, signer);

  const addr = await fac.getTable(tableIdText);
  if (!addr || addr === ethers.ZeroAddress) throw new Error('Mesa não encontrada na Factory');

  return new ethers.Contract(addr, TABLE_ABI, signer);
}

function formatAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getServerUrl() {
  return document.getElementById("serverUrl")?.value?.trim?.() || "http://localhost:3001";
}

async function getFactoryAddress() {
  const status = await fetchStatus();
  return status?.contracts?.factory || "0xfB3360C223322FDA1116B682f5f96062C47EE9D1";
}

async function ensureBSCTestnet() {
  try {
    const current = await window.ethereum.request({ method: "eth_chainId" });
    lastNetworkId = current;
    if (current === CHAIN_CONFIG.chainId) return true;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_CONFIG.chainId }]
      });
      return true;
    } catch (err) {
      if (err?.code === 4902 || /add.*chain/i.test(err?.message || "")) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CHAIN_CONFIG.chainId,
            chainName: CHAIN_CONFIG.chainName,
            nativeCurrency: CHAIN_CONFIG.nativeCurrency,
            rpcUrls: CHAIN_CONFIG.rpcUrls,
            blockExplorerUrls: CHAIN_CONFIG.blockExplorerUrls
          }]
        });
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_CONFIG.chainId }]
        });
        return true;
      }
      throw err;
    }
  } catch (err) {
    console.error("[ensureBSCTestnet] Erro:", err);
    window.showMessage("Erro ao conectar à BSC Testnet. Abra o site no navegador do MetaMask e aceite a rede 97.", true);
    return false;
  }
}

async function fetchStatus() {
  const url = `${getServerUrl()}/api/blockchain/status`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!data || !data.contracts) throw new Error("Payload sem 'contracts'");
    return data;
  } catch (err) {
    console.warn(`[status] falhou em ${url}:`, err);
    return null;
  }
}

async function getChipsAddress() {
  const s = await fetchStatus();
  const addr = s?.contracts?.casinoChips || FALLBACK_CONTRACTS.casinoChips;
  if (!ethers.isAddress(addr)) {
    window.showMessage("Endereço do contrato Chips inválido.", true);
    return null;
  }
  return addr;
}

async function getTableAddress() {
  // COMMUNITY-ONLY: sem fallback de mesa padrão
  const s = await fetchStatus();
  const addr = s?.contracts?.pokerTable || null;
  if (!addr) return null;
  if (!ethers.isAddress(addr)) {
    window.showMessage("Endereço do contrato Table inválido.", true);
    return null;
  }
  return addr;
}

async function getCashierAddress() {
  const s = await fetchStatus();
  const addr = s?.contracts?.cashier || FALLBACK_CONTRACTS.cashier;
  if (!ethers.isAddress(addr)) {
    window.showMessage("Endereço do contrato Cashier inválido.", true);
    return null;
  }
  return addr;
}

async function getPaymentTokenFromCashier() {
  try {
    const cashier = contracts?.cashier;
    if (!cashier) return null;
    const getters = ["paymentToken", "usdt", "stable", "stableToken", "quote", "quoteToken", "token"];
    for (const g of getters) {
      if (typeof cashier[g] !== "function") continue;
      try {
        const addr = await cashier[g]();
        if (ethers.isAddress(addr)) {
          console.log(`[getPaymentToken] via ${g}(): ${addr}`);
          return addr;
        }
      } catch (_) { /* getter pode não existir / falhar */ }
    }
    return null;
  } catch (err) {
    console.error("[getPaymentTokenFromCashier] Erro:", err);
    return null;
  }
}

function updateWalletUI() {
  const walletInfo = document.getElementById('walletInfo');
  if (!walletInfo) return;
  if (window.isWalletConnected && window.userWallet) {
    walletInfo.textContent = `Carteira: ${formatAddress(window.userWallet)}`;
    walletInfo.style.display = 'block';
  } else {
    walletInfo.textContent = 'Carteira desconectada';
    walletInfo.style.display = 'none';
  }
}

/***********************
 * CONTRATOS / CONEXÃO
 ***********************/
async function loadFactoryContract() {
  try {
    if (!web3Provider) throw new Error("Provider não inicializado");
    const signer = await web3Provider.getSigner();
    const factoryAddr = await getFactoryAddress();
    factoryContract = new ethers.Contract(factoryAddr, FACTORY_ABI, signer);
    contracts.factory = factoryContract;
    window.contracts = contracts;
    console.log("[loadFactoryContract] Factory carregada:", factoryAddr);
    return true;
  } catch (err) {
    console.error("[loadFactoryContract] Erro:", err);
    return false;
  }
}

async function loadContracts() {
  try {
    if (!web3Provider) throw new Error("Provider não inicializado (conecte a wallet)");
    const signer = await web3Provider.getSigner();
    const [chipsAddr, cashierAddr] = await Promise.all([
      getChipsAddress(),
      getCashierAddress(),
    ]);
    if (!chipsAddr || !cashierAddr) {
      throw new Error("Endereços de contratos não disponíveis (server + fallback falharam).");
    }
    contracts.chips = new ethers.Contract(chipsAddr, CHIPS_ABI, signer);
    // COMMUNITY-ONLY: não instanciar mesa padrão aqui
    contracts.cashier = new ethers.Contract(cashierAddr, CASHIER_ABI, signer);
    console.log("[loadContracts] OK:", { chipsAddr, cashierAddr });
    window.showMessage("Contratos base carregados!", false);
  } catch (err) {
    console.error("[loadContracts] Erro:", err);
    window.showMessage("Erro ao carregar contratos. Verifique o servidor ou a rede.", true);
    throw err;
  }
}

async function connectWallet() {
  try {
    if (typeof window.ethereum === 'undefined') {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.showMessage("📱 Abra este site no navegador do MetaMask para jogar.", true);
      } else {
        window.showMessage("🦊 Instale o MetaMask para jogar.", true);
      }
      return false;
    }
    web3Provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await web3Provider.send("eth_requestAccounts", []);
    window.userWallet = accounts[0];
    if (!await ensureBSCTestnet()) {
      throw new Error("Falha ao mudar para BSC Testnet");
    }
    await loadContracts();
    await loadFactoryContract();
    const createBtn = document.getElementById('createTableBtn');
    if (createBtn) createBtn.style.display = 'inline-block';
    window.isWalletConnected = true;
    window.showMessage(`Wallet conectada: ${formatAddress(window.userWallet)}`, false);
    updateWalletUI();
    await refreshBalances();
    window.ethereum.on('accountsChanged', disconnectWallet);
    window.ethereum.on('chainChanged', () => window.location.reload());
    return true;
  } catch (err) {
    console.error("[connectWallet] Erro:", err);
    window.showMessage("Erro ao conectar wallet: " + (err.message || err), true);
    disconnectWallet();
    return false;
  }
}

function disconnectWallet() {
  web3Provider = null;
  window.userWallet = null;
  contracts = {};
  window.contracts = contracts;
  window.isWalletConnected = false;
  const createBtn = document.getElementById('createTableBtn');
  if (createBtn) createBtn.style.display = 'none';
  factoryContract = null;
  updateWalletUI();
  window.showMessage("Wallet desconectada.", false);
}

/***********************
 * SALDO NA MESA (GENÉRICO)
 ***********************/
const _TABLE_BALANCE_METHODS = ["balance", "balanceOf", "playerBalance", "playerBalances", "balances"];

async function readTableBalanceGeneric(addr, tableInstance) {
  if (!addr || !tableInstance) return 0n;
  try {
    const provider = tableInstance.runner?.provider || tableInstance.provider || (web3Provider ?? null);
    if (!provider) return 0n;
    const to = tableInstance.target || tableInstance.address;
    for (const m of _TABLE_BALANCE_METHODS) {
      try {
        const sig = ({
          balance: "function balance(address) view returns (uint256)",
          balanceOf: "function balanceOf(address) view returns (uint256)",
          playerBalance: "function playerBalance(address) view returns (uint256)",
          playerBalances: "function playerBalances(address) view returns (uint256)",
          balances: "function balances(address) view returns (uint256)",
        })[m];
        if (!sig) continue;
        const iface = new ethers.Interface([sig]);
        const data = iface.encodeFunctionData(m, [addr]);
        const raw = await provider.call({ to, data });
        if (!raw || raw === "0x" || ethers.getBytes(raw).length < 32) continue;
        const [value] = iface.decodeFunctionResult(m, raw);
        if (value !== undefined && value !== null) return BigInt(value);
      } catch (_) {}
    }
  } catch (_) {}
  return 0n;
}

async function readChipsDecimalsSafe() {
  try {
    return await contracts.chips.decimals();
  } catch {
    return 18;
  }
}

async function callViewRaw(to, sig, method, args = []) {
  try {
    const iface = new ethers.Interface([sig]);
    const data = iface.encodeFunctionData(method, args);
    const raw = await web3Provider.call({ to, data });
    if (!raw || raw === '0x' || ethers.getBytes(raw).length < 32) return null;
    const out = iface.decodeFunctionResult(method, raw);
    return Array.isArray(out) ? out[0] : out;
  } catch {
    return null;
  }
}

async function resolveTableChipsAddress(tableAddr) {
  const candidates = [
    { m: 'chips', sig: 'function chips() view returns (address)' },
    { m: 'token', sig: 'function token() view returns (address)' },
    { m: 'casinoChips', sig: 'function casinoChips() view returns (address)' },
    { m: 'chip', sig: 'function chip() view returns (address)' },
    { m: 'CHIPS', sig: 'function CHIPS() view returns (address)' },
  ];
  for (const c of candidates) {
    const addr = await callViewRaw(tableAddr, c.sig, c.m);
    if (addr && ethers.isAddress(addr) && addr !== ethers.ZeroAddress) return addr;
  }
  return contracts?.chips?.target || contracts?.chips?.address || null;
}

async function getTableMinDeposit(tableAddr) {
  const candidates = [
    { m: 'minBuyin', sig: 'function minBuyin() view returns (uint256)' },
    { m: 'minBuy', sig: 'function minBuy() view returns (uint256)' },
    { m: 'MIN_BUYIN', sig: 'function MIN_BUYIN() view returns (uint256)' },
    { m: 'minDeposit', sig: 'function minDeposit() view returns (uint256)' },
  ];
  for (const c of candidates) {
    const v = await callViewRaw(tableAddr, c.sig, c.m);
    if (typeof v === 'bigint' && v > 0n) return v;
  }
  return null;
}

/***********************
 * CONTEXTO DA MESA ATUAL / AUTO-SELEÇÃO
 ***********************/
// --- 3) Ativar mesa por id: resolve na Factory em modo leitura quando preciso ---
window.setActiveTableById = async function (tableIdText) {
  const provider = getReadProvider();
  const runner = window.web3Provider ? await window.web3Provider.getSigner() : provider;

  const fac = new ethers.Contract(await getFactoryAddress(), FACTORY_ABI, provider);
  const addr = await fac.getTable(tableIdText);
  if (!addr || addr === ethers.ZeroAddress) throw new Error("Mesa não encontrada na Factory");

  window.contracts = window.contracts || {};
  window.contracts.table = new ethers.Contract(addr, TABLE_ABI, runner);
  window.selectedTableAddress = addr;
  window.selectedTableName = tableIdText;

  localStorage.setItem('poker_last_table', JSON.stringify({ id: tableIdText, address: addr }));

  try { await syncContractLinks(); } catch {}
  try { await window.refreshBalances?.(); } catch {}

  console.log("[setActiveTableById] usando mesa:", tableIdText, "->", addr,
              window.web3Provider ? "(signer)" : "(read-only)");
};

window.setCurrentTableContext = function ({ idText, address, name } = {}) {
  if (address && ethers.isAddress(address)) {
    window.setActiveTableByAddress(address);
    if (name) window.selectedTableName = name;
    if (idText) localStorage.setItem('poker_last_table', JSON.stringify({ id: idText, address }));
  } else if (idText) {
    window.setActiveTableById(idText).catch(e => console.warn("[setCurrentTableContext]", e));
  }
};

async function ensureSelectedTableFromContext() {
  if (window.selectedTableAddress) return window.selectedTableAddress;

  const addr = window.contracts?.table?.target || window.contracts?.table?.address;
  if (addr) {
    window.selectedTableAddress = addr;
    return addr;
  }

  try {
    const last = JSON.parse(localStorage.getItem('poker_last_table') || 'null');
    if (last?.address && ethers.isAddress(last.address)) {
      window.selectedTableAddress = last.address;
      window.selectedTableName = last.id || last.name || 'Mesa Atual';
      return last.address;
    }
  } catch {}

  const idText =
    window.activeTableIdText ||
    window.currentTableIdText ||
    window.lastTableIdText || null;
    (window.gameState && window.gameState.tableIdText) || 
    null;
  if (idText) {
    try {
      await window.setActiveTableById(idText);
      return window.selectedTableAddress || null;
    } catch (e) {
      console.warn("[ensureSelectedTableFromContext] falhou resolver por idText:", idText, e);
    }
  }

  return null;
}

/***********************
 * SALDOS E AÇÕES
 ***********************/
async function updateSeatButtonUI() {
  try {
    // garante que temos mesa carregada do contexto/lobby/localStorage
    await ensureSelectedTableFromContext();
    const addr = deriveCurrentTableAddress();
    const btn = document.getElementById('seatOnChainBtn');
    const statusEl = document.getElementById('seatOnChainStatus');

    if (!btn) return; // botão não está na tela atual
    if (!addr) {
      btn.disabled = true;
      btn.textContent = "🪑 Sentar on-chain";
      if (statusEl) statusEl.textContent = "Entre numa mesa para sentar on-chain.";
      return;
    }

    const [seated, active] = await Promise.all([isSeatedOnChain(addr), isRoundActive(addr)]);
    if (seated === true) {
      btn.disabled = true;
      btn.textContent = "✅ Já sentado";
      if (statusEl) statusEl.textContent = "Você já está sentado on-chain.";
    } else {
      btn.disabled = false;
      btn.textContent = active ? "🪑 Sentar após round" : "🪑 Sentar on-chain";
      if (statusEl) statusEl.textContent = active
        ? "Round ativo: o assento será aplicado após o settlement."
        : "";
    }
  } catch (e) {
    // falha silenciosa para não travar a UI
    const btn = document.getElementById('seatOnChainBtn');
    if (btn) { btn.disabled = false; btn.textContent = "🪑 Sentar on-chain"; }
  }
}

async function refreshBalances() {
  try {
    if (!window.isWalletConnected || !contracts.chips) return;
    const [chipsBalBN, chipsDec] = await Promise.all([
      contracts.chips.balanceOf(window.userWallet),
      readChipsDecimalsSafe()
    ]);
    let tableBalBN = 0n;
    try {
      tableBalBN = await readTableBalanceGeneric(window.userWallet, contracts.table);
    } catch (e) {
      console.warn("[refreshBalances] Falha ao ler saldo da mesa, usando 0.", e);
      tableBalBN = 0n;
    }
    const walletEl = document.getElementById('walletChipsBalance');
    const tableEl = document.getElementById('tableChipsBalance');
    if (walletEl) walletEl.textContent = `${ethers.formatUnits(chipsBalBN, chipsDec)} CHIPS`;
    if (tableEl) tableEl.textContent = `${ethers.formatUnits(tableBalBN, chipsDec)} CHIPS`;
  } catch (err) {
    console.error("[refreshBalances] Erro:", err);
    window.showMessage("Erro ao atualizar saldos.", true);
  }
}

async function depositChips(humanAmount, tableAddrOverride) {
  try {
    if (!window.isWalletConnected) throw new Error("Wallet desconectada");
    if (!await ensureBSCTestnet()) throw new Error("Rede incorreta");

    const tableAddr =
      tableAddrOverride ||
      window.selectedTableAddress ||
      (contracts.table && (contracts.table.target || contracts.table.address));

    if (!tableAddr) throw new Error("Mesa não definida para depósito");
    await assertValidTableAddress(tableAddr);

    const signer = await web3Provider.getSigner();
    const tableContract = new ethers.Contract(tableAddr, TABLE_ABI, signer);

    // Descobre o token CHIPS utilizado pela mesa (chips(), token(), etc.)
    const requiredChipsAddr = await resolveTableChipsAddress(tableAddr);
    if (!requiredChipsAddr) return window.showMessage("Não foi possível descobrir o token CHIPS da mesa.", true);
    const chipsToken = new ethers.Contract(requiredChipsAddr, ERC20_ABI, signer);

    const dec    = await chipsToken.decimals().catch(() => 18);
    const amount = ethers.parseUnits(String(humanAmount), dec);

    // Pré-checagens comuns que causam revert "mudo"
    const [seated, active] = await Promise.all([
      isSeatedOnChain(tableAddr),
      isRoundActive(tableAddr)
    ]);

    if (active === true) {
      return window.showMessage('Depósito bloqueado: round on-chain ativo. Aguarde o settlement.', true);
    }

    // Se não estiver seated e round não está ativo, tenta assentar via servidor
    if (active === false && seated === false) {
      const idText = window.selectedTableName || window.lastTableIdText;
      if (idText) {
        try {
          await fetch(`${getServerUrl()}/api/seat/${idText}/${window.userWallet}`, { method: 'POST' });
          await new Promise(r => setTimeout(r, 1200));
          if (await isSeatedOnChain(tableAddr)) {
            window.showMessage("Você foi sentado on-chain. Prosseguindo com o depósito...", false);
          } else {
            return window.showMessage("Depósito bloqueado: sente-se na mesa primeiro.", true);
          }
        } catch (e) {
          return window.showMessage("Não consegui sentar on-chain automaticamente. Tente pelo lobby/servidor.", true);
        }
      } else {
        return window.showMessage("Depósito bloqueado: não consegui identificar a mesa atual para sentar.", true);
      }
    } else if (seated === false) {
      return window.showMessage('Depósito bloqueado: você ainda NÃO está sentado on-chain nesta mesa.', true);
    }

    const minDep = await getTableMinDeposit(tableAddr);
    if (minDep && amount < minDep) {
      return window.showMessage(`Depósito abaixo do mínimo: ${ethers.formatUnits(minDep, dec)} CHIPS.`, true);
    }

    const bal = await chipsToken.balanceOf(window.userWallet);
    if (bal < amount) {
      return window.showMessage(`Saldo de CHIPS insuficiente: ${ethers.formatUnits(bal, dec)} CHIPS.`, true);
    }

    // Aprovação
    let alw = await chipsToken.allowance(window.userWallet, tableAddr);
    if (alw < amount) {
      if (alw > 0n) {
        window.showMessage("Limpando allowance de CHIPS (1/2)...", false);
        const tx0 = await chipsToken.approve(tableAddr, 0);
        await tx0.wait();
      }
      window.showMessage("Aprovando CHIPS para a mesa (2/2)...", false);
      const txA = await chipsToken.approve(tableAddr, amount);
      await txA.wait();
    }

    // Simulação opcional
    try {
      if (tableContract.deposit?.staticCall) {
        await tableContract.deposit.staticCall(amount);
      }
    } catch (e) {
      const raw = e?.data || e?.value || e?.info?.error?.data || e?.error?.data || null;
      const why = decodeRevertData(raw) || (e?.reason || e?.message || "revert");
      return window.showMessage(`Depósito bloqueado: ${why}`, true);
    }

    console.log('[deposit] to(table):', tableAddr, 'chips:', requiredChipsAddr, 'amount:', humanAmount);
    window.showMessage("Enviando depósito para a mesa...", false);
    const tx = await tableContract.deposit(amount);
    await tx.wait();
    window.showMessage("✅ Depósito feito! Verifique seus saldos.", false);
    refreshBalances();
  } catch (err) {
    console.error("[depositChips] Erro:", err);
    const raw = err?.data || err?.value || err?.info?.error?.data || err?.error?.data || null;
    const why = decodeRevertData(raw) || (err?.reason || err?.message || "Tente novamente!");
    window.showMessage("Erro no depósito: " + why, true);
  }
}



async function withdrawChips(humanAmount, tableAddrOverride) {
  try {
    if (!window.isWalletConnected) throw new Error("Wallet desconectada");
    if (!await ensureBSCTestnet()) throw new Error("Rede incorreta");

    const tableAddr =
      tableAddrOverride ||
      window.selectedTableAddress ||
      (contracts.table && (contracts.table.target || contracts.table.address));
    if (!tableAddr) throw new Error("Mesa não definida para saque");

    const signer = await web3Provider.getSigner();
    const tableContract = new ethers.Contract(tableAddr, TABLE_ABI, signer);

    const dec = await readChipsDecimalsSafe();
    const amount = ethers.parseUnits(String(humanAmount), dec);
    if (amount <= 0n) { window.showMessage("Valor precisa ser > 0.", true); return false; }

    const balBN = await readTableBalanceGeneric(window.userWallet, tableContract);
    if (balBN <= 0n) { window.showMessage("Seu saldo na mesa é 0. Nada para sacar.", true); return false; }
    if (amount > balBN) {
      const avail = ethers.formatUnits(balBN, dec);
      window.showMessage(`Saldo insuficiente na mesa. Disponível: ${avail} CHIPS.`, true);
      return false;
    }

    try {
      if (tableContract.withdraw?.staticCall) {
        await tableContract.withdraw.staticCall(amount);
      }
    } catch (e) {
      const raw = e?.data || e?.value || e?.info?.error?.data || e?.error?.data || null;
      const decoded = decodeRevertData(raw);
      const why = decoded || (await explainWithdrawBlock(tableAddr, amount, dec, tableContract));
      window.showMessage(`Saque bloqueado: ${why}`, true);
      return false;
    }

    let overrides = {};
    try {
      const est = await tableContract.withdraw.estimateGas?.(amount);
      if (est && typeof est === "bigint") overrides.gasLimit = est + (est / 5n);
    } catch (_) {}

    window.showMessage("Enviando saque...", false);
    const tx = await tableContract.withdraw(amount, overrides);
    await tx.wait();
    window.showMessage("✅ Saque feito! Verifique seus saldos.", false);
    refreshBalances();
    return true;
  } catch (err) {
    console.error("[withdrawChips] Erro:", err);
    const raw = err?.data || err?.value || err?.info?.error?.data || err?.error?.data || null;
    const why = decodeRevertData(raw) || (err?.reason || err?.message || "Tente novamente!");
    window.showMessage("Erro no saque: " + why, true);
    return false;
  }
}

async function withdrawAllChips(tableAddrOverride) {
  try {
    if (!window.isWalletConnected) throw new Error("Wallet desconectada");
    if (!await ensureBSCTestnet()) throw new Error("Rede incorreta");

    const tableAddr =
      tableAddrOverride ||
      window.selectedTableAddress ||
      (contracts.table && (contracts.table.target || contracts.table.address));
    if (!tableAddr) throw new Error("Mesa não definida para saque");

    const signer = await web3Provider.getSigner();
    const tableContract = new ethers.Contract(tableAddr, TABLE_ABI, signer);

    const balBN = await readTableBalanceGeneric(window.userWallet, tableContract);
    if (balBN <= 0n) { window.showMessage("Seu saldo na mesa é 0. Nada para sacar.", true); return false; }

    try {
      if (tableContract.withdrawAll?.staticCall) {
        await tableContract.withdrawAll.staticCall();
      }
    } catch (e) {
      const raw = e?.data || e?.value || e?.info?.error?.data || e?.error?.data || null;
      const decoded = decodeRevertData(raw);
      const dec = await readChipsDecimalsSafe();
      const why = decoded || (await explainWithdrawBlock(tableAddr, balBN, dec, tableContract));
      window.showMessage(`Saque total bloqueado: ${why}`, true);
      return false;
    }

    let overrides = {};
    try {
      const est = await tableContract.withdrawAll.estimateGas?.();
      if (est && typeof est === "bigint") overrides.gasLimit = est + (est / 5n);
    } catch (_) {}

    window.showMessage("Enviando saque total...", false);
    const tx = await tableContract.withdrawAll(overrides);
    await tx.wait();
    window.showMessage("✅ Saque total feito! Verifique seus saldos.", false);
    refreshBalances();
    return true;
  } catch (err) {
    console.error("[withdrawAllChips] Erro:", err);
    const raw = err?.data || err?.value || err?.info?.error?.data || err?.error?.data || null;
    const why = decodeRevertData(raw) || (err?.reason || err?.message || "Tente novamente!");
    window.showMessage("Erro no saque total: " + why, true);
    return false;
  }
}

async function buyChipsWithUSDT(humanUsdt) {
  try {
    if (!window.isWalletConnected) throw new Error("Wallet desconectada");
    if (!await ensureBSCTestnet()) throw new Error("Rede incorreta");

    const paymentAddr = await getPaymentTokenFromCashier() || PREFERRED_USDT_ADDRESS;
    if (!ethers.isAddress(paymentAddr)) return window.showMessage("Token de pagamento inválido no Cashier.", true);

    const signer = await web3Provider.getSigner();
    const usdt   = new ethers.Contract(paymentAddr, ERC20_ABI, signer);
    const dec    = await usdt.decimals().catch(() => 6);
    const amount = ethers.parseUnits(String(humanUsdt), dec);

    const [minBuy, maxBuy, eligible] = await Promise.all([
      contracts.cashier.minBuy?.().catch(() => 0n),
      contracts.cashier.maxBuy?.().catch(() => 0n),
      contracts.cashier.isEligible?.(window.userWallet).catch(() => true),
    ]);
    if (eligible === false) return window.showMessage("Sua carteira não é elegível para comprar CHIPS.", true);
    if (minBuy && amount < minBuy) return window.showMessage(`Valor mínimo: ${ethers.formatUnits(minBuy, dec)} USDT.`, true);
    if (maxBuy && maxBuy > 0n && amount > maxBuy) return window.showMessage(`Valor máximo: ${ethers.formatUnits(maxBuy, dec)} USDT.`, true);

    const spender = contracts.cashier.target || contracts.cashier.address;
    const bal = await usdt.balanceOf(window.userWallet);
    if (bal < amount) return window.showMessage(`Saldo USDT insuficiente: ${ethers.formatUnits(bal, dec)} USDT.`, true);

    let alw = await usdt.allowance(window.userWallet, spender);
    if (alw < amount) {
      if (alw > 0n) {
        window.showMessage("Limpando allowance USDT (1/2)...", false);
        const tx0 = await usdt.approve(spender, 0);
        await tx0.wait();
      }
      window.showMessage("Aprovando USDT (2/2)...", false);
      const txA = await usdt.approve(spender, amount);
      await txA.wait();
    }

    try {
      if (contracts.cashier.buyChips?.staticCall) {
        await contracts.cashier.buyChips.staticCall(amount);
      }
    } catch (e) {
      const raw = e?.data || e?.info?.error?.data || e?.error?.data;
      const why = decodeRevertData(raw) || (e?.reason || e?.message || "revert");
      return window.showMessage(`Compra bloqueada: ${why}`, true);
    }

    let overrides = {};
    try {
      const est = await contracts.cashier.buyChips.estimateGas?.(amount);
      if (est && typeof est === "bigint") overrides.gasLimit = est + (est / 5n);
    } catch (_) {}

    window.showMessage("Enviando compra de CHIPS...", false);
    const tx = await contracts.cashier.buyChips(amount, overrides);
    await tx.wait();
    window.showMessage("✅ Compra de chips feita! Verifique seus saldos.", false);
    refreshBalances();
  } catch (err) {
    const raw = err?.data || err?.info?.error?.data || err?.error?.data;
    const why = decodeRevertData(raw) || (err?.reason || err?.message || "Tente novamente!");
    console.error("[buyChipsWithUSDT] Erro:", err);
    window.showMessage("Erro na compra de chips: " + why, true);
  }
}

async function redeemChipsForUSDT(humanChips) {
  try {
    if (!window.isWalletConnected) throw new Error("Wallet desconectada");
    if (!await ensureBSCTestnet()) throw new Error("Rede incorreta");

    const signer = await web3Provider.getSigner();
    const chips = new ethers.Contract((contracts.chips.target || contracts.chips.address), ERC20_ABI, signer);
    const dec   = await readChipsDecimalsSafe();
    const amount= ethers.parseUnits(String(humanChips), dec);

    const bal = await chips.balanceOf(window.userWallet);
    if (bal < amount) {
      return window.showMessage(`Saldo de CHIPS insuficiente: ${ethers.formatUnits(bal, dec)} CHIPS.`, true);
    }

    const spender = contracts.cashier.target || contracts.cashier.address;
    let alw = await chips.allowance(window.userWallet, spender);
    if (alw < amount) {
      if (alw > 0n) {
        window.showMessage("Limpando allowance de CHIPS (1/2)...", false);
        const tx0 = await chips.approve(spender, 0);
        await tx0.wait();
      }
      window.showMessage("Aprovando CHIPS para resgate (2/2)...", false);
      const txA = await chips.approve(spender, amount);
      await txA.wait();
    }

    window.showMessage("Enviando resgate de CHIPS por USDT...", false);
    const tx = await contracts.cashier.redeemChips(amount);
    await tx.wait();

    window.showMessage("✅ Resgate concluído! Verifique seus saldos.", false);
    refreshBalances();
  } catch (err) {
    console.error("[redeemChipsForUSDT] Erro:", err);
    window.showMessage("Erro no resgate: " + (err?.message || "Tente novamente!"), true);
  }
}

/***********************
 * REGISTRO DE MESAS CRIADAS
 ***********************/
let knownTables = JSON.parse(localStorage.getItem('poker_known_tables') || '[]');
window.knownTables = knownTables; // expor

function registerNewTable(tableName, tableAddress, creator, maxSeats = 6, isPublic = true) {
  const newTable = {
    id: tableName,
    name: tableName,
    address: tableAddress,
    creator: creator,
    maxPlayers: maxSeats,
    players: 0,
    phase: 'waiting',
    pot: 0,
    type: 'on-chain',
    isPublic: isPublic,
    createdAt: Date.now(),
    lastSeen: Date.now()
  };
  const existingIndex = knownTables.findIndex(t => t.id === tableName);
  if (existingIndex >= 0) knownTables[existingIndex] = newTable;
  else knownTables.push(newTable);
  localStorage.setItem('poker_known_tables', JSON.stringify(knownTables));
  console.log('[registerNewTable] Mesa registrada:', tableName, tableAddress);
  return newTable;
}

let __lastTableScanTs = 0;

async function scanForTableCreationEvents(fromBlock = 'latest', toBlock = 'latest') {
  const now = Date.now();
  if (now - __lastTableScanTs < 3000) {
    return [];
  }
  __lastTableScanTs = now;
  try {
    if (!factoryContract) {
      await loadFactoryContract();
      if (!factoryContract) return [];
    }
    console.log('[scanForTableCreationEvents] Buscando eventos...');
    const filter = factoryContract.filters.TableCreated();
    try {
      const events = await factoryContract.queryFilter(filter, fromBlock, toBlock);
      const discovered = [];
      for (const ev of events) {
        const tableName = ev.args.tableIdText;
        const tableAddress = ev.args.table;
        const table = registerNewTable(tableName, tableAddress, ev.args.creator, 6, true);
        discovered.push(table);
        console.log(`[scanForTableCreationEvents] Mesa encontrada: ${tableName} -> ${tableAddress}`);
      }
      return discovered;
    } catch (err) {
      const code = (err && (err.code ?? err?.data?.code)) ?? null;
      const msg = (err && (err.message || "")) || "";
      if (code === -32005 || /limit exceeded/i.test(msg)) {
        console.warn('[scanForTableCreationEvents] Rate-limited pelo RPC; tentando fallback curto...');
        return [];
      }
      throw err;
    }
  } catch (e) {
    console.error('[scanForTableCreationEvents] Erro:', e);
    return [];
  }
}

/***********************
 * CRIAÇÃO DE MESA
 ***********************/
function showCreateTableModal() {
  const modal = document.getElementById('createTableModal');
  const btn = document.getElementById('createTableBtn');
  if (modal && (!btn || btn.style.display !== 'none')) {
    modal.style.display = 'block';
    checkCreateEligibility();
  }
}

function hideCreateTableModal() {
  const modal = document.getElementById('createTableModal');
  if (modal) modal.style.display = 'none';
}

async function checkCreateEligibility() {
  const statusEl = document.getElementById('createTableStatus');
  if (!statusEl) return;
  try {
    if (!factoryContract) await loadFactoryContract();
    const isEligible = await factoryContract.isEligibleToCreate(window.userWallet);
    const canCreate = await factoryContract.canCreateTable(window.userWallet);
    if (isEligible) {
      statusEl.innerHTML = `<span style="color: green;">✅ Elegível para criar mesa</span><br><small>${canCreate.reason || "Possui ZOD ou bilhete LotteryCore"}</small>`;
    } else {
      statusEl.innerHTML = `<span style="color: red;">❌ Não elegível</span><br><small>${canCreate.reason || "Necessita ZOD token ou bilhete LotteryCore"}</small>`;
    }
  } catch (err) {
    console.error("[checkCreateEligibility] Erro:", err);
    statusEl.innerHTML = `<span style="color: orange;">⚠️ Erro ao verificar elegibilidade</span>`;
  }
}

async function createTable() {
  const statusEl = document.getElementById('createTableStatus');
  const nameInput = document.getElementById('tableName');
  const feeInput = document.getElementById('tableFee');
  const seatsInput = document.getElementById('tableSeats');
  const publicInput = document.getElementById('tablePublic');
  if (!nameInput || !feeInput || !seatsInput || !publicInput) {
    window.showMessage("Erro: elementos do formulário não encontrados", true);
    return;
  }
  const tableName = nameInput.value.trim();
  const feeBps = Math.floor(Number(feeInput.value) * 100);
  const maxSeats = Number(seatsInput.value);
  const makePublic = publicInput.checked;
  if (!tableName.toLowerCase().endsWith('.zod')) return window.showMessage("Nome da mesa deve terminar com '.zod'", true);
  if (tableName.length < 5) return window.showMessage("Nome muito curto (mín. 5 caracteres)", true);
  if (maxSeats < 2 || maxSeats > 10) return window.showMessage("Número de assentos deve ser entre 2 e 10", true);
  if (feeBps > 500) return window.showMessage("Taxa máxima é 5%", true);
  try {
    statusEl.innerHTML = "⏳ Verificando elegibilidade...";
    if (!factoryContract) {
      const loaded = await loadFactoryContract();
      if (!loaded) throw new Error("Não foi possível carregar contrato Factory");
    }
    const existingTable = await factoryContract.getTable(tableName);
    if (existingTable !== ethers.ZeroAddress) throw new Error("Já existe uma mesa com este nome");
    const isEligible = await factoryContract.isEligibleToCreate(window.userWallet);
    if (!isEligible) throw new Error("Você não é elegível para criar mesas (necessita ZOD ou bilhete LotteryCore)");
    statusEl.innerHTML = "⏳ Preparando pagamento de 100 USDT...";
    const createPrice = await factoryContract.createPrice();
    const usdt = new ethers.Contract(PREFERRED_USDT_ADDRESS, ERC20_ABI, await web3Provider.getSigner());
    const factoryAddr = await getFactoryAddress();
    const balance = await usdt.balanceOf(window.userWallet);
    if (balance < createPrice) throw new Error(`Saldo USDT insuficiente. Necessário: ${ethers.formatUnits(createPrice, 6)} USDT`);
    const allowance = await usdt.allowance(window.userWallet, factoryAddr);
    if (allowance < createPrice) {
      statusEl.innerHTML = "⏳ Aprovando USDT...";
      const txApprove = await usdt.approve(factoryAddr, createPrice);
      await txApprove.wait();
    }
    statusEl.innerHTML = "⏳ Criando mesa...";
    const tx = await factoryContract.createTable(tableName, feeBps, makePublic, maxSeats);
    statusEl.innerHTML = `⏳ Aguardando confirmação... <a href="https://testnet.bscscan.com/tx/${tx.hash}" target="_blank">Ver TX</a>`;
    await tx.wait();
    const tableAddr = await factoryContract.getTable(tableName);
    registerNewTable(tableName, tableAddr, window.userWallet, maxSeats, makePublic);
    statusEl.innerHTML = `✅ Mesa criada com sucesso!<br><strong>Nome:</strong> ${tableName}<br><strong>Endereço:</strong> ${formatAddress(tableAddr)}<br><a href="https://testnet.bscscan.com/address/${tableAddr}" target="_blank">Ver contrato</a>`;
    window.showMessage(`Mesa "${tableName}" criada com sucesso!`, false);
    setTimeout(() => { hideCreateTableModal(); refreshLobby(); }, 2000);
  } catch (err) {
    console.error("[createTable] Erro:", err);
    const errorMsg = err.message || "Erro desconhecido";
    statusEl.innerHTML = `❌ Erro: ${errorMsg}`;
    window.showMessage(`Erro ao criar mesa: ${errorMsg}`, true);
  }
}

async function joinCreatedTable(tableName, tableAddress) {
  try {
    contracts.table = new ethers.Contract(tableAddress, TABLE_ABI, await web3Provider.getSigner());
    window.selectedTableAddress = tableAddress;
    window.selectedTableName = tableName;
    localStorage.setItem('poker_last_table', JSON.stringify({ id: tableName, address: tableAddress }));
    syncContractLinks();
    if (typeof socket !== 'undefined' && socket && socket.connected) {
      socket.emit('joinTable', { tableIdText: tableName, name: document.getElementById('playerName')?.value || 'Criador', buyin: 10000 });
    }
  } catch (err) {
    console.error("[joinCreatedTable] Erro:", err);
  }
}

/***********************
 * AUDITORIA
 ***********************/
function decodeRevertData(rawData) {
  if (!rawData || rawData === '0x') return null;
  try {
    const parsed = TABLE_ERR_IFACE.parseError(rawData);
    if (parsed) {
      const names = {
        NotSeated: 'Você não está sentado na mesa. Aguarde o próximo settlement (ou sente via servidor).',
        RoundActive: 'Ação bloqueada enquanto o round on-chain está ativo. Aguarde o settlement.',
        StillSeated: 'Você ainda está sentado; desocupe o assento para sacar.',
        InsufficientBalance: 'Saldo insuficiente na mesa.',
        ZeroAmount: 'Valor precisa ser > 0.'
      };
      return names[parsed.name] || parsed.name;
    }
  } catch (_) {}
  try {
    const parsed = OZ_ERR_IFACE.parseError(rawData);
    if (parsed) return `${parsed.name}(${JSON.stringify(parsed.args)})`;
  } catch (_) {}
  try {
    if (rawData.length >= 138) {
      const reason = ethers.toUtf8String('0x' + rawData.slice(138));
      if (reason) return reason;
    }
  } catch (_) {}
  return null;
}
async function explainWithdrawBlock(tableAddr, amountBN, dec, tableContract) {
  try {
    const [isSeated, isActive] = await Promise.all([
      callViewRaw(tableAddr, 'function seated(address) view returns (bool)', 'seated', [window.userWallet]).catch(() => null),
      callViewRaw(tableAddr, 'function roundActive() view returns (bool)', 'roundActive', []).catch(() => null),
    ]);

    if (isActive === true) return 'Ação bloqueada enquanto o round on-chain está ativo. Aguarde o settlement.';
    if (isSeated === true) return 'Você ainda está sentado; desocupe o assento para sacar.';

    const balBN = await readTableBalanceGeneric(window.userWallet, tableContract);
    if (balBN < amountBN) {
      const avail = ethers.formatUnits(balBN, dec);
      return `Saldo insuficiente na mesa. Disponível: ${avail} CHIPS.`;
    }
  } catch (_) {}

  return 'Não foi possível simular a transação (missing revert data). Tente novamente, ou reabra a wallet.';
}

/***********************
 * LOBBY DE MESAS
 ***********************/
let communityTables = [];
let lobbyRefreshInterval = null;

function showLobby() {
  const modal = document.getElementById('lobbyModal');
  if (modal) {
    modal.style.display = 'block';
    refreshLobby();
    if (lobbyRefreshInterval) clearInterval(lobbyRefreshInterval);
    lobbyRefreshInterval = setInterval(refreshLobby, 10000);
  }
}

function hideLobby() {
  const modal = document.getElementById('lobbyModal');
  if (modal) modal.style.display = 'none';
  if (lobbyRefreshInterval) {
    clearInterval(lobbyRefreshInterval);
    lobbyRefreshInterval = null;
  }
}

async function refreshLobby() {
  const statusEl = document.getElementById('lobbyStatus');
  const tablesEl = document.getElementById('tablesList');
  if (!statusEl || !tablesEl) return;
  try {
    statusEl.innerHTML = '⏳ Buscando mesas...';

    // 👉 Só on-chain:
    const onChainTables = await fetchOnChainTables();
    communityTables = onChainTables;

    if (communityTables.length === 0) {
      statusEl.innerHTML = '😴 Nenhuma mesa pública encontrada. Seja o primeiro a criar uma!';
      tablesEl.innerHTML = '';
    } else {
      statusEl.innerHTML = `🎯 ${communityTables.length} mesa(s) disponível(is)`;
      renderTablesList(communityTables);
    }
  } catch (err) {
    console.error('[refreshLobby] Erro:', err);
    statusEl.innerHTML = '❌ Erro ao carregar mesas';
  }
}


async function fetchServerTables() {
  try {
    const response = await fetch(`${getServerUrl()}/api/tables`);
    const data = await response.json();
    return data.tables.map(table => ({
      id: table.id,
      name: table.id,
      players: table.players,
      maxPlayers: table.maxPlayers,
      phase: table.phase,
      pot: table.pot,
      type: 'off-chain',
      isPublic: true,
      source: 'server'
    }));
  } catch (err) {
    console.warn('[fetchServerTables] Erro:', err);
    return [];
  }
}

async function fetchOnChainTables() {
  try {
    const onChainTables = [];
    const localTables = knownTables.filter(t => t.type === 'on-chain' && t.isPublic);
    for (const table of localTables) {
      try {
        if (web3Provider && table.address) {
          const code = await web3Provider.getCode(table.address);
          if (code !== '0x') {
            table.lastSeen = Date.now();
            onChainTables.push(table);
          }
        } else {
          onChainTables.push(table);
        }
      } catch (err) {
        console.warn(`[fetchOnChainTables] Erro na mesa ${table.name}:`, err);
        onChainTables.push(table);
      }
    }
    if (Math.random() < 0.3) {
      const newTables = await scanForTableCreationEvents('latest', 'latest');
      onChainTables.push(...newTables);
    }
    onChainTables.sort((a, b) => b.createdAt - a.createdAt);
    console.log('[fetchOnChainTables] Mesas encontradas:', onChainTables.length);
    return onChainTables;
  } catch (err) {
    console.error('[fetchOnChainTables] Erro geral:', err);
    return knownTables.filter(t => t.type === 'on-chain');
  }
}

function renderTablesList(tables) {
  const tablesEl = document.getElementById('tablesList');
  if (!tablesEl) return;
  tablesEl.innerHTML = '';

  // 👉 Renderize só on-chain
  tables.filter(t => t.type === 'on-chain').forEach(t => {
    const card = createTableCard(t);
    tablesEl.appendChild(card);
    decorateLobbyCard(card, t.id); // já é on-chain
  });
}



function createTableCard(table) {
  const card = document.createElement('div');
  card.className = 'table-card';
  card.innerHTML = `
    <div class="table-header">
      <h3>${escapeHtml(table.name)}</h3>
      <span class="table-badge ${table.type}">
        ${table.type === 'on-chain' ? '⛓️ On-Chain' : '🎮 Off-Chain'}
      </span>
    </div>
    <div class="players-info">
      <span class="players-info">👥 ${table.players}/${table.maxPlayers}</span>
      <div class="players-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(table.players / table.maxPlayers) * 100}%"></div>
        </div>
      </div>
    </div>
    <div class="table-stats">
      <div class="stat">
        <span class="stat-label">Pote:</span>
        <span class="stat-value">$${Number(table.pot).toLocaleString()}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Status:</span>
        <span class="stat-value ${table.phase}">${getPhaseDisplayName(table.phase)}</span>
      </div>
    </div>
    <div class="table-actions">
      <button onclick="joinTableFromLobby('${table.id}', '${table.type}')"
              class="join-btn ${table.players >= table.maxPlayers ? 'full' : ''}"
              ${table.players >= table.maxPlayers ? 'disabled' : ''}>
        ${table.players >= table.maxPlayers ? '🎯 Mesa Cheia' : '🎮 Entrar na Mesa'}
      </button>
      ${table.type === 'on-chain' && table.address ?
        `<button onclick="viewOnChainTable('${table.address}')"
                 class="btn-secondary btn-sm">🔍 Ver Contrato</button>` : ''}
    </div>`;
  return card;
}
async function decorateLobbyCard(cardEl, tableIdText) {
  try {
    const meta = await readTableMetaById(tableIdText);
    if (!meta) return;

    // badge/linha de taxa
    let feeEl = cardEl.querySelector(".table-fee");
    if (!feeEl) {
      feeEl = document.createElement("div");
      feeEl.className = "table-fee";
      feeEl.style.cssText = "margin-top:6px;font-size:12px;opacity:.9";
      (cardEl.querySelector(".table-header") || cardEl).appendChild(feeEl);
    }
    feeEl.textContent = `Taxa: ${meta.feePct}%`;

    // opcional: confirmar ocupação on-chain
    const playersInfo = cardEl.querySelector(".players-info span");
    if (playersInfo && meta.seated != null) {
      playersInfo.textContent = `👥 ${meta.seated}/${meta.max}`;
    }
  } catch (e) { console.warn("[decorateLobbyCard]", e); }
}

async function joinTableFromLobby(tableIdText, tableType) {
  try {
    const name  = document.getElementById('playerName')?.value?.trim?.() || 'Jogador';
    const buyin = safeNumber(document.getElementById('buyin')?.value, 10000);

    if (!window.isWalletConnected && tableType === 'on-chain') {
      const connect = confirm('Esta mesa é on-chain. Conecte sua wallet para continuar.');
      if (connect) await window.connectWallet(); else return;
    }

    if (tableType === 'on-chain') {
      if (!hasContractsReady()) await window.loadContracts();
      try {
        const tableContract = await getTableContractById(tableIdText);
        window.contracts.table = tableContract;

        window.selectedTableAddress = tableContract.target;
        window.lastTableIdText = tableIdText;
        window.selectedTableName = tableIdText;
        localStorage.setItem('poker_last_table', JSON.stringify({
          id: tableIdText,
          address: window.selectedTableAddress
        }));

        try { syncContractLinks(); } catch {}

        const balBN   = await readTableBalanceGeneric(window.userWallet, tableContract);
        const chipsDec= await readChipsDecimalsSafe();
        if (parseFloat(ethers.formatUnits(balBN, chipsDec)) <= 0) {
          window.showMessage("Você entrou com stack 0. Deposite fichas no modal Blockchain para jogar.", true);
        }
      } catch (e) {
        console.warn('[joinTableFromLobby] não consegui resolver a mesa via Factory:', e?.message || e);
      }
    }

    hideLobby();
    window.showMessage(`Entrando na mesa ${tableIdText}...`, false);
    if (typeof socket !== 'undefined' && socket && socket.connected) {
      socket.emit('joinTable', { tableIdText, name, buyin });
    } else if (typeof io !== 'undefined') {
      socket = io(getServerUrl(), { transports: ['websocket', 'polling'] });
      if (typeof attachCommonHandlers === 'function') attachCommonHandlers();
      socket.once('connect', () => socket.emit('joinTable', { tableIdText, name, buyin }));
    }
  } catch (err) {
    console.error('[joinTableFromLobby] Erro:', err);
    window.showMessage(`Erro ao entrar na mesa: ${err.message}`, true);
  }
}

function viewOnChainTable(address) {
  window.open(`https://testnet.bscscan.com/address/${address}`, '_blank');
}

function createTableFromLobby() {
  hideLobby();
  showCreateTableModal();
}

function filterTables() {
  const searchInput = document.getElementById('lobbySearch');
  if (!searchInput) return;
  const q = searchInput.value.toLowerCase();
  const filtered = communityTables.filter(t => t.name.toLowerCase().includes(q) || t.phase.toLowerCase().includes(q));
  renderTablesList(filtered);
}

/***********************
 * FERRAMENTA DE IMPORTAÇÃO MANUAL
 ***********************/
function showImportTableModal() {
  const m = document.getElementById('importTableModal');
  if (m) m.style.display = 'block';
}

function hideImportTableModal() {
  const m = document.getElementById('importTableModal');
  if (m) m.style.display = 'none';
}

async function importTableManually() {
  const nameInput = document.getElementById('importTableName');
  const addressInput = document.getElementById('importTableAddress');
  const seatsInput = document.getElementById('importTableSeats');
  const statusEl = document.getElementById('importTableStatus');
  if (!nameInput || !addressInput || !seatsInput || !statusEl) {
    return window.showMessage("Erro: elementos do formulário não encontrados", true);
  }
  const tableName = nameInput.value.trim();
  const tableAddress = addressInput.value.trim();
  const maxSeats = Number(seatsInput.value);
  if (!tableName) return statusEl.innerHTML = '❌ Nome da mesa é obrigatório';
  if (!tableName.toLowerCase().endsWith('.zod')) return statusEl.innerHTML = '❌ Nome da mesa deve terminar com ".zod"';
  if (knownTables.some(t => t.id === tableName)) return statusEl.innerHTML = '❌ Já existe uma mesa com este nome';
  if (knownTables.some(t => (t.address || '').toLowerCase() === tableAddress.toLowerCase())) {
    return statusEl.innerHTML = '❌ Este endereço já está associado a outra mesa';
  }
  if (!ethers.isAddress(tableAddress)) return statusEl.innerHTML = '❌ Endereço do contrato inválido';
  if (maxSeats < 2 || maxSeats > 10) return statusEl.innerHTML = '❌ Número de assentos deve ser 2-10';
  try {
    statusEl.innerHTML = '⏳ Verificando contrato...';
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo de verificação excedido')), 5000));
    const code = await Promise.race([web3Provider.getCode(tableAddress), timeoutPromise]);
    if (code === '0x') return statusEl.innerHTML = '❌ Contrato não encontrado neste endereço';
    registerNewTable(tableName, tableAddress, 'unknown', maxSeats, true);
    statusEl.innerHTML = '✅ Mesa importada com sucesso!';
    setTimeout(() => { hideImportTableModal(); refreshLobby(); }, 1500);
  } catch (err) {
    console.error('[importTableManually] Erro:', err);
    statusEl.innerHTML = `❌ Erro: ${err.message || 'Falha ao importar mesa'}`;
  }
}

/***********************
 * GERENCIADOR DE MESAS CONHECIDAS
 ***********************/
function showTablesManager() {
  const m = document.getElementById('tablesManagerModal');
  if (m) {
    m.style.display = 'block';
    renderKnownTablesList();
  }
}

function hideTablesManager() {
  const m = document.getElementById('tablesManagerModal');
  if (m) m.style.display = 'none';
}

function renderKnownTablesList() {
  const listEl = document.getElementById('knownTablesList');
  const countEl = document.getElementById('knownTablesCount');
  if (!listEl || !countEl) return;
  listEl.innerHTML = '';
  countEl.textContent = knownTables.length;
  knownTables.sort((a, b) => b.createdAt - a.createdAt);
  knownTables.forEach(t => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td style="font-family: monospace; font-size: 12px;">${formatAddress(t.address)}</td>
      <td style="font-family: monospace; font-size: 12px;">${formatAddress(t.creator)}</td>
      <td>
        <button onclick="joinTableFromLobby('${t.id}', 'on-chain')" class="btn-sm">🎮 Entrar</button>
        <button onclick="removeTable('${t.id}')" class="btn-sm" style="background:#e53e3e;">🗑️ Remover</button>
      </td>`;
    listEl.appendChild(row);
  });
}

function removeTable(tableIdText) {
  if (!confirm(`Tem certeza que deseja remover a mesa "${tableIdText}"?`)) return;
  knownTables = knownTables.filter(t => t.id !== tableIdText);
  window.knownTables = knownTables; // manter em sincronia
  localStorage.setItem('poker_known_tables', JSON.stringify(knownTables));
  renderKnownTablesList();
  refreshLobby();
}

async function scanAllTableEvents() {
  const statusEl = document.querySelector('.manager-stats');
  if (!statusEl) return;
  try {
    statusEl.innerHTML += '<br>⏳ Buscando eventos passados...';
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo de busca excedido')), 10000));
    const currentBlock = await web3Provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 1000);
    const newTables = await Promise.race([scanForTableCreationEvents(fromBlock, currentBlock), timeoutPromise]);
    statusEl.innerHTML += `<br>✅ Encontradas ${newTables.length} novas mesas`;
    renderKnownTablesList();
  } catch (err) {
    console.error('[scanAllTableEvents] Erro:', err);
    statusEl.innerHTML += `<br>❌ Erro: ${err.message || 'Falha ao buscar eventos'}`;
  }
}

/***********************
 * HELPERS DO LOBBY
 ***********************/
function getPhaseDisplayName(phase) {
  const phases = {
    waiting: '🕒 Aguardando',
    preflop: '🎴 Pré-Flop',
    flop: '🃏 Flop',
    turn: '📈 Turn',
    river: '🌊 River',
    showdown: '🏆 Showdown'
  };
  return phases[phase] || phase;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function safeNumber(value, def = 0) {
  const n = Number(value);
  return isNaN(n) ? def : n;
}

function hasContractsReady() {
  return contracts.chips && contracts.cashier; // mesa só quando o usuário escolher
}

async function getPlayerTableBalance(address, tableInstance = contracts.table) {
  try {
    if (!tableInstance || !address) return '0';
    const bal = await readTableBalanceGeneric(address, tableInstance);
    const dec = await readChipsDecimalsSafe();
    return ethers.formatUnits(bal, dec);
  } catch (err) {
    console.error('[getPlayerTableBalance] Erro:', err);
    return '0';
  }
}

/***********************
 * MODAL "BLOCKCHAIN" — compat com os IDs/funções do seu HTML
 ***********************/
function deriveCurrentTableAddress() {
  return window.selectedTableAddress ||
         window.contracts?.table?.target ||
         window.contracts?.table?.address ||
         null;
}

// --- 4) Links do modal sempre mostram Factory/Chips e PokerTable atual se soubermos o endereço ---
async function syncContractLinks() {
  const status = await fetchStatus().catch(() => null);
  const chips = status?.contracts?.casinoChips || FALLBACK_CONTRACTS.casinoChips;
  const fact  = status?.contracts?.factory     || null;

  const chipsA = document.getElementById('chipsLink');
  const factA  = document.getElementById('factoryLink');
  const tblA   = document.getElementById('tableLink');

  if (chipsA && ethers.isAddress(chips)) {
    chipsA.href = `${CHAIN_CONFIG.blockExplorerUrls[0]}/address/${chips}`;
  }
  if (factA && ethers.isAddress(fact)) {
    factA.href = `${CHAIN_CONFIG.blockExplorerUrls[0]}/address/${fact}`;
  }

  const addr = window.selectedTableAddress ||
               window.contracts?.table?.target ||
               window.contracts?.table?.address || null;

  if (tblA) {
    if (addr && ethers.isAddress(addr)) {
      tblA.textContent = formatAddress(addr);
      tblA.href = `${CHAIN_CONFIG.blockExplorerUrls[0]}/address/${addr}`;
    } else {
      tblA.textContent = "—";
      tblA.removeAttribute('href');
    }
  }
}

// --- 5) showBlockchainModal resiliente (não exige wallet; instancia signer só se houver) ---
async function showBlockchainModal() {
  const modal = document.getElementById('blockchainModal');
  if (!modal) return;

  // tenta garantir contexto atual (última mesa / mesa conhecida / já instanciada)
  try { await ensureSelectedTableFromContext(); } catch {}

  // Se temos endereço mas ainda não há contrato, instancia em read-only (ou signer se houver)
  try {
    const addr =
      window.selectedTableAddress ||
      window.contracts?.table?.target ||
      window.contracts?.table?.address || null;

    if (addr && (!window.contracts?.table ||
        ((window.contracts.table.target || window.contracts.table.address) !== addr))) {
      const runner = window.web3Provider ? await window.web3Provider.getSigner() : getReadProvider();
      window.contracts.table = new ethers.Contract(addr, TABLE_ABI, runner);
      window.selectedTableAddress = addr;
    }
  } catch (e) {
    console.warn("[showBlockchainModal] instanciação (tolerante):", e?.message || e);
  }

  // Atualiza links e tenta saldos (se houver wallet conectada)
  await syncContractLinks();
  try { await refreshBalances(); } catch {}

  // Atualiza botão "Sentar on-chain" se existir na sua UI
  try { await updateSeatButtonUI?.(); } catch {}

  modal.style.display = 'flex';
}



function hideBlockchainModal() {
  const modal = document.getElementById('blockchainModal');
  if (modal) modal.style.display = 'none';
}

// Handlers (usam os IDs do seu HTML)
async function handleDeposit() {
  const el = document.getElementById('depositAmount');
  let val = (el?.value || "").trim();
  if (!val) return window.showMessage('Digite uma quantidade.', true);
  val = val.replace(',', '.');
  const n = parseFloat(val);
  if (!n || n <= 0) return window.showMessage('Valor inválido.', true);

  const addr = deriveCurrentTableAddress();
  if (!addr) return window.showMessage('Nenhuma mesa ativa. Entre na mesa primeiro.', true);

  const ok = await window.notify.confirm({
    title: 'Confirmar depósito',
    message: `Depositar ${n} CHIPS na mesa atual (${formatAddress(addr)})?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  try {
    await depositChips(n, addr);
    el.value = '';
    await refreshBalances();
  } finally { stop(); }
}

async function handleWithdraw() {
  const el = document.getElementById('withdrawAmount');
  let val = (el?.value || "").trim();
  if (!val) return window.showMessage('Digite uma quantidade.', true);
  val = val.replace(',', '.');
  const n = parseFloat(val);
  if (!n || n <= 0) return window.showMessage('Valor inválido.', true);

  const addr = deriveCurrentTableAddress();
  if (!addr) return window.showMessage('Nenhuma mesa ativa. Entre na mesa primeiro.', true);

  const ok = await window.notify.confirm({
    title: 'Confirmar saque',
    message: `Sacar ${n} CHIPS da mesa atual (${formatAddress(addr)})?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  try {
    await withdrawChips(n, addr);
    el.value = '';
    await refreshBalances();
  } finally { stop(); }
}

async function handleWithdrawAll() {
  const addr = deriveCurrentTableAddress();
  if (!addr) return window.showMessage('Nenhuma mesa ativa. Entre na mesa primeiro.', true);

  const ok = await window.notify.confirm({
    title: 'Confirmar saque total',
    message: `Sacar TODO o saldo de CHIPS da mesa atual (${formatAddress(addr)})?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  try {
    await withdrawAllChips(addr);
    await refreshBalances();
  } finally { stop(); }
}

async function handleBuyChips() {
  const el = document.getElementById('buyUsdtAmount');
  let val = (el?.value || "").trim();
  if (!val) return window.showMessage('Digite a quantidade de USDT.', true);
  val = val.replace(',', '.');
  const n = parseFloat(val);
  if (!n || n <= 0) return window.showMessage('Valor inválido.', true);

  const ok = await window.notify.confirm({
    title: 'Confirmar compra',
    message: `Comprar CHIPS por ${n} USDT?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  try {
    await buyChipsWithUSDT(n);
    el.value = '';
    await refreshBalances();
  } finally { stop(); }
}

async function handleRedeemChips() {
  const el = document.getElementById('redeemChipAmount');
  let val = (el?.value || "").trim();
  if (!val) return window.showMessage('Digite a quantidade de CHIPS.', true);
  val = val.replace(',', '.');
  const n = parseFloat(val);
  if (!n || n <= 0) return window.showMessage('Valor inválido.', true);

  const ok = await window.notify.confirm({
    title: 'Confirmar resgate',
    message: `Resgatar ${n} CHIPS por USDT?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  try {
    await redeemChipsForUSDT(n);
    el.value = '';
    await refreshBalances();
  } finally { stop(); }
}

/***********************
 * GERENCIAMENTO DE FICHAS (UI) — compat antigo, agora community-only
 ***********************/
window.selectedTableAddress = window.selectedTableAddress || null;
window.selectedTableName = window.selectedTableName || '';

async function showChipsManager() {
  const modal = document.getElementById('chipsManagerModal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');

  await ensureSelectedTableFromContext();
  await loadTableSelector();

  const selector = document.getElementById('tableSelector');
  const addr = window.selectedTableAddress || window.contracts?.table?.target || window.contracts?.table?.address;
  if (selector && addr) {
    const exists = [...selector.options].some(o => (o.value || '').toLowerCase() === addr.toLowerCase());
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = addr;
      opt.dataset.name = window.selectedTableName || 'Mesa Atual';
      opt.textContent = window.selectedTableName ? `${window.selectedTableName} (atual)` : `Mesa atual (${formatAddress(addr)})`;
      selector.appendChild(opt);
    }
    selector.value = addr;
    updateTableSelection();
  }

  refreshAllBalances();
}

function sellChipsForUSDT_UI() {
  try {
    const el = document.getElementById('sellChipsAmount-cm');
    let val = (el?.value || "").trim();
    if (!val) return window.showMessage("Digite a quantidade de CHIPS.", true);

    val = val.replace(/,/g, '.');
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) {
      return window.showMessage("Valor inválido. Use números (ex: 10.5 ou 10,5).", true);
    }

    window.notify.confirm({
      title: 'Confirmar resgate',
      message: `Resgatar ${n} CHIPS por USDT?`
    }).then(ok => {
      if (!ok) return;
      const stop = window.notify.loading('Aguardando assinatura na wallet...');
      redeemChipsForUSDT(n)
        .catch(() => {})
        .finally(() => stop());
    });
  } catch (e) {
    console.error("[sellChipsForUSDT_UI] Erro:", e);
    window.showMessage("Erro ao iniciar resgate de CHIPS.", true);
  }
}

function hideChipsManager() {
  const modal = document.getElementById('chipsManagerModal');
  if (!modal) return;
  if (modal.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

async function loadTableSelector() {
  const selector = document.getElementById('tableSelector');
  if (!selector) return;
  selector.innerHTML = '<option value="">-- Escolha uma mesa --</option>';
  try {
    knownTables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.address;
      opt.textContent = `${t.name} (${t.maxPlayers} assentos)`;
      opt.dataset.name = t.name;
      selector.appendChild(opt);
    });
    // COMMUNITY-ONLY: não adiciona "mesa principal" aqui
    if (window.selectedTableAddress) {
      const exists = [...selector.options].some(o => (o.value || '').toLowerCase() === window.selectedTableAddress.toLowerCase());
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = window.selectedTableAddress;
        opt.dataset.name = window.selectedTableName || 'Mesa Atual';
        opt.textContent = window.selectedTableName
          ? `${window.selectedTableName} (atual)`
          : `Mesa atual (${formatAddress(window.selectedTableAddress)})`;
        selector.appendChild(opt);
      }
    }
  } catch (err) {
    console.error('[loadTableSelector] Erro:', err);
  }
}

function updateTableSelection() {
  const selector = document.getElementById('tableSelector');
  const actions = document.getElementById('chipsActions');
  const tableNameEl = document.getElementById('currentTableName');
  if (!selector || !actions || !tableNameEl) return;
  window.selectedTableAddress = selector.value || null;
  window.selectedTableName = selector.options[selector.selectedIndex]?.dataset?.name || '';
  if (window.selectedTableAddress) {
    actions.style.display = 'grid';
    tableNameEl.textContent = window.selectedTableName || 'Mesa Atual';
    refreshTableBalance(window.selectedTableAddress);
    syncContractLinks(); // reflete no modal Blockchain, se aberto
  } else {
    actions.style.display = 'none';
    tableNameEl.textContent = 'Nenhuma mesa selecionada';
  }
}

async function refreshWalletBalance() {
  try {
    const el = document.getElementById('walletBalanceChips');
    if (!el || !contracts.chips) return;
    const [bal, dec] = await Promise.all([
      contracts.chips.balanceOf(window.userWallet),
      readChipsDecimalsSafe()
    ]);
    el.textContent = `${ethers.formatUnits(bal, dec)} CHIPS`;
  } catch (err) {
    console.error('[refreshWalletBalance] Erro:', err);
  }
}

async function refreshTableBalance(tableAddress) {
  try {
    const balanceEl = document.getElementById('tableBalanceChips');
    if (!balanceEl || !tableAddress) return;
    const t = new ethers.Contract(tableAddress, TABLE_ABI, await web3Provider.getSigner());
    const [bal, dec] = await Promise.all([
      readTableBalanceGeneric(window.userWallet, t),
      readChipsDecimalsSafe()
    ]);
    balanceEl.textContent = `${ethers.formatUnits(bal, dec)} CHIPS`;
  } catch (err) {
    console.error('[refreshTableBalance] Erro:', err);
    const el = document.getElementById('tableBalanceChips');
    if (el) el.textContent = 'Erro ao carregar';
  }
}

async function refreshAllBalances() {
  try {
    await refreshWalletBalance();
    if (window.selectedTableAddress) await refreshTableBalance(window.selectedTableAddress);
  } catch (err) {
    console.error('[refreshAllBalances] Erro:', err);
  }
}

async function depositToSelectedTable() {
  const amountInput = document.getElementById('depositAmount-cm');
  const statusEl = document.getElementById('chipsStatus');
  if (!amountInput || !statusEl || !window.selectedTableAddress) {
    return window.showMessage('Selecione uma mesa primeiro', true);
  }
  let val = (amountInput.value || "").trim();
  if (!val) return window.showMessage('Digite uma quantidade.', true);
  val = val.replace(/,/g, '.');
  const amount = parseFloat(val);
  if (isNaN(amount) || amount <= 0) return window.showMessage('Valor inválido. Use números (ex: 100.5).', true);

  const ok = await window.notify.confirm({
    title: 'Confirmar depósito',
    message: `Depositar ${amount} CHIPS na mesa ${window.selectedTableName || 'atual'}?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  try {
    statusEl.innerHTML = '⏳ Preparando depósito...';
    await depositChips(amount, window.selectedTableAddress);
    stop();
    statusEl.innerHTML = `✅ ${amount} CHIPS depositados na mesa ${window.selectedTableName || 'atual'}!`;
    refreshAllBalances();
    amountInput.value = '';
    try { await refreshBalances(); } catch {}
  } catch (err) {
    stop();
    console.error('[depositToSelectedTable] Erro:', err);
    statusEl.innerHTML = `❌ Erro no depósito: ${err.message}`;
    window.showMessage(`Erro no depósito: ${err.message}`, true);
  }
}

async function withdrawFromSelectedTable() {
  const amountInput = document.getElementById('withdrawAmount-cm');
  const statusEl = document.getElementById('chipsStatus');
  if (!amountInput || !statusEl || !window.selectedTableAddress) {
    return window.showMessage('Selecione uma mesa primeiro', true);
  }
  const amount = Number(String(amountInput.value).replace(',', '.'));
  if (!amount || amount <= 0) return window.showMessage('Digite uma quantidade válida', true);

  try {
    const signer = await web3Provider.getSigner();
    const t = new ethers.Contract(window.selectedTableAddress, TABLE_ABI, signer);
    const [balBN, dec] = await Promise.all([
      readTableBalanceGeneric(window.userWallet, t),
      readChipsDecimalsSafe()
    ]);
    const avail = parseFloat(ethers.formatUnits(balBN, dec));
    if (amount > avail) {
      return window.showMessage(`Saldo insuficiente na mesa. Disponível: ${avail} CHIPS.`, true);
    }
  } catch (_) {}

  const ok = await window.notify.confirm({
    title: 'Confirmar saque',
    message: `Sacar ${amount} CHIPS da mesa ${window.selectedTableName || 'atual'}?`
  });
  if (!ok) return;

  const stop = window.notify.loading('Aguardando assinatura na wallet...');
  statusEl.innerHTML = '⏳ Preparando saque...';

  try {
    const done = await withdrawChips(amount, window.selectedTableAddress);
    if (done) {
      statusEl.innerHTML = `✅ ${amount} CHIPS sacados da mesa ${window.selectedTableName || 'atual'}!`;
      amountInput.value = '';
      await refreshAllBalances();
      try { await refreshBalances(); } catch {}
    } else {
      statusEl.innerHTML = `⚠️ Saque cancelado ou bloqueado.`;
    }
  } catch (err) {
    statusEl.innerHTML = `❌ Erro no saque: ${err?.message || err}`;
  } finally {
    stop();
  }
}

async function withdrawAllFromTable() {
  const addr = window.selectedTableAddress || (window.contracts?.table?.target);
  if (!addr || addr === ethers.ZeroAddress) {
    return window.showMessage?.('Selecione uma mesa válida no modal Blockchain para jogar.', true);
  }
  try {
    await withdrawAllChips(addr);
  } catch (e) {
    console.error('[withdrawAllFromTable] erro', e);
    window.showMessage?.('Erro no saque: ' + (e?.reason || e?.message || e), true);
  }
}

/***********************
 * PREVIEWS (placeholder)
 ***********************/
async function updatePreviews() {}

/***********************
 * TABS & LISTENERS
 ***********************/
function openTab(evt, tabId) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(tabId);
  if (el) el.classList.add('active');
  if (evt?.currentTarget) evt.currentTarget.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  // Se existir o modal Blockchain no DOM, sincroniza links e saldos ao abrir
  const openBtn = document.querySelector('[data-open="blockchainModal"]');
  if (openBtn) {
    openBtn.addEventListener('click', showBlockchainModal);
  }
  // Inicializa estado do botão de sentar se ele estiver na tela
  updateSeatButtonUI().catch(()=>{});
});

// --- 1) Provider de leitura seguro (usa RPC público se não houver wallet) ---
function getReadProvider() {
  return window.web3Provider ?? new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcUrls[0]);
}

/***********************
 * EXPORTS GLOBAIS
 ***********************/
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.depositChips = depositChips;
window.withdrawChips = withdrawChips;
window.withdrawAllChips = withdrawAllChips;
window.buyChipsWithUSDT = buyChipsWithUSDT;
window.redeemChipsForUSDT = redeemChipsForUSDT;
window.refreshBalances = refreshBalances;
window.updateWalletUI = updateWalletUI;
window.loadContracts = loadContracts;

window.showCreateTableModal = showCreateTableModal;
window.hideCreateTableModal = hideCreateTableModal;
window.checkCreateEligibility = checkCreateEligibility;
window.createTable = createTable;
window.joinCreatedTable = joinCreatedTable;

window.showLobby = showLobby;
window.hideLobby = hideLobby;
window.refreshLobby = refreshLobby;
window.createTableFromLobby = createTableFromLobby;
window.filterTables = filterTables;
window.joinTableFromLobby = joinTableFromLobby;
window.viewOnChainTable = viewOnChainTable;

window.showImportTableModal = showImportTableModal;
window.hideImportTableModal = hideImportTableModal;
window.importTableManually = importTableManually;

window.showTablesManager = showTablesManager;
window.hideTablesManager = hideTablesManager;
window.renderKnownTablesList = renderKnownTablesList;
window.removeTable = removeTable;
window.scanAllTableEvents = scanAllTableEvents;

// Compat + novo modal Blockchain
window.showBlockchainModal = showBlockchainModal;
window.hideBlockchainModal = hideBlockchainModal;
window.handleDeposit = handleDeposit;
window.handleWithdraw = handleWithdraw;
window.handleWithdrawAll = handleWithdrawAll;
window.handleBuyChips = handleBuyChips;
window.handleRedeemChips = handleRedeemChips;

// Chips Manager (alternativo)
window.showChipsManager = showChipsManager;
window.hideChipsManager = hideChipsManager;
window.updateTableSelection = updateTableSelection;
window.depositToSelectedTable = depositToSelectedTable;
window.withdrawFromSelectedTable = withdrawFromSelectedTable;
window.withdrawAllFromTable = withdrawAllFromTable;
window.refreshAllBalances = refreshAllBalances;

// aliases/compat
window.buyChipsForUSDT_UI = handleBuyChips;
window.buyChipsWithUSDT_UI = handleBuyChips;
window.sellChipsForUSDT_UI = handleRedeemChips;

window.setActiveTableById = window.setActiveTableById;
window.setActiveTableByAddress = window.setActiveTableByAddress;
window.setCurrentTableContext = window.setCurrentTableContext;
window.updateSeatButtonUI = updateSeatButtonUI;
window.seatOnChainNow = seatOnChainNow;
window.readTableMetaById = readTableMetaById;
console.log("[poker_web3.js] (community-only) carregado. window.isWalletConnected:", window.isWalletConnected);