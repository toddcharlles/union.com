// poker-server-hybrid.js – Servidor híbrido on-chain/off-chain com suporte a múltiplas mesas dinâmicas e avaliação real de mãos
// Instalação: npm init -y && npm i express socket.io nanoid cors ethers dotenv poker-evaluator
// Executar: node poker-server-hybrid.js

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import dotenv from "dotenv";
import PokerEvaluator from "poker-evaluator";
import bodyParser from "body-parser";

const pokerEvaluator = PokerEvaluator;
const getHandRank = (cards) => pokerEvaluator.evalHand(cards);

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

/** ================= BLOCKCHAIN INTEGRAÇÃO ================= */
const BLOCKCHAIN_CONFIG = {
  rpcUrl: process.env.RPC_URL?.trim() || "https://bsc-dataseed1.binance.org/",
  chainId: 56,
  contracts: {
    casinoChips: process.env.CHIPS_ADDRESS || null,
    factory: process.env.FACTORY_ADDRESS || null
  },
  operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY
};

// ABIs
const CHIPS_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const TABLE_ABI = [
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

const FACTORY_ABI = [
  "function getTable(string calldata tableIdText) external view returns (address)",
  "function createTable(string calldata tableIdText,uint16 feeBps,bool makePublic,uint16 tableMaxSeats) external",
  "event TableCreated(string indexed tableIdText,address indexed table,address indexed creator,address chips,address operator,uint16 feeBpsUsed,bool isPublic,uint16 maxSeats,uint16 saleFeeBps)"
];

let provider, operatorWallet, chipsContract, factoryContract;
let blockchainEnabled = false;

// State mappings
const playerWallets = new Map();  // playerId -> wallet (lowercase)
const socketWallets = new Map();  // socket.id -> wallet (lowercase)

// Admin wallets — podem criar/gerenciar mesas off-chain
const ADMIN_WALLETS = new Set([
  (process.env.ADMIN_WALLET || '0xeb1c187a7f6cd92e86032abe2808419d78ceca38').toLowerCase(),
]);

function isAdmin(socketId) {
  const wallet = socketWallets.get(socketId);
  return wallet && ADMIN_WALLETS.has(wallet.toLowerCase());
}

// Mapeamentos para múltiplas mesas
const tables = new Map();         // tableIdText (string) -> objeto de estado da mesa
const tableContracts = new Map(); // tableIdText -> instância do contrato ethers.Contract

// Mapeamento de naipes para poker-evaluator
const SUIT_MAP = {
  '♠': 's', // spades
  '♥': 'h', // hearts
  '♦': 'd', // diamonds
  '♣': 'c'  // clubs
};

// ====== Mutex por mesa ======
const tableLocks = new Map(); // tableIdText -> Promise tail
function enqueueTableJob(tableIdText, job) {
  const tail = tableLocks.get(tableIdText) || Promise.resolve();
  const next = tail.then(job).catch((error) => {
    console.error(`[LOCK ${tableIdText}] Erro:`, error?.message || error);
  });
  tableLocks.set(tableIdText, next);
  return next;
}

// ====== Fila de assentos pendentes (quando o round está ativo) ======
const pendingSeats = new Map(); // tableIdText -> Set<walletLower>
function queueSeat(tableIdText, walletLower) {
  const set = pendingSeats.get(tableIdText) || new Set();
  set.add(walletLower);
  pendingSeats.set(tableIdText, set);
}

async function processPendingSeats(tableIdText) {
  const contract = tableContracts.get(tableIdText);
  if (!contract) return;

  // só processa se o round estiver FECHADO
  let active = true;
  try { active = await contract.roundActive(); } catch {}
  if (active) return;

  const set = pendingSeats.get(tableIdText);
  if (!set || !set.size) return;

  await enqueueTableJob(tableIdText, async () => {
    for (const w of Array.from(set)) {
      try {
        await contract.seatPlayer(w);
        set.delete(w);
        console.log(`✅ seat pós-settlement: ${w} em ${tableIdText}`);
      } catch (e) {
        console.warn(`⚠️ seat pós-settlement falhou (${w}):`, e?.message || e);
      }
    }
    if (!set.size) pendingSeats.delete(tableIdText);
  });
}

/* =================================================================== */
/* ================= INATIVIDADE/WATCHDOG DE SETTLEMENT ============== */
/* =================================================================== */
const INACTIVITY_MS = 3 * 60 * 1000; // 3 minutos
const lastActivity = new Map(); // tableIdText -> timestamp (ms)
const idleTimers   = new Map(); // tableIdText -> setTimeout handle

function scheduleIdleCheck(tableIdText) {
  const prev = idleTimers.get(tableIdText);
  if (prev) clearTimeout(prev);
  const handle = setTimeout(() => maybeForceSettleIfIdle(tableIdText), INACTIVITY_MS + 250);
  idleTimers.set(tableIdText, handle);
}

function markActivity(tableOrId) {
  const tableIdText = typeof tableOrId === 'string' ? tableOrId : tableOrId?.id;
  if (!tableIdText) return;
  lastActivity.set(tableIdText, Date.now());
  scheduleIdleCheck(tableIdText);
}

async function maybeForceSettleIfIdle(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) return;
  const last = lastActivity.get(tableIdText) || 0;
  const idleFor = Date.now() - last;
  if (idleFor < INACTIVITY_MS) return;

  if (!TABLE_CONFIG.blockchainMode) return;
  const contract = tableContracts.get(tableIdText);
  if (!contract) return;

  let active = false;
  try { active = await contract.roundActive(); } catch { return; }
  if (!active) return;

  console.log(`⏱️ Mesa ${tableIdText} ociosa por ${Math.round(idleFor/1000)}s e round on-chain ainda ativo. Forçando settlement...`);
  try {
    await forceSettleNow(tableIdText);
  } catch (e) {
    console.warn(`[idle-settle] falhou para ${tableIdText}:`, e?.message || e);
  } finally {
    markActivity(tableIdText); // reinicia janela
  }
}
/* =================================================================== */

// --- Helpers de assento e wallet ---
function isWalletAlreadySeated(table, walletLower) {
  if (!walletLower) return false;
  for (const p of table.players) {
    if (!p) continue;
    const w = playerWallets.get(p.id);
    if (w && w.toLowerCase() === walletLower) return true;
  }
  return false;
}

async function tryUnseatOnChain(tableIdText, walletLower) {
  if (!TABLE_CONFIG.blockchainMode) return;
  const contract = tableContracts.get(tableIdText);
  if (!contract || !ethers.isAddress(walletLower)) return;
  try {
    const active = await contract.roundActive();
    if (!active) {
      await contract.unseatPlayer(walletLower);
      console.log(`🔻 unseatPlayer on-chain para ${walletLower} em ${tableIdText}`);
    } else {
      console.warn(`⚠️ Round ativo em ${tableIdText}; unseat será tentado após settlement`);
    }
  } catch (e) {
    console.warn(`⚠️ Falha unseatPlayer(${walletLower}) em ${tableIdText}:`, e?.message || e);
  }
}

/**
 * Remove o jogador da mesa imediatamente.
 * - Se for a vez dele, força fold e avança.
 * - Cancela timeouts da mesa.
 * - Emite eventos de saída.
 * - Tenta unseat on-chain (se possível).
 */
function unseatAndCleanup(table, seat, reason = "left") {
  const player = table.players[seat];
  if (!player) return;

  // Se estava para agir, força fold para não travar a rodada
  const isHisTurn = table.activeSeat === seat && table.phase !== "showdown";
  if (isHisTurn) {
    player.folded = true;
    player.actedThisRound = true;
    player.lastAction = "auto-fold (disconnect)";
  }

  // Remover imediatamente
  const walletLower = playerWallets.get(player.id);
  table.players[seat] = null;

  io.to(table.id).emit("playerLeft", { seat, reason });
  broadcastState(table);

  // Se for blockchain, tenta unseat no contrato (se não houver round ativo)
  if (walletLower) {
    tryUnseatOnChain(table.id, walletLower);
  }

  // Se era a vez dele, chamamos o fluxo para continuar a mão
  if (isHisTurn) {
    // pequeno delay para a UI consumir o evento 'playerLeft'
    setTimeout(() => nextAction(table), 50);
  }

  markActivity(table.id);
}

function computeSettlementFromStacks(table) {
  // Só considera jogadores que participaram da mão (tem initialStack definido)
  const items = [];
  for (const p of table.players) {
    if (!p || typeof p.initialStack !== "number") continue;
    const wallet = playerWallets.get(p.id);
    if (!wallet) continue;
    const delta = (p.stack ?? 0) - (p.initialStack ?? 0);
    items.push({ address: wallet, deltaNum: delta });
  }
  if (!items.length) {
     throw new Error("Não há deltas calculáveis (nenhum initialStack definido para este round).");
  }
  // Converte para BigInt em wei e garante soma zero
  const addresses = [];
  const deltas = [];
  let sum = 0n;
  for (const it of items) {
    const bi = ethers.parseEther((it.deltaNum).toString());
    addresses.push(it.address);
    deltas.push(bi);
    sum += bi;
  }
  if (sum !== 0n && deltas.length > 0) {
    // corrige no último
    deltas[deltas.length - 1] -= sum;
  }
  return { addresses, deltas };
}
async function refreshOnChainStacks(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) return;
  const updates = table.players.map(async (p) => {
    if (!p) return;
    const wallet = playerWallets.get(p.id);
    if (!wallet) return;
    const bal = await getPlayerTableBalance(tableIdText, wallet);
    p.stack = Number(bal);
  });
  await Promise.all(updates);
  broadcastState(table);
}


