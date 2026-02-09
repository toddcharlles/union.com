// Controle de acesso e configuracao do ZOD Poker
// O poker so aparece para enderecos autorizados ate que o admin libere para todos.
// O admin tambem controla se o poker roda off-chain ou on-chain.

const STORAGE_PREFIX = 'poker_';

// Enderecos com acesso permanente (admins/testers) — lowercase
const WHITELIST = [
  // Adicione seu endereco aqui (lowercase, sem checksum)
  // '0x1234...abcd',
];

// --- Helpers de localStorage ---
function getItem(key, fallback) {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key);
    return v !== null ? v : fallback;
  } catch { return fallback; }
}

function setItem(key, value) {
  try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch {}
}

// --- Acesso publico ---
export function isPokerPublic() {
  return getItem('public_access', 'false') === 'true';
}

export function setPokerPublic(enabled) {
  setItem('public_access', enabled ? 'true' : 'false');
}

export function canAccessPoker(address) {
  if (!address) return false;
  if (isPokerPublic()) return true;
  return WHITELIST.includes(address.toLowerCase());
}

export function isPokerAdmin(address) {
  if (!address) return false;
  return WHITELIST.includes(address.toLowerCase());
}

// --- Modo blockchain (off-chain / on-chain) ---
export function getPokerMode() {
  return getItem('mode', 'offchain'); // 'offchain' | 'onchain'
}

export function setPokerMode(mode) {
  setItem('mode', mode === 'onchain' ? 'onchain' : 'offchain');
}

export function isOnChainMode() {
  return getItem('mode', 'offchain') === 'onchain';
}

// --- URL do servidor de poker ---
const DEFAULT_SERVER = import.meta.env.VITE_POKER_SERVER || 'https://unionzod.com/poker-socket';

export function getPokerServerUrl() {
  return getItem('server_url', '') || DEFAULT_SERVER;
}

export function setPokerServerUrl(url) {
  setItem('server_url', url || '');
}

// --- Enderecos de contratos on-chain ---
export function getPokerContracts() {
  return {
    chipsAddress: getItem('chips_address', ''),
    factoryAddress: getItem('factory_address', ''),
  };
}

export function setPokerContracts({ chipsAddress, factoryAddress }) {
  if (chipsAddress !== undefined) setItem('chips_address', chipsAddress || '');
  if (factoryAddress !== undefined) setItem('factory_address', factoryAddress || '');
}

// --- Retorna todas as configs de uma vez (para o painel admin) ---
export function getPokerConfig() {
  return {
    publicAccess: isPokerPublic(),
    mode: getPokerMode(),
    serverUrl: getPokerServerUrl(),
    contracts: getPokerContracts(),
  };
}
