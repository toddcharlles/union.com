// ZOD Poker access control and configuration
// Poker only appears for authorized addresses until the admin releases it to everyone.
// The admin also controls whether poker runs off-chain or on-chain.

const STORAGE_PREFIX = 'poker_';

// Addresses with permanent access (admins/testers) — lowercase
const WHITELIST = [
  '0xeb1c187a7f6cd92e86032abe2808419d78ceca38',
  '0xf0257b4cdd252a7dca256851c629ba010f016024',
  '0x2c05f832fe644e77d4a36c92cc153bf5a26c949e',
];

// --- localStorage helpers ---
function getItem(key, fallback) {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key);
    return v !== null ? v : fallback;
  } catch { return fallback; }
}

function setItem(key, value) {
  try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch {}
}

// --- Public access ---
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

// --- Blockchain mode (off-chain / on-chain) ---
export function getPokerMode() {
  return getItem('mode', 'offchain'); // 'offchain' | 'onchain'
}

export function setPokerMode(mode) {
  setItem('mode', mode === 'onchain' ? 'onchain' : 'offchain');
}

export function isOnChainMode() {
  return getItem('mode', 'offchain') === 'onchain';
}

// --- Poker server URL (base URL, without socket.io path) ---
const DEFAULT_SERVER = import.meta.env.VITE_POKER_SERVER || 'https://unionzod.com';

export function getPokerServerUrl() {
  return getItem('server_url', '') || DEFAULT_SERVER;
}

export function setPokerServerUrl(url) {
  setItem('server_url', url || '');
}

// --- On-chain contract addresses ---
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

// --- Return all configs at once (for admin panel) ---
export function getPokerConfig() {
  return {
    publicAccess: isPokerPublic(),
    mode: getPokerMode(),
    serverUrl: getPokerServerUrl(),
    contracts: getPokerContracts(),
  };
}