// poker-server-hybrid.js
async function forceSettleNow(tableIdText) {
  const contract = tableContracts.get(tableIdText);
  if (!contract) throw new Error('Contrato não encontrado para ' + tableIdText);

  const { players, deltas } = computeEip712FromTable(tableIdText);

  // Garante soma zero
  const sum = deltas.reduce((a, b) => a + b, 0n);
  if (sum !== 0n && deltas.length > 0) {
    console.warn('[forceSettleNow] Soma != 0, corrigindo último delta:', sum.toString());
    deltas[deltas.length - 1] -= sum;
  }

  const nonce = await getSettlementNonce(contract);
  const { signature, deadline } = await signSettlement(tableIdText, players, deltas, nonce);

  const tx = await contract.settleNetBySig(
    players,
    deltas.map(d => d.toString()),
    nonce,
    deadline,
    signature,
    { gasLimit: 500000 }
  );
  const rc = await tx.wait();
  console.log('[forceSettleNow] Tx hash:', rc.hash);

  try { await refreshStacksFromChain(tableIdText); } catch (e) { console.warn('Falha no refresh stacks:', e); }
  io.to(tableIdText).emit('blockchainRoundSettled');

  // Marca atividade (evita loop de watchdog)
  markActivity(tableIdText);

  const table = tables.get(tableIdText);
  if (table) setTimeout(() => startHand(table), 3000);

  return { ok: true, tx: rc.hash };
}


async function forceSettleZeroDeltas(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) throw new Error("Mesa inválida");
  const contract = tableContracts.get(tableIdText);
  if (!contract) throw new Error("Contrato da mesa não encontrado");

  const active = await contract.roundActive();
  if (!active) {
    return { ok: true, msg: "Round já está fechado." };
  }

  // usa os jogadores atualmente sentados na mesa
  const addresses = table.players
    .map(p => p && playerWallets.get(p.id))
    .filter(Boolean);

  if (!addresses.length) {
    throw new Error("Sem carteiras para assinar.");
  }

  // todos zero = não transfere fichas, apenas fecha o round
  const zeros = addresses.map(() => 0n);
  const rc = await settleRound(tableIdText, addresses, zeros);
  return { ok: true, tx: rc?.hash || null };
}

// Atualiza um único jogador a partir do contrato
async function refreshOneStackFromChain(tableIdText, walletLower) {
  const bal = await getPlayerTableBalance(tableIdText, walletLower);
  const table = tables.get(tableIdText);
  if (!table) return;
  for (const p of table.players) {
    if (!p) continue;
    const w = playerWallets.get(p.id);
    if (w && w.toLowerCase() === walletLower) {
      p.stack = Number(bal);
      // opcional: sincroniza initialStack para a próxima mão
      p.initialStack = p.stack;
    }
  }
}

// Atualiza todos os jogadores sentados na mesa
async function refreshStacksFromChain(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) return;
  const updates = [];
  for (const p of table.players) {
    if (!p) continue;
    const w = playerWallets.get(p.id);
    if (!w) continue;
    updates.push(
      getPlayerTableBalance(tableIdText, w).then(bal => {
        p.stack = Number(bal);
        p.initialStack = p.stack;
      }).catch(() => {})
    );
  }
  await Promise.all(updates);
  broadcastState(table);
}

// Usado pelos eventos de depósito/saque
async function updatePlayerStackFromEvent(tableIdText, walletLower, _amountNum, _isDeposit) {
  try { await refreshOneStackFromChain(tableIdText, walletLower); }
  catch (e) { console.warn('[updatePlayerStackFromEvent] falhou:', e?.message || e); }
}

function initBlockchain() {
  try {
    provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.rpcUrl);

    if (!BLOCKCHAIN_CONFIG.operatorPrivateKey) {
      console.warn("⚠️ OPERATOR_PRIVATE_KEY não configurada - blockchain desabilitada");
      return false;
    }

    operatorWallet = new ethers.Wallet(BLOCKCHAIN_CONFIG.operatorPrivateKey, provider);

    chipsContract = new ethers.Contract(
      BLOCKCHAIN_CONFIG.contracts.casinoChips,
      CHIPS_ABI,
      provider
    );

    if (BLOCKCHAIN_CONFIG.contracts.factory) {
      factoryContract = new ethers.Contract(
        BLOCKCHAIN_CONFIG.contracts.factory,
        FACTORY_ABI,
        operatorWallet
      );
    } else {
      console.error("❌ FACTORY_ADDRESS não configurado. Múltiplas mesas não funcionarão.");
      return false;
    }

    console.log(`✅ Blockchain inicializado`);
    console.log(`   Operator: ${operatorWallet.address}`);
    console.log(`   Factory: ${BLOCKCHAIN_CONFIG.contracts.factory}`);

    listenToFactoryEvents();
    return true;
  } catch (error) {
    console.error("❌ Erro ao inicializar blockchain:", error.message);
    return false;
  }
}

function listenToFactoryEvents() {
  if (!factoryContract) return;

  factoryContract.on("TableCreated", (
    tableIdText,
    tableAddress,
    creator,
    chips,
    operator,
    feeBpsUsed,
    isPublic,
    maxSeats,
    saleFeeBps,
    event
  ) => {
    const id = tableIdText;
    console.log(`🆕 Nova mesa criada: ${id} @ ${tableAddress}`);

    const table = createTable(id, Number(maxSeats));
    table.contractAddress = tableAddress;
    table.creator = creator.toLowerCase();
    table.isPublic = isPublic;
    table.maxSeats = Number(maxSeats);

    const tableContract = new ethers.Contract(
      tableAddress,
      TABLE_ABI,
      operatorWallet
    );
    tableContracts.set(id, tableContract);
    tables.set(id, table);

    // marca atividade inicial da mesa
    markActivity(id);

    listenToTableEvents(tableContract, id);
    io.emit("newTable", { id, address: tableAddress, isPublic, maxSeats: Number(maxSeats) });
  });

  console.log("👂 Escutando eventos da Factory...");
}

function listenToTableEvents(tableContract, tableIdText) {
  tableContract.on("RoundStarted", () => {
    io.to(tableIdText).emit("blockchainRoundStarted");
    markActivity(tableIdText);
  });

  tableContract.on("RoundSettled", async () => {
    io.to(tableIdText).emit("blockchainRoundSettled");
    markActivity(tableIdText);

    // Processa assentos pendentes agora que o round fechou
    try { await processPendingSeats(tableIdText); } catch (e) { console.warn(e?.message || e); }

    await refreshOnChainStacks(tableIdText);
    const table = tables.get(tableIdText);
    if (table) {
      try { await refreshStacksFromChain(tableIdText); } catch (_) {}
      const ready = table.players.filter(p => p && p.stack > 0 && p.connected).length >= 2;
      if (ready) setTimeout(() => startHand(table), 3000);
      else { table.phase = "waiting"; broadcastState(table); }
    }
  });

  tableContract.on("Seated", (player) => {
    io.to(tableIdText).emit("blockchainSeated", { player: player.toLowerCase() });
    markActivity(tableIdText);
  });

  tableContract.on("Unseated", (player) => {
    io.to(tableIdText).emit("blockchainUnseated", { player: player.toLowerCase() });
    markActivity(tableIdText);
  });

  tableContract.on("Deposited", (player, amount, event) => {
    const walletLower = player.toLowerCase();
    const amountNum = parseFloat(ethers.formatEther(amount));
    io.to(tableIdText).emit("blockchainDeposit", {
      player: walletLower,
      amount: amountNum,
      txHash: event.log.transactionHash
    });
    markActivity(tableIdText);
    updatePlayerStackFromEvent(tableIdText, walletLower, amountNum, true);
  });

  tableContract.on("Withdrawn", (player, amount, event) => {
    const walletLower = player.toLowerCase();
    const amountNum = parseFloat(ethers.formatEther(amount));
    io.to(tableIdText).emit("blockchainWithdraw", {
      player: walletLower,
      amount: amountNum,
      txHash: event.log.transactionHash
    });
    markActivity(tableIdText);
    updatePlayerStackFromEvent(tableIdText, walletLower, amountNum, false);
  });

  tableContract.on("SettlementBySig", (caller, signer, nonce) => {
    io.to(tableIdText).emit("blockchainSettlementBySig", {
      caller: caller.toLowerCase(),
      signer: signer.toLowerCase(),
      nonce
    });
    markActivity(tableIdText);
  });
}

// ===== Helpers blockchain por mesa =====
// ===== Nonce helper para EIP-712 (não depende de getter on-chain)

