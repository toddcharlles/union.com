// js/chain/abi.js
export const FACTORY_ABI = [
  "function createTable(string tableIdText, uint16 feeBps, bool makePublic, uint16 tableMaxSeats) external",
  "function getTable(string tableIdText) view returns (address)",
  "function canCreateTable(address user) view returns (bool ok, string reason)",
  "function createPrice() view returns (uint256)",
  "function isEligibleToCreate(address user) view returns (bool)",
  "event TableCreated(string indexed tableIdText, address indexed table, address indexed creator)"
];
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];
export const TABLE_ABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function withdrawAll()",
  "function balance(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function balances(address) view returns (uint256)",
  "function playerBalance(address) view returns (uint256)",
  "function playerBalances(address) view returns (uint256)"
];
export const CASHIER_ABI = [
  "function buyChips(uint256 usdtAmount)",
  "function redeemChips(uint256 chipAmount)",
  "function previewBuy(uint256) view returns (uint256, uint256, uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function isEligible(address) view returns (bool)",
  "function paymentToken() view returns (address)",
  "function minBuy() view returns (uint256)",
  "function maxBuy() view returns (uint256)"
];
