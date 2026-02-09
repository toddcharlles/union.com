// Controle de acesso ao ZOD Poker
// O poker so aparece para enderecos autorizados ate que o admin libere para todos.

const STORAGE_KEY = 'poker_public_access';

// Enderecos com acesso permanente (admins/testers) — lowercase
const WHITELIST = [
  // Adicione seu endereco aqui (lowercase, sem checksum)
  // '0x1234...abcd',
];

// Verifica se o acesso publico foi ativado pelo admin
export function isPokerPublic() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

// Admin ativa/desativa acesso publico
export function setPokerPublic(enabled) {
  localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

// Verifica se um endereco pode acessar o poker
export function canAccessPoker(address) {
  if (!address) return false;
  if (isPokerPublic()) return true;
  return WHITELIST.includes(address.toLowerCase());
}

// Verifica se um endereco esta na whitelist (admin)
export function isPokerAdmin(address) {
  if (!address) return false;
  return WHITELIST.includes(address.toLowerCase());
}