async function getSettlementNonce(contract) {
  try { if (typeof contract.settleNonce === 'function') return await contract.settleNonce(); } catch {}
  try { if (typeof contract.getSettleNonce === 'function') return await contract.getSettleNonce(); } catch {}
  try { if (typeof contract.nonce === 'function') return await contract.nonce(); } catch {}
  try { if (typeof contract.getNonce === 'function') return await contract.getNonce(); } catch {}
  try { if (typeof contract.nonces === 'function') return await contract.nonces(operatorWallet.address); } catch {}
  // Fallback: nonce exclusivo baseado em timestamp (segundos)
  return BigInt(Math.floor(Date.now() / 1000));
}


async function getPlayerTableBalance(tableIdText, playerAddress) {
  const tableContract = tableContracts.get(tableIdText);
  if (!tableContract || !ethers.isAddress(playerAddress)) return 0;

  const cand = ["balanceOf", "balance", "balances", "getBalance"];
  for (const fn of cand) {
    try {
      if (typeof tableContract[fn] === "function") {
        const raw = await tableContract[fn](playerAddress);
        return Number(ethers.formatEther(raw));
      }
    } catch (_) { /* tenta o próximo nome */ }
  }
  return 0;
}

async function getChipsBalance(playerAddress) {
  try {
    const balance = await chipsContract.balanceOf(playerAddress);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error(`Erro ao ler CHIPS de ${playerAddress}:`, error.message);
    return "0";
  }
}

async function startOnChainRound(tableIdText) {
  const tableContract = tableContracts.get(tableIdText);
  if (!tableContract) {
    console.warn("⚠️ Contrato não encontrado");
    return null;
  }

  try {
    const isActive = await tableContract.roundActive();
    if (isActive) {
      console.warn(`⚠️ Round on-chain ainda ativo em ${tableIdText}. Aguardando inatividade (${INACTIVITY_MS/1000}s) para forçar settlement...`);
      scheduleIdleCheck(tableIdText);
      return null;
    }

    console.log(`🎲 Iniciando round on-chain na mesa ${tableIdText}...`);
    const transaction = await tableContract.startRound();
    const receipt = await transaction.wait();
    console.log(`✅ Round iniciado: ${receipt.hash}`);
    return receipt;
  } catch (error) {
    console.error("❌ Erro ao iniciar round:", error.message);
    return null;
  }
}

async function settleRound(tableIdText, addresses, deltas) {
  const tableContract = tableContracts.get(tableIdText);
  if (!tableContract) {
    console.warn(`⚠️ Contrato não encontrado para settlement da mesa ${tableIdText}`);
    return null;
  }
  const sum = deltas.reduce((accumulator, delta) => accumulator + BigInt(delta), 0n);
  if (sum !== 0n) {
    console.error(`❌ Soma dos deltas deve ser zero. Soma atual: ${sum}`);
    console.log(`[settleRound] Endereços: ${JSON.stringify(addresses)}`);
    console.log(`[settleRound] Deltas: ${JSON.stringify(deltas)}`);
    return null;
  }
  try {
    console.log(`💰 Iniciando settlement on-chain na mesa ${tableIdText}...`);
    console.log(`[settleRound] Endereços: ${JSON.stringify(addresses)}`);
    console.log(`[settleRound] Deltas: ${JSON.stringify(deltas.map(d => d.toString()))}`);
    const deltasAsStrings = deltas.map(d => d.toString());
    const transaction = await tableContract.settleNet(addresses, deltasAsStrings);
    const receipt = await transaction.wait();
    console.log(`✅ Settlement concluído na mesa ${tableIdText}: ${receipt.hash}`);
    try { await refreshStacksFromChain(tableIdText); } catch (_) {}
    return receipt;
  } catch (error) {
    console.error(`❌ Erro no settlement da mesa ${tableIdText}:`, error.message);
    return null;
  }
}

// ---- EIP-712 Settlement (assinatura do operador) ----
const EIP712_DOMAIN = {
  name: "SimplePokerTable",
  version: "1"
};

const SETTLEMENT_TYPES = {
  Settlement: [
    { name: "nonce", type: "uint256" },
    { name: "players", type: "address[]" },
    { name: "deltas", type: "int256[]" },
    { name: "deadline", type: "uint256" }
  ]
};

function toBigIntArray(arr) {
  return arr.map((x) => {
    if (typeof x === "bigint") return x;
    if (typeof x === "number") return BigInt(x);
    if (typeof x === "string") return BigInt(x);
    throw new Error("delta inválido");
  });
}


async function signSettlement(tableIdText, players, deltas, nonceOverride = null) {
  const contract = tableContracts.get(tableIdText);
  if (!contract) throw new Error('Contrato não encontrado');

  const nonce = nonceOverride ?? await getSettlementNonce(contract);
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hora

  const domain = {
    name: (typeof contract.EIP712_NAME === 'function') ? (await contract.EIP712_NAME()) : 'SimplePokerTable',
    version: (typeof contract.EIP712_VERSION === 'function') ? (await contract.EIP712_VERSION()) : '1',
    chainId: BLOCKCHAIN_CONFIG.chainId,
    verifyingContract: contract.target
  };

  const types = {
    Settlement: [
      { name: 'nonce',    type: 'uint256'   },
      { name: 'players',  type: 'address[]' },
      { name: 'deltas',   type: 'int256[]'  },
      { name: 'deadline', type: 'uint256'   }
    ]
  };

  const value = { nonce, players, deltas, deadline };

  const signature = await operatorWallet.signTypedData(domain, types, value);
  console.log('[signSettlement] Assinatura gerada:', signature);

  // ⚠️ IMPORTANTE: nunca envie BigInt por socket/HTTP. Se precisar enviar, converta.
  return {
    tableId: tableIdText,
    contract: contract.target,
    players,                 // array de address
    deltas,                  // BigInt[] (uso interno)
    nonce,                   // BigInt   (uso interno)
    deadline,                // number
    signature                // string
  };
}



// ===== Conversão de cartas =====
function convertCardToEvaluatorFormat(card) {
  if (!card || !card.r || !card.s) return null;
  const rank = card.r;
  const suit = SUIT_MAP[card.s];
  if (!suit) return null;
  return rank + suit;
}

blockchainEnabled = initBlockchain();

