// state.js — Estado compartilhado entre todos os modulos

// Mapeamentos principais
export const tables = new Map();          // tableIdText -> table object
export const tableContracts = new Map();  // tableIdText -> ethers.Contract
export const playerWallets = new Map();   // playerId -> wallet (lowercase)
export const socketWallets = new Map();   // socket.id -> wallet (lowercase)
export const tournaments = new Map();
export const rankings = new Map();
export const actionTimeouts = new Map();

// Blockchain state (mutavel — setado por blockchain.js)
export const blockchain = {
  provider: null,
  operatorWallet: null,
  chipsContract: null,
  factoryContract: null,
  enabled: false
};

// Mutex por mesa
export const tableLocks = new Map();

// Fila de assentos pendentes
export const pendingSeats = new Map();

// Inatividade watchdog
export const lastActivity = new Map();
export const idleTimers = new Map();

// Rate limiting
export const rateCounters = new Map();
