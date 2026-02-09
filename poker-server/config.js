// config.js — Configuracoes e constantes do poker server
import { ethers } from "ethers";

// Admin wallets — podem criar/gerenciar mesas off-chain
export const ADMIN_WALLETS = new Set([
  (process.env.ADMIN_WALLET || '0xeb1c187a7f6cd92e86032abe2808419d78ceca38').toLowerCase(),
]);

// Blockchain config
export const BLOCKCHAIN_CONFIG = {
  rpcUrl: process.env.RPC_URL?.trim() || "https://bsc-dataseed1.binance.org/",
  chainId: 56,
  contracts: {
    casinoChips: process.env.CHIPS_ADDRESS || null,
    factory: process.env.FACTORY_ADDRESS || null
  },
  operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY
};

// ABIs
export const CHIPS_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export const TABLE_ABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function withdrawAll()",
  "function balance(address) view returns (uint256)",
  "function startRound()",
  "function settleNet(address[] players, int256[] deltas)",
  "function settleNetBySig(address[] players, int256[] deltas, uint256 nonce, uint256 deadline, bytes signature)",
  "function roundActive() view returns (bool)",
  "function joinWaitlist()",
  "function leaveWaitlist()",
  "function seatNextFromWaitlist()",
  "function seatPlayer(address player)",
  "function unseatPlayer(address player)",
  "function setForSale(uint256 priceUSDT, address receiver)",
  "function buyTable(uint256 expectedPriceUSDT, address expectedReceiver)",
  "event RoundStarted()",
  "event RoundSettled()",
  "event Seated(address indexed player)",
  "event Unseated(address indexed player)",
  "event Deposited(address indexed player, uint256 amount)",
  "event Withdrawn(address indexed player, uint256 amount)",
  "event FeeAccrued(uint256 amount)",
  "event FeeWithdrawn(address indexed to, uint256 amount)",
  "event WaitlistJoined(address indexed player, uint256 position)",
  "event WaitlistLeft(address indexed player)",
  "event SeatNext(address indexed player)",
  "event TableClosed(address indexed to)",
  "event TableForSale(uint256 price, address receiver)",
  "event TableSaleCancelled()",
  "event TableSold(address indexed oldCreator, address indexed newCreator, uint256 price)",
  "event SettlementBySig(address indexed caller, address indexed signer, uint256 indexed nonce)"
];

export const FACTORY_ABI = [
  "function getTable(string calldata tableIdText) external view returns (address)",
  "function createTable(string calldata tableIdText,uint16 feeBps,bool makePublic,uint16 tableMaxSeats) external",
  "event TableCreated(string indexed tableIdText,address indexed table,address indexed creator,address chips,address operator,uint16 feeBpsUsed,bool isPublic,uint16 maxSeats,uint16 saleFeeBps)"
];

// Mapeamento de naipes para poker-evaluator
export const SUIT_MAP = {
  '\u2660': 's',
  '\u2665': 'h',
  '\u2666': 'd',
  '\u2663': 'c'
};

export const TOURNAMENT_CONFIG = {
  buyIn: 1000,
  startingChips: 10000,
  blindSchedule: [
    { smallBlind: 50, bigBlind: 100, duration: 600000 },
    { smallBlind: 100, bigBlind: 200, duration: 600000 },
    { smallBlind: 150, bigBlind: 300, duration: 600000 },
    { smallBlind: 200, bigBlind: 400, duration: 600000 },
  ]
};

export const INACTIVITY_MS = 3 * 60 * 1000; // 3 minutos

// TABLE_CONFIG e criado apos init da blockchain, exportado via createTableConfig
export function createTableConfig(blockchainEnabled) {
  return {
    defaultSeats: 10,
    smallBlind: 50,
    bigBlind: 100,
    minBuyin: 5000,
    maxBuyin: 100000,
    autoStartDelay: 3000,
    maxNameLength: 20,
    actionTimeout: 30000,
    maxMessageLength: 200,
    blockchainMode: blockchainEnabled
  };
}