/** ================= GAME CONFIG ================= */
const TABLE_CONFIG = {
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

const TOURNAMENT_CONFIG = {
  buyIn: 1000,
  startingChips: 10000,
  blindSchedule: [
    { smallBlind: 50, bigBlind: 100, duration: 600000 },
    { smallBlind: 100, bigBlind: 200, duration: 600000 },
    { smallBlind: 150, bigBlind: 300, duration: 600000 },
    { smallBlind: 200, bigBlind: 400, duration: 600000 },
  ]
};

const tournaments = new Map();
const rankings = new Map();
const actionTimeouts = new Map();

/** ================= LOBBY & TABLE ENGINE ================= */
function createTable(id, seats) {
  return {
    id,
    players: Array(seats).fill(null),
    phase: 'waiting',
    pots: [{ amount: 0, eligible: [] }],
    board: [],
    deck: [],
    activeSeat: -1,
    dealerSeat: -1,
    currentBet: 0,
    minRaise: TABLE_CONFIG.bigBlind,
    tournamentId: id.startsWith('t-') ? id.slice(2) : null,
    blindLevel: 0,
    nextBlindTime: 0,
    lastAggressor: -1,
    actionsThisRound: 0,
    canFinalize: false,
    pendingWinners: null
  };
}

function broadcastState(table) {
  const state = {
    players: table.players.map(player => player ? {
      id: player.id,
      name: player.name,
      stack: player.stack,
      bet: player.bet,
      folded: player.folded,
      allIn: player.allIn,
      lastAction: player.lastAction,
      connected: player.connected
    } : null),
    phase: table.phase,
    pot: table.pots.reduce((sum, pot) => sum + pot.amount, 0),
    board: table.board,
    activeSeat: table.activeSeat,
    dealerSeat: table.dealerSeat,
    currentBet: table.currentBet,
    canFinalize: table.canFinalize
  };
  io.to(table.id).emit('state', state);
}

function shuffleDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ r: rank, s: suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function findNextActive(current, table) {
  const startSeat = current;
  let next = (current + 1) % table.players.length;
  let iterations = 0;
  const maxIterations = table.players.length;

  while (iterations < maxIterations) {
    const player = table.players[next];
    
    if (player && player.stack > 0 && !player.folded && player.connected && !player.allIn) {
      console.log(`[findNextActive] Próximo jogador ativo: seat ${next} (${player.name})`);
      return next;
    }
    
    next = (next + 1) % table.players.length;
    iterations++;
    
    if (next === startSeat) {
      console.warn(`[findNextActive] Nenhum jogador ativo encontrado após ${iterations} iterações`);
      return -1;
    }
  }

  console.warn(`[findNextActive] Esgotou ${maxIterations} iterações sem encontrar jogador ativo`);
  return -1;
}

function forceBet(table, seat, amount) {
  const player = table.players[seat];
  const bet = Math.min(amount, player.stack);
  player.stack -= bet;
  player.bet += bet;
  table.pots[0].amount += bet;
  if (player.stack === 0) player.allIn = true;
}

function startHand(table) {
  enqueueTableJob(table.id, async () => {
    if (TABLE_CONFIG.blockchainMode) {
      const tableContract = tableContracts.get(table.id);
      if (tableContract) {
        try {
          const isActive = await tableContract.roundActive();
          if (isActive) {
            console.warn(`⚠️ Round on-chain ainda ativo em ${table.id}. Aguardando inatividade (${INACTIVITY_MS/1000}s) para forçar settlement...`);
            scheduleIdleCheck(table.id);
            return;
          }
        } catch (e) {
          console.error('[startHand] Erro ao checar roundActive:', e?.message);
          return;
        }
      }
    }

    table.phase = 'preflop';
    table.pots = [{ amount: 0, eligible: [] }];
    table.board = [];
    table.actionsThisRound = 0;
    table.lastAggressor = -1;
    table.currentBet = 0;
    table.minRaise = table.customBlinds?.bigBlind || TABLE_CONFIG.bigBlind;
    table.actionsThisRound = 0;
    table.lastAggressor = -1;
    table.canFinalize = false;
    table.pendingWinners = null;

    table.players.forEach(player => {
      if (player) {
        player.bet = 0;
        player.folded = false;
        player.allIn = false;
        player.lastAction = null;
        player.hole = [];
        player.initialStack = player.stack;
        player.actedThisRound = false;
      }
    });

    const activePlayers = table.players.filter(player => player && player.stack > 0 && player.connected);
    if (activePlayers.length < 2) {
      table.phase = 'waiting';
      console.log(`[startHand] Menos de 2 jogadores ativos na mesa ${table.id}. Aguardando.`);
      broadcastState(table);
      return;
    }

    table.dealerSeat = (table.dealerSeat + 1) % table.players.length;
    while (!table.players[table.dealerSeat] || table.players[table.dealerSeat].stack <= 0) {
      table.dealerSeat = (table.dealerSeat + 1) % table.players.length;
    }

    table.deck = shuffleDeck();

    table.players.forEach(player => {
      if (player && player.stack > 0) {
        player.hole = [table.deck.pop(), table.deck.pop()];
        io.to(player.socketId).emit('hole', { cards: player.hole });
      }
    });

    const smallBlind = table.tournamentId
      ? TOURNAMENT_CONFIG.blindSchedule[table.blindLevel].smallBlind
      : (table.customBlinds?.smallBlind || TABLE_CONFIG.smallBlind);
    const bigBlind = table.tournamentId
      ? TOURNAMENT_CONFIG.blindSchedule[table.blindLevel].bigBlind
      : (table.customBlinds?.bigBlind || TABLE_CONFIG.bigBlind);

    const sbSeat = findNextActive(table.dealerSeat, table);
    const bbSeat = findNextActive(sbSeat, table);

    forceBet(table, sbSeat, Math.min(smallBlind, table.players[sbSeat].stack));
    forceBet(table, bbSeat, Math.min(bigBlind, table.players[bbSeat].stack));

    table.currentBet = table.players[bbSeat].bet;
    table.activeSeat = findNextActive(bbSeat, table);

    if (TABLE_CONFIG.blockchainMode) {
      const tableContract = tableContracts.get(table.id);
      if (tableContract) {
        try {
          const isActive = await tableContract.roundActive();
          if (!isActive) {
            await startOnChainRound(table.id);
          } else {
            console.warn(`⚠️ Round já ativo no contrato ${table.id} após settlement, mantendo sincronização`);
          }
        } catch (e) {
          console.error('[startHand] Erro ao verificar estado on-chain:', e?.message);
        }
      }
    }

    markActivity(table.id);
    broadcastState(table);
    requestAction(table);
  });
}

function requestAction(table) {
  const seat = table.activeSeat;
  const player = table.players[seat];
  
  if (!player || player.folded || player.allIn || player.stack <= 0) {
    console.log(`[requestAction] Jogador ${seat} não pode agir, pulando para o próximo`);
    return nextAction(table);
  }

  const existingTimeout = actionTimeouts.get(table.id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    actionTimeouts.delete(table.id);
  }

  const toCall = table.currentBet - player.bet;
  const maxRaise = Math.max(0, player.stack - toCall); // quanto dá p/ subir além do call
  console.log(`[requestAction] Solicitando ação de ${player.name} (seat ${seat}). toCall: ${toCall}, currentBet: ${table.currentBet}`);
  
  io.to(player.socketId).emit('hole', { cards: player.hole });
  io.to(player.socketId).emit('actionRequest', { 
    toCall,
    minRaise: table.minRaise,
    maxRaise
  });

  const timeoutId = setTimeout(() => {
    console.log(`[requestAction] Timeout para ${player.name} (seat ${seat}). Forçando fold.`);
    if (table.activeSeat === seat && table.phase !== 'showdown') {
      playerAction(table, seat, 'fold');
    }
    actionTimeouts.delete(table.id);
  }, TABLE_CONFIG.actionTimeout);
  
  actionTimeouts.set(table.id, timeoutId);
}

function nextAction(table) {
  const existingTimeout = actionTimeouts.get(table.id);
  if (existingTimeout) clearTimeout(existingTimeout);
  actionTimeouts.delete(table.id);

  const activePlayers = table.players.filter(p => p && !p.folded && p.stack > 0 && p.connected);
  if (activePlayers.length <= 1) {
    advancePhase(table);
    return;
  }

  const playersWhoCanAct = activePlayers.filter(p => !p.allIn);
  if (playersWhoCanAct.length === 0) {
    advancePhase(table);
    return;
  }

  const allActed = playersWhoCanAct.every(p => p.actedThisRound);
  const allEqualized = playersWhoCanAct.every(p => p.bet === table.currentBet);

  if (allActed && allEqualized) {
    console.log(`[nextAction] Rodada completa. Avançando fase.`);
    advancePhase(table);
    return;
  }

  let nextSeat = findNextActive(table.activeSeat, table);
  let attempts = 0;
  while (nextSeat !== -1 && attempts < table.players.length) {
    const nextPlayer = table.players[nextSeat];
    if (nextPlayer && !nextPlayer.actedThisRound && !nextPlayer.folded && !nextPlayer.allIn && nextPlayer.stack > 0) {
      table.activeSeat = nextSeat;
      requestAction(table);
      return;
    }
    nextSeat = findNextActive(nextSeat, table);
    attempts++;
  }

  console.warn(`[nextAction] Não encontrou próximo jogador. Avançando.`);
  advancePhase(table);
}

function playerAction(table, seat, action, amount = 0) {
  enqueueTableJob(table.id, async () => {
    const player = table.players[seat];
    
    if (table.activeSeat !== seat) {
      console.warn(`[playerAction] Jogador ${seat} tentou agir fora da vez (ativo: ${table.activeSeat})`);
      return;
    }
    
    if (!player) {
      console.warn(`[playerAction] Jogador ${seat} não existe`);
      return;
    }

    const existingTimeout = actionTimeouts.get(table.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      actionTimeouts.delete(table.id);
    }

    const toCall = table.currentBet - player.bet;
    let valid = false;

    console.log(`[playerAction] ${player.name} (seat ${seat}) ação: ${action}, amount: ${amount}, toCall: ${toCall}`);

    switch (action) {
      case 'fold':
        player.folded = true;
        player.lastAction = 'fold';
        player.actedThisRound = true;
        table.actionsThisRound++;
        valid = true;
        console.log(`[playerAction] ${player.name} deu fold`);
        break;

      case 'check':
        if (toCall === 0) {
          player.lastAction = 'check';
          player.actedThisRound = true;
          table.actionsThisRound++;
          valid = true;
          console.log(`[playerAction] ${player.name} deu check`);
        } else {
          console.warn(`[playerAction] ${player.name} tentou dar check com toCall=${toCall}`);
        }
        break;

      case 'call':
        if (toCall > 0) {
          const callAmount = Math.min(toCall, player.stack);
          player.stack -= callAmount;
          player.bet += callAmount;
          table.pots[table.pots.length - 1].amount += callAmount;
          
          if (player.stack === 0) {
            player.allIn = true;
            player.lastAction = 'all-in (call)';
          } else {
            player.lastAction = 'call';
          }
          
          player.actedThisRound = true;
          table.actionsThisRound++;
          valid = true;
          console.log(`[playerAction] ${player.name} deu call de ${callAmount}. Novo bet: ${player.bet}`);
        } else {
          console.warn(`[playerAction] ${player.name} tentou dar call com toCall=0`);
        }
        break;

      case 'raise': {
        // quanto dá pra realmente aumentar além do call
        const raiseCap = Math.max(0, player.stack - toCall);
        const requested = Math.max(0, Number(amount) || 0);
        const raiseAmount = Math.min(requested, raiseCap);

        // se não dá pra aumentar nada além do call, trate como CALL (ou all-in-call)
        if (raiseAmount === 0) {
          action = 'call';
          // recursivo simples: processa como call
          playerAction(table, seat, 'call', 0);
          return;
        }

        // permitir all-in curto: se raiseAmount < minRaise, só é válido se for all-in
        const willBeAllIn = (toCall + raiseAmount) === player.stack;
        const meetsMin = raiseAmount >= table.minRaise;
        if (!meetsMin && !willBeAllIn) {
          console.warn(`[playerAction] raise abaixo do mínimo (${raiseAmount} < ${table.minRaise}) e não é all-in`);
          break;
        }

        const totalBet = toCall + raiseAmount;
        if (player.stack < totalBet) {
          console.warn(`[playerAction] ${player.name} não tem stack suficiente para raise (totalBet=${totalBet})`);
          break;
        }

        player.stack -= totalBet;
        player.bet += totalBet;
        table.pots[table.pots.length - 1].amount += totalBet;

        // atualiza currentBet sempre que houve parte de raise (>0)
        table.currentBet = Math.max(table.currentBet, player.bet);

        if (willBeAllIn) {
          player.allIn = true;
          player.lastAction = 'all-in (raise)';
          // all-in curto NÃO reabre ação: só reabre se o raiseAmount >= minRaise
          if (meetsMin) {
            table.minRaise = raiseAmount;
            table.lastAggressor = seat;
            table.players.forEach((p, idx) => { if (p) p.actedThisRound = (idx === seat); });
            table.actionsThisRound = 1;
          } else {
            // não reabre, só marca que agiu
            player.actedThisRound = true;
            table.actionsThisRound++;
          }
        } else {
          // raise normal (reabre ação)
          table.minRaise = raiseAmount;
          table.lastAggressor = seat;
          table.players.forEach((p, idx) => { if (p) p.actedThisRound = (idx === seat); });
          table.actionsThisRound = 1;
          player.actedThisRound = true;
          player.lastAction = `raise ${raiseAmount}`;
        }

        valid = true;
        console.log(`[playerAction] ${player.name} raise=${raiseAmount} (toCall=${toCall}) currentBet=${table.currentBet} allIn=${player.allIn}`);
        break;
      }

      case 'all-in': {
        // gasta tudo: primeiro cobre o toCall; o resto vira raise
        const stackBefore = player.stack;
        if (stackBefore <= 0) break;

        const callAmt = Math.min(toCall, player.stack);
        player.stack -= callAmt;
        player.bet += callAmt;
        table.pots[table.pots.length - 1].amount += callAmt;

        const raisePart = player.stack; // tudo que sobrou vira raise
        if (raisePart > 0) {
          player.bet += raisePart;
          table.pots[table.pots.length - 1].amount += raisePart;
          player.stack = 0;
          table.currentBet = Math.max(table.currentBet, player.bet);

          const meetsMin = raisePart >= table.minRaise;
          if (meetsMin) {
            table.minRaise = raisePart;
            table.lastAggressor = seat;
            table.players.forEach((p, idx) => { if (p) p.actedThisRound = (idx === seat); });
            table.actionsThisRound = 1;
            player.actedThisRound = true;
          } else {
            // all-in curto: não reabre ação
            player.actedThisRound = true;
            table.actionsThisRound++;
          }
          player.allIn = true;
          player.lastAction = 'all-in';
        } else {
          // era apenas um call all-in
          if (player.stack === 0) {
            player.allIn = true;
            player.lastAction = 'all-in (call)';
          } else {
            player.lastAction = 'call';
          }
          player.actedThisRound = true;
          table.actionsThisRound++;
        }

        valid = true;
        console.log(`[playerAction] ${player.name} foi all-in. currentBet=${table.currentBet}`);
        break;
      }

      default:
        console.warn(`[playerAction] Ação inválida: ${action}`);
    }

    if (valid) {
      broadcastState(table);
      markActivity(table.id);
      setTimeout(() => nextAction(table), 100);
    } else {
      console.warn(`[playerAction] Ação ${action} de ${player.name} foi inválida`);
    }
  });
}

function cleanupTable(tableId) {
  const timeout = actionTimeouts.get(tableId);
  if (timeout) {
    clearTimeout(timeout);
    actionTimeouts.delete(tableId);
  }
}

function createSidePots(table) {
  // Tudo que já está acumulado (streets anteriores OU rodando na mesma street)
  const runningPot = table.pots.reduce((s, p) => s + p.amount, 0);

  // Contribuições desta street (o que está em player.bet)
  const bets = table.players.map(p => (p ? p.bet : 0));
  const sumBets = bets.reduce((a, b) => a + b, 0);

  // Apenas o que veio de antes (sem duplicar os bets atuais)
  const carried = Math.max(0, runningPot - sumBets);

  // Níveis distintos de aposta para formar side pots
  const levels = [...new Set(bets.filter(b => b > 0))].sort((a, b) => a - b);

  const newPots = [];
  let prev = 0;
  for (const lvl of levels) {
    const eligibleIdx = table.players
      .map((p, idx) => (p && p.bet >= lvl ? idx : -1))
      .filter(idx => idx >= 0);

    const count = eligibleIdx.length;
    const amount = (lvl - prev) * count; // fatia deste nível

    newPots.push({ amount, eligible: eligibleIdx });
    prev = lvl;
  }

  if (newPots.length === 0) {
    // Ninguém apostou nesta street: só carrega o que já existia
    table.pots = [{ amount: carried, eligible: [] }];
  } else {
    // Soma o que já estava acumulado no primeiro pot (main pot)
    newPots[0].amount += carried;
    table.pots = newPots;
  }

  // Zera as apostas individuais para a próxima street
  table.players.forEach(p => { if (p) p.bet = 0; });
}


function describeReason(winners, everyone) {
  // winners: [{name, handName, rankValue}], everyone idem
  const who = winners.map(w => w.name).join(' e ');
  const winHand = winners[0]?.handName || 'melhor mão';
  const losers = everyone.filter(h => !winners.some(w => w.seat === h.seat));
  const bestLoser = losers.sort((a,b) => b.rankValue - a.rankValue)[0];
  if (!bestLoser) return `Vitória com ${winHand}.`;
  return `Vitória com ${winHand} contra ${bestLoser.handName}.`;
}

function handleShowdown(table) {
  const activePlayers = table.players.filter(p => p && !p.folded);
  if (activePlayers.length === 0) {
    table.canFinalize = true;
    table.pendingWinners = [];
    io.to(table.id).emit('handEnded', { winners: [], allHands: [], reason: "Todos foldaram.", board: table.board });
    markActivity(table.id);
    broadcastState(table);
    return;
  }

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const totalPot = table.pots.reduce((s, pot) => s + pot.amount, 0);
    winner.stack += totalPot;
    io.to(table.id).emit('reveal', { seat: table.players.indexOf(winner), cards: winner.hole });
    const winners = [{ seat: table.players.indexOf(winner), name: winner.name, potAmount: totalPot }];
    const allHands = activePlayers.map(p => ({
      seat: table.players.indexOf(p),
      name: p.name,
      cards: p.hole,
      handName: "—" // sem disputa
    }));
    const reason = `${winner.name} venceu porque todos os demais foldaram.`;
    table.canFinalize = true;
    table.pendingWinners = winners;
    io.to(table.id).emit('handEnded', { winners, allHands, reason, board: table.board });
    markActivity(table.id);
    broadcastState(table);
    return;
  }

  // Avaliar todas as mãos
  const boardCards = table.board.map(convertCardToEvaluatorFormat).filter(Boolean);
  const playerHands = activePlayers.map(player => {
    const holeCards = player.hole.map(convertCardToEvaluatorFormat).filter(Boolean);
    const fullHand = [...holeCards, ...boardCards];
    const rank = getHandRank(fullHand);
    return {
      player,
      seat: table.players.indexOf(player),
      name: player.name,
      rankValue: rank.value,
      description: rank.handName
    };
  });

  playerHands.sort((a, b) => b.rankValue - a.rankValue);
  const bestRank = playerHands[0].rankValue;
  const winners = playerHands.filter(ph => ph.rankValue === bestRank);

  // === LÓGICA DE DISTRIBUIÇÃO DE POTES (MAIN + SIDE POTS) ===
  // Cada pot é resolvido separadamente com base nos jogadores elegíveis
  const resolvedWinners = []; // [{ seat, name, potAmount, hand }]
  let totalAwarded = 0;

  for (const pot of table.pots) {
    if (pot.amount <= 0) continue;

    // Jogadores elegíveis para este pot
    const eligiblePlayers = playerHands.filter(ph => pot.eligible.length === 0 || pot.eligible.includes(ph.seat));
    if (eligiblePlayers.length === 0) {
      // fallback: devolve ao primeiro jogador ativo (não deveria acontecer)
      const fallback = activePlayers[0];
      fallback.stack += pot.amount;
      totalAwarded += pot.amount;
      continue;
    }

    // Melhor mão entre os elegíveis
    const bestInPot = Math.max(...eligiblePlayers.map(p => p.rankValue));
    const potWinners = eligiblePlayers.filter(p => p.rankValue === bestInPot);

    // Divide o pot entre os vencedores deste pot
    const baseShare = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - baseShare * potWinners.length;

    potWinners.forEach((w, idx) => {
      const add = baseShare + (idx < remainder ? 1 : 0);
      w.player.stack += add;
      resolvedWinners.push({
        seat: w.seat,
        name: w.name,
        potAmount: add,
        hand: w.description
      });
    });

    totalAwarded += pot.amount;
  }

  // === EMISSÃO DE EVENTOS ===
  const allHands = playerHands.map(ph => ({
    seat: ph.seat,
    name: ph.name,
    cards: table.players[ph.seat].hole,
    handName: ph.description
  }));

  let reason;
  if (winners.length === 1) {
    const winner = winners[0];
    const others = playerHands.filter(x => x.rankValue !== bestRank);
    if (others.length) {
      reason = `${winner.name} venceu com ${winner.description}. O melhor oponente tinha ${others[0].description}.`;
    } else {
      reason = `${winner.name} venceu com ${winner.description}.`;
    }
  } else {
    reason = `Empate entre ${winners.map(w => w.name).join(" e ")} com ${winners[0].description}.`;
  }

  // Agrupar potAmount por jogador (caso ganhe múltiplos pots)
  const finalWinnersMap = new Map();
  resolvedWinners.forEach(w => {
    if (!finalWinnersMap.has(w.seat)) {
      finalWinnersMap.set(w.seat, { ...w, potAmount: 0 });
    }
    finalWinnersMap.get(w.seat).potAmount += w.potAmount;
  });

  const finalWinners = Array.from(finalWinnersMap.values());

  table.canFinalize = true;
  table.pendingWinners = finalWinners;
  io.to(table.id).emit('handEnded', { winners: finalWinners, allHands, reason, board: table.board });
  markActivity(table.id);
  broadcastState(table);
}

async function finalizeHand(table) {
  updateRanking(table);

  if (TABLE_CONFIG.blockchainMode) {
    enqueueTableJob(table.id, async () => {
      const settlements = [];
      let totalDelta = 0n;

      const playersInHand = table.players.filter(p => p && !p.eliminated && p.initialStack !== undefined);

      for (const player of playersInHand) {
        const wallet = playerWallets.get(player.id);
        if (!wallet) continue;
        const initialStack = player.initialStack ?? 0;
        const finalStack   = player.stack ?? 0;
        const deltaNum     = finalStack - initialStack;              // unidade "chips"
        const deltaWei     = ethers.parseEther(deltaNum.toString()); // BigInt (18 decimais)
        settlements.push({ address: wallet, delta: deltaWei });
        totalDelta += deltaWei;
      }

      if (totalDelta !== 0n && settlements.length > 0) {
        console.warn(`⚠️ Soma dos deltas != 0 (${totalDelta}). Ajustando no último.`);
        settlements[settlements.length - 1].delta -= totalDelta;
      }

      if (settlements.length === 0) {
        console.log(`[finalizeHand] Nenhum settlement necessário para mesa ${table.id}`);
        setTimeout(() => startHand(table), 3000);
        return;
      }

      const addresses = settlements.map(s => s.address);
      const deltas    = settlements.map(s => s.delta);

      try {
        const contract = tableContracts.get(table.id);
        if (!contract) throw new Error('Contrato da mesa não encontrado');

        // 1) assinar com nonce tolerante
        const nonce   = await getSettlementNonce(contract);
        const payload = await signSettlement(table.id, addresses, deltas, nonce);

        // 2) NÃO envie BigInt pro cliente. Se quiser mostrar “prévia”:
        const wirePayload = {
          tableId: payload.tableId,
          contract: payload.contract,
          players: payload.players,
          deltas:  payload.deltas.map(d => d.toString()),
          nonce:   payload.nonce.toString(),
          deadline: payload.deadline,
          signature: payload.signature
        };
        io.to(table.id).emit('settlementData', wirePayload); // opcional

        // 3) submeter on-chain (distribui de fato)
        const tx = await contract.settleNetBySig(
          payload.players,
          payload.deltas.map(d => d.toString()),
          payload.nonce,       // BigInt OK no ethers v6
          payload.deadline,
          payload.signature,
          { gasLimit: 500000 }
        );
        const rc = await tx.wait();
        console.log(`✅ Settlement concluído em ${table.id}: ${rc.hash}`);

        try { await refreshStacksFromChain(table.id); } catch (_) {}
        io.to(table.id).emit('blockchainRoundSettled');
        markActivity(table.id);
        setTimeout(() => startHand(table), 3000);

      } catch (error) {
        console.error(`[finalizeHand] Erro ao liquidar on-chain:`, error?.message || error);
        // Mensagem amigável para a UI
        io.to(table.id).emit('errorMsg', 'Erro ao liquidar on-chain: ' + (error?.message || String(error)));
      }
    });
  } else {
    setTimeout(() => startHand(table), 3000);
  }


  if (table.tournamentId) {
    table.players.forEach(player => { if (player && player.stack <= 0) player.eliminated = true; });
    const remaining = table.players.filter(player => player && !player.eliminated);
    if (remaining.length === 1) {
      endTournament(table.tournamentId, remaining[0].id);
    }
  }
}

function advancePhase(table) {
  cleanupTable(table.id);
  table.canFinalize = false;
  table.pendingWinners = null;

  createSidePots(table);

  if (table.phase === 'preflop') {
    table.phase = 'flop';
    table.board.push(table.deck.pop(), table.deck.pop(), table.deck.pop());
  } else if (table.phase === 'flop') {
    table.phase = 'turn';
    table.board.push(table.deck.pop());
  } else if (table.phase === 'turn') {
    table.phase = 'river';
    table.board.push(table.deck.pop());
  } else if (table.phase === 'river') {
    table.phase = 'showdown';
    handleShowdown(table);
    return;
  }

  table.currentBet = 0;
  table.minRaise = table.tournamentId 
    ? TOURNAMENT_CONFIG.blindSchedule[table.blindLevel].bigBlind 
    : TABLE_CONFIG.bigBlind;
  
  table.players.forEach(player => { 
    if (player) {
      player.bet = 0;
      player.actedThisRound = false;
    }
  });
  
  table.activeSeat = findNextActive(table.dealerSeat, table);
  
  if (table.activeSeat === -1) {
    console.warn(`[advancePhase] Nenhum jogador ativo após dealer. Indo para showdown.`);
    handleShowdown(table);
    return;
  }
  
  markActivity(table.id);
  broadcastState(table);
  requestAction(table);
}

function updateRanking(table) {
  table.players.forEach(player => {
    if (player) {
      const rank = rankings.get(player.id) || { points: 0, hands: 0, tournaments: 0, wins: 0, tourneyWins: 0 };
      rank.hands += 1;
      if (table.tournamentId) rank.tournaments += 1;
      rankings.set(player.id, rank);
    }
  });
}

function getTopRanking(limit) {
  return Array.from(rankings.entries())
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, limit)
    .map(([id, record]) => ({ playerId: id, ...record }));
}

function getPlayerTableBySocket(socketId) {
  for (const table of tables.values()) {
    if (table.players.some(player => player?.socketId === socketId)) {
      return table;
    }
  }
  return null;
}

/** ================= Rate limiting ================= */
const rateCounters = new Map();
function allow(socket, maxPerWindow = 30, windowMs = 3000) {
  const now = Date.now();
  const record = rateCounters.get(socket.id) || { count: 0, timestamp: now };
  if (now - record.timestamp > windowMs) {
    record.count = 0;
    record.timestamp = now;
  }
  record.count += 1;
  rateCounters.set(socket.id, record);
  return record.count <= maxPerWindow;
}

/** ================= SOCKET.IO ================= */
io.on("connection", (socket) => {
  console.log("Novo jogador conectado:", socket.id);

  socket.on("linkWallet", ({ walletAddress }) => {
    if (!ethers.isAddress(walletAddress)) {
      return socket.emit("errorMsg", "Endereço de wallet inválido.");
    }
    const walletLower = walletAddress.toLowerCase();
    socketWallets.set(socket.id, walletLower);
    const maybeTable = getPlayerTableBySocket(socket.id);
    if (maybeTable) {
      if (isWalletAlreadySeated(maybeTable, walletLower)) {
        // reverte o set e avisa
        socketWallets.delete(socket.id);
        return socket.emit("errorMsg", "Esta wallet já está sentada nesta mesa. Use a mesma sessão/jogador.");
      }
    }
    const table = getPlayerTableBySocket(socket.id);
    if (table) {
      const seat = table.players.findIndex(player => player?.socketId === socket.id);
      if (seat >= 0) {
        playerWallets.set(table.players[seat].id, walletLower);
      }
    }
    socket.emit("systemMessage", "Wallet vinculada com sucesso!");
    console.log(`🔗 Wallet vinculada: ${socket.id} -> ${walletLower}`);
  });

  socket.on("helloRebind", ({ playerId }) => {
    for (const table of tables.values()) {
      const seat = table.players.findIndex(player => player && player.id === playerId);
      if (seat >= 0) {
        table.players[seat].socketId = socket.id;
        table.players[seat].connected = true;
        socket.join(table.id);
        broadcastState(table);
        socket.emit("systemMessage", "Reconectado à mesa com sucesso.");
        break;
      }
    }
  });

  socket.on("joinTable", async ({ tableIdText, name, buyin }) => {
    if (!allow(socket)) {
      return socket.emit("errorMsg", "Muitas requisições, aguarde um instante.");
    }
    if (!tableIdText) {
      return socket.emit("errorMsg", "tableIdText é obrigatório.");
    }
    name = (name || "").trim().slice(0, TABLE_CONFIG.maxNameLength) || "Anônimo";

    let table = tables.get(tableIdText);
    if (!table) {
      if (factoryContract) {
        try {
          const tableAddress = await factoryContract.getTable(tableIdText);
          if (tableAddress === ethers.ZeroAddress) {
            return socket.emit("errorMsg", "Mesa não encontrada no contrato.");
          }
          const maxSeats = TABLE_CONFIG.defaultSeats;
          table = createTable(tableIdText, maxSeats);
          table.contractAddress = tableAddress;
          tables.set(tableIdText, table);

          const tableContract = new ethers.Contract(tableAddress, TABLE_ABI, operatorWallet);
          tableContracts.set(tableIdText, tableContract);
          listenToTableEvents(tableContract, tableIdText);

          markActivity(tableIdText);
        } catch (error) {
          return socket.emit("errorMsg", "Erro ao buscar mesa no contrato.");
        }
      } else {
        return socket.emit("errorMsg", "Mesa não encontrada.");
      }
    }

    const seat = table.players.findIndex(player => !player);
    if (seat === -1) {
      return socket.emit("errorMsg", "Mesa cheia.");
    }

    if (TABLE_CONFIG.blockchainMode) {
      const wallet = socketWallets.get(socket.id);
      if (!wallet) {
        return socket.emit("errorMsg", "Vincule sua wallet primeiro para jogar no modo blockchain.");
      }

      const walletLower = wallet.toLowerCase();
      if (isWalletAlreadySeated(table, walletLower)) {
        return socket.emit("errorMsg", "Esta wallet já está sentada nesta mesa.");
      }

      buyin = 0;
    } else {
      if (typeof buyin !== "number" || buyin < TABLE_CONFIG.minBuyin || buyin > TABLE_CONFIG.maxBuyin) {
        return socket.emit("errorMsg", "Buy-in inválido.");
      }
    }

    const playerId = nanoid(10);
    const player = {
      id: playerId,
      name,
      stack: buyin,
      socketId: socket.id,
      connected: true,
      hole: [],
      bet: 0,
      folded: false,
      allIn: false,
      lastAction: null
    };

    table.players[seat] = player;
    socket.join(table.id);
    socket.emit("seated", { seat, playerId, tableId: tableIdText });

    const wallet = socketWallets.get(socket.id);
    if (wallet) {
      playerWallets.set(playerId, wallet);
      if (TABLE_CONFIG.blockchainMode && wallet) {
        try {
          const bal = await getPlayerTableBalance(tableIdText, wallet);
          player.stack = Number(bal);
          console.log(`[joinTable] Stack inicial de ${player.name} na mesa ${tableIdText} definido como ${player.stack} (on-chain)`);
        } catch (e) {
          console.warn(`⚠️ Falha ao ler saldo on-chain ao sentar:`, e?.message || e);
        }
      }
    }

    if (wallet && TABLE_CONFIG.blockchainMode) {
      const tableContract = tableContracts.get(tableIdText);
      if (tableContract) {
        try {
          const isActive = await tableContract.roundActive();
          if (!isActive) {
            await tableContract.seatPlayer(wallet);
            console.log(`✅ seatPlayer on-chain para ${wallet} em ${tableIdText}`);
          } else {
            const walletLower = wallet.toLowerCase();
            console.warn(`⚠️ Round ativo; colocando na fila de assento para ${walletLower}`);
            queueSeat(tableIdText, walletLower);
            // 🔔 avisa os clientes desta mesa que ela está "travada"
            io.to(tableIdText).emit("roundLocked", {
              tableId: tableIdText,
              pendingSeat: walletLower
            });
          }
        } catch (e) {
          console.warn(`⚠️ seatPlayer falhou para ${wallet}:`, e?.message || e);
        }
      }
    }

    io.to(table.id).emit("playerJoined", { name: player.name, seat });
    broadcastState(table);
    markActivity(table.id);

    if (table.players.filter(Boolean).length >= 2 && table.phase === "waiting") {
      setTimeout(() => startHand(table), TABLE_CONFIG.autoStartDelay);
    }
  });

  socket.on("playerAction", ({ tableId, action, amount }) => {
    if (!allow(socket, 50, 3000)) return;
    const table = tables.get(tableId);
    if (!table) return;

    const seat = table.players.findIndex(player => player?.socketId === socket.id);
    if (seat === -1) return;

    const sanitizedAmount = Number.isInteger(amount) && amount >= 0 ? amount : 0;
    playerAction(table, seat, action, sanitizedAmount);
  });

  socket.on("finalizeHand", ({ tableId }) => {
    const table = tables.get(tableId);
    if (!table) return socket.emit("errorMsg", "Mesa inválida.");
    if (!table.canFinalize) {
      return socket.emit("errorMsg", "Ainda não é possível finalizar a mão.");
    }
    table.canFinalize = false;
    broadcastState(table);
    finalizeHand(table);
  });

  socket.on("forceSettle", async ({ tableId }) => {
    try {
      if (!TABLE_CONFIG.blockchainMode) return socket.emit("errorMsg", "Blockchain não habilitada");
      const out = await forceSettleNow(tableId);
      socket.emit("systemMessage", out.msg || `Settlement forçado. ${out.tx ? "Tx: " + out.tx : ""}`);
    } catch (e) {
      socket.emit("errorMsg", e?.message || String(e));
    }
  });

  socket.on("sendMessage", ({ tableId, message }) => {
    const table = tables.get(tableId);
    if (!table) return;
    const seat = table.players.findIndex(player => player?.socketId === socket.id);
    if (seat === -1) return socket.emit("errorMsg", "Você não está na mesa.");

    const text = String(message || "").slice(0, TABLE_CONFIG.maxMessageLength);
    const player = table.players[seat];
    const timestamp = new Date().toISOString();
    io.to(table.id).emit("chatMessage", { playerId: player.id, name: player.name, seat, message: text, timestamp });
    // chat também conta como atividade (opcional):
    markActivity(table.id);
  });

  socket.on("leaveTable", ({ tableId }) => {
    if (!tableId || typeof tableId !== "string") return;
    const table = tables.get(tableId);
    if (!table) return;

    const seat = table.players.findIndex(p => p?.socketId === socket.id);
    if (seat >= 0) {
      unseatAndCleanup(table, seat, "leave");
    }
  });

  socket.on("getRanking", () => {
    socket.emit("ranking", getTopRanking(100));
  });

  socket.on("listTables", () => {
    const tableList = Array.from(tables.values())
      .filter(table => !table.tournamentId)
      .map(table => ({
        id: table.id,
        name: table.name || table.id,
        players: table.players.filter(Boolean).length,
        maxPlayers: table.players.length,
        phase: table.phase,
        isPublic: table.isPublic,
        blinds: table.customBlinds
          ? `${table.customBlinds.smallBlind}/${table.customBlinds.bigBlind}`
          : `${TABLE_CONFIG.smallBlind}/${TABLE_CONFIG.bigBlind}`
      }));
    socket.emit("tableList", tableList);
  });

  // === ADMIN: criar mesa off-chain ===
  socket.on("createTable", ({ name, seats, smallBlind, bigBlind }) => {
    if (!isAdmin(socket.id)) {
      return socket.emit("errorMsg", "Apenas administradores podem criar mesas.");
    }
    if (TABLE_CONFIG.blockchainMode) {
      return socket.emit("errorMsg", "No modo on-chain, mesas sao criadas via contrato.");
    }

    const tableSeats = Math.min(Math.max(Number(seats) || 6, 2), 10);
    const sb = Math.max(Number(smallBlind) || TABLE_CONFIG.smallBlind, 1);
    const bb = Math.max(Number(bigBlind) || TABLE_CONFIG.bigBlind, sb * 2);
    const tableName = (name || "").trim().slice(0, 30) || `Mesa ${tables.size + 1}`;
    const tableId = `offchain-${nanoid(8)}`;

    const table = createTable(tableId, tableSeats);
    table.name = tableName;
    table.customBlinds = { smallBlind: sb, bigBlind: bb };
    table.isPublic = true;
    tables.set(tableId, table);
    markActivity(tableId);

    console.log(`🃏 Mesa criada por admin: ${tableName} (${tableId}) — ${tableSeats} assentos, blinds ${sb}/${bb}`);

    // Notificar todos os clientes
    const tableInfo = {
      id: tableId,
      name: tableName,
      players: 0,
      maxPlayers: tableSeats,
      phase: "waiting",
      isPublic: true,
      blinds: `${sb}/${bb}`
    };
    io.emit("newTable", tableInfo);
    socket.emit("tableCreated", tableInfo);
    socket.emit("systemMessage", `Mesa "${tableName}" criada com sucesso!`);
  });

  // === ADMIN: deletar mesa off-chain ===
  socket.on("deleteTable", ({ tableId }) => {
    if (!isAdmin(socket.id)) {
      return socket.emit("errorMsg", "Apenas administradores podem deletar mesas.");
    }
    const table = tables.get(tableId);
    if (!table) {
      return socket.emit("errorMsg", "Mesa nao encontrada.");
    }
    const activePlayers = table.players.filter(Boolean).length;
    if (activePlayers > 0) {
      return socket.emit("errorMsg", `Mesa tem ${activePlayers} jogador(es). Aguarde saida.`);
    }
    tables.delete(tableId);
    tableLocks.delete(tableId);
    io.emit("tableRemoved", { tableId });
    socket.emit("systemMessage", `Mesa "${table.name || tableId}" removida.`);
    console.log(`🗑️ Mesa removida por admin: ${table.name || tableId} (${tableId})`);
  });

  socket.on("disconnect", () => {
    for (const table of tables.values()) {
      const seat = table.players.findIndex(p => p?.socketId === socket.id);
      if (seat >= 0) {
        unseatAndCleanup(table, seat, "disconnect");
      }
    }
    socketWallets.delete(socket.id);
  });
});

/** ================= TOURNAMENTS ================= */
function createTournament({ name, buyIn = TOURNAMENT_CONFIG.buyIn }) {
  const id = nanoid(8);
  tournaments.set(id, { id, name, buyIn, players: [], status: 'open', prizePool: 0 });
  broadcastTournaments();
  return id;
}

function joinTournament(tournamentId, playerId, buyIn) {
  const tournament = tournaments.get(tournamentId);
  if (!tournament || tournament.status !== 'open') return false;
  tournament.players.push(playerId);
  tournament.prizePool += buyIn;
  if (tournament.players.length >= 2) startTournament(tournament);
  broadcastTournaments();
  return true;
}

function startTournament(tournament) {
  tournament.status = 'running';
  const tableId = `t-${tournament.id}`;
  const table = createTable(tableId, tournament.players.length);
  tables.set(tableId, table);
  table.nextBlindTime = Date.now() + TOURNAMENT_CONFIG.blindSchedule[0].duration;
  startHand(table);
}

function endTournament(id, winnerId) {
  const tournament = tournaments.get(id);
  tournament.status = 'finished';
  tournament.winner = winnerId;
  broadcastTournaments();
}

function listTournaments() {
  return Array.from(tournaments.values()).map(t => ({
    id: t.id, name: t.name, buyIn: t.buyIn, players: t.players.length, status: t.status, prizePool: t.prizePool
  }));
}

function broadcastTournaments() {
  io.emit('tournamentUpdate', listTournaments());
}

/** ================= REST API ================= */
app.get("/api/ranking", (req, res) => {
  res.json({ ranking: getTopRanking(100) });
});

app.get("/api/status", (req, res) => {
  const status = Array.from(tables.values()).map(table => ({
    id: table.id,
    tournamentId: table.tournamentId,
    players: table.players.filter(Boolean).length,
    phase: table.phase,
    pots: table.pots.map(pot => pot.amount)
  }));
  res.json({
    status: "online",
    tables: status,
    totalPlayers: status.reduce((sum, table) => sum + table.players, 0),
    totalRankedPlayers: rankings.size,
    blockchainEnabled: TABLE_CONFIG.blockchainMode
  });
});

app.get("/api/tables", (req, res) => {
  const tableList = Array.from(tables.values())
    .filter(table => !table.tournamentId)
    .map(table => ({
      id: table.id,
      address: table.contractAddress,
      players: table.players.filter(Boolean).length,
      maxPlayers: table.players.length,
      phase: table.phase,
      pot: table.pots.reduce((sum, pot) => sum + pot.amount, 0),
      isPublic: table.isPublic
    }));
  res.json({ tables: tableList });
});

app.get("/api/tournaments", (req, res) => {
  res.json(listTournaments());
});

app.get("/api/blockchain/status", (req, res) => {
  res.json({
    enabled: TABLE_CONFIG.blockchainMode,
    network: "bscTestnet",
    chainId: BLOCKCHAIN_CONFIG.chainId,
    contracts: BLOCKCHAIN_CONFIG.contracts,
    operatorAddress: operatorWallet?.address || null
  });
});

app.get("/api/blockchain/balance/:address", async (req, res) => {
  if (!TABLE_CONFIG.blockchainMode) {
    return res.status(400).json({ error: "Blockchain não habilitada" });
  }
  const { address } = req.params;
  try {
    const chipsBalance = await getChipsBalance(address);
    res.json({ address, chipsBalance, contracts: BLOCKCHAIN_CONFIG.contracts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/factory/:tableIdText", async (req, res) => {
  try {
    if (!factoryContract) {
      return res.status(400).json({ error: "Factory não configurada" });
    }
    const tableAddress = await factoryContract.getTable(req.params.tableIdText);
    res.json({ tableIdText: req.params.tableIdText, table: tableAddress });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/force-settle/:tableIdText", async (req, res) => {
  try {
    if (!TABLE_CONFIG.blockchainMode) {
      return res.status(400).json({ error: "Blockchain não habilitada" });
    }
    const out = await forceSettleNow(req.params.tableIdText);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// util: monta settlement a partir de stacks inicial/final
function computeEip712FromTable(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) throw new Error("Mesa inválida");

  const players = [];
  const deltas = [];

  for (const p of table.players) {
    if (!p || typeof p.initialStack !== "number") continue;
    const wallet = playerWallets.get(p.id);
    if (!wallet) continue;
    const deltaNum = (p.stack ?? 0) - (p.initialStack ?? 0);
    players.push(wallet);
    deltas.push(ethers.parseEther(deltaNum.toString()));
  }

  if (players.length === 0) throw new Error("Sem jogadores para assinar.");

  // corrige soma ≠ 0 no último delta
  const sum = deltas.reduce((a, b) => a + b, 0n);
  if (sum !== 0n) deltas[deltas.length - 1] -= sum;

  return { players, deltas };
}

/**
 * 1) FRONT pede assinatura EIP-712 ao servidor
 *    POST /api/tables/:tableId/settlement/sign
 *    retorno: { tableId, contract, players, deltas, nonce, deadline, signature }
 */
app.post("/api/tables/:tableId/settlement/sign", async (req, res) => {
  try {
    if (!TABLE_CONFIG.blockchainMode) {
      return res.status(400).json({ error: "Blockchain não habilitada" });
    }
    const tableIdText = req.params.tableId;
    const { players, deltas } = computeEip712FromTable(tableIdText);
    const payload = await signSettlement(tableIdText, players, deltas);

    // SANITIZAÇÃO para JSON
    return res.json({
      tableId:  payload.tableId,
      contract: payload.contract,
      players:  payload.players,
      deltas:   payload.deltas.map(d => d.toString()),
      nonce:    payload.nonce.toString(),
      deadline: payload.deadline,
      signature: payload.signature
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});


/**
 * 2) FRONT envia a assinatura para liquidar via settleNetBySig
 *    POST /api/tables/:tableId/settlement/submit
 *    body: { players, deltas, nonce, deadline, signature }
 */
app.post("/api/tables/:tableId/settlement/submit", async (req, res) => {
  try {
    if (!TABLE_CONFIG.blockchainMode) {
      return res.status(400).json({ error: "Blockchain não habilitada" });
    }
    const tableIdText = req.params.tableId;
    const contract = tableContracts.get(tableIdText);
    if (!contract) return res.status(400).json({ error: "Contrato não encontrado" });

    const { players, deltas, nonce, deadline, signature } = req.body || {};
    if (!players || !deltas || !nonce || !deadline || !signature) {
      return res.status(400).json({ error: "Payload incompleto" });
    }

    // deltas podem vir como strings -> garanta string
    const deltasStr = deltas.map(d => d.toString());

    const tx = await contract.settleNetBySig(players, deltasStr, nonce, deadline, signature);
    const rc = await tx.wait();

    // atualiza stacks antes de liberar a próxima mão
    try { await refreshStacksFromChain(tableIdText); } catch (_) {}
    io.to(tableIdText).emit("blockchainRoundSettled");
    const table = tables.get(tableIdText);
    if (table) setTimeout(() => startHand(table), 3000);

    return res.json({ ok: true, tx: rc.hash });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/force-settle-zero/:tableIdText", async (req, res) => {
  try {
    if (!TABLE_CONFIG.blockchainMode) {
      return res.status(400).json({ error: "Blockchain não habilitada" });
    }
    const out = await forceSettleZeroDeltas(req.params.tableIdText);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Endpoint para sentar manualmente (com fila se round ativo)
app.post("/api/seat/:tableId/:wallet", async (req, res) => {
  try {
    const { tableId, wallet } = req.params;
    const c = tableContracts.get(tableId);
    if (!c) return res.status(400).json({ error: "Contrato da mesa não encontrado" });
    if (!ethers.isAddress(wallet)) return res.status(400).json({ error: "Wallet inválida" });

    const active = await c.roundActive();
    if (active) {
      queueSeat(tableId, wallet.toLowerCase());
      return res.json({ queued: true });
    }
    const tx = await c.seatPlayer(wallet);
    await tx.wait();
    res.json({ queued: false });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/** ================= START ================= */
const PORT = process.env.PORT || 3012;
server.listen(PORT, () => {
  console.log(`\n🎰 Poker Server Híbrido em http://localhost:${PORT}`);
  console.log(`⛓️ Blockchain: ${blockchainEnabled ? '✅ Habilitada' : '❌ Desabilitada'}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);
  console.log(`🔗 Blockchain Status: http://localhost:${PORT}/api/blockchain/status`);
  console.log(`🏆 Ranking: http://localhost:${PORT}/api/ranking`);
  console.log(`🔗 Mesas: http://localhost:${PORT}/api/tables`);
  console.log(`🏅 Torneios: http://localhost:${PORT}/api/tournaments`);
});
