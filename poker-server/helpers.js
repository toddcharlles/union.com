// helpers.js — Funcoes utilitarias (ranking, rate limit, mutex, card conversion, admin check)
import { SUIT_MAP, ADMIN_WALLETS, INACTIVITY_MS } from './config.js';
import {
  tables, tableLocks, pendingSeats, lastActivity, idleTimers,
  rankings, rateCounters, socketWallets, playerWallets, tableContracts,
  actionTimeouts
} from './state.js';

// ====== Mutex por mesa ======
export function enqueueTableJob(tableIdText, job) {
  const tail = tableLocks.get(tableIdText) || Promise.resolve();
  const next = tail.then(job).catch((error) => {
    console.error(`[LOCK ${tableIdText}] Erro:`, error?.message || error);
  });
  tableLocks.set(tableIdText, next);
  return next;
}

// ====== Admin check ======
export function isAdmin(socketId) {
  const wallet = socketWallets.get(socketId);
  return wallet && ADMIN_WALLETS.has(wallet.toLowerCase());
}

// ====== Fila de assentos pendentes ======
export function queueSeat(tableIdText, walletLower) {
  const set = pendingSeats.get(tableIdText) || new Set();
  set.add(walletLower);
  pendingSeats.set(tableIdText, set);
}

export async function processPendingSeats(tableIdText) {
  const contract = tableContracts.get(tableIdText);
  if (!contract) return;

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
        console.log(`\u2705 seat pos-settlement: ${w} em ${tableIdText}`);
      } catch (e) {
        console.warn(`\u26a0\ufe0f seat pos-settlement falhou (${w}):`, e?.message || e);
      }
    }
    if (!set.size) pendingSeats.delete(tableIdText);
  });
}

// ====== Inatividade/Watchdog ======
// forceSettleNow e injetado para evitar dependencia circular
let _forceSettleNow = null;
let _TABLE_CONFIG = null;

export function injectDeps({ forceSettleNow, TABLE_CONFIG }) {
  _forceSettleNow = forceSettleNow;
  _TABLE_CONFIG = TABLE_CONFIG;
}

export function scheduleIdleCheck(tableIdText) {
  const prev = idleTimers.get(tableIdText);
  if (prev) clearTimeout(prev);
  const handle = setTimeout(() => maybeForceSettleIfIdle(tableIdText), INACTIVITY_MS + 250);
  idleTimers.set(tableIdText, handle);
}

export function markActivity(tableOrId) {
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

  if (!_TABLE_CONFIG?.blockchainMode) return;
  const contract = tableContracts.get(tableIdText);
  if (!contract) return;

  let active = false;
  try { active = await contract.roundActive(); } catch { return; }
  if (!active) return;

  console.log(`\u23f1\ufe0f Mesa ${tableIdText} ociosa por ${Math.round(idleFor/1000)}s. Forcando settlement...`);
  try {
    await _forceSettleNow(tableIdText);
  } catch (e) {
    console.warn(`[idle-settle] falhou para ${tableIdText}:`, e?.message || e);
  } finally {
    markActivity(tableIdText);
  }
}

// ====== Wallet / Seat helpers ======
export function isWalletAlreadySeated(table, walletLower) {
  if (!walletLower) return false;
  for (const p of table.players) {
    if (!p) continue;
    const w = playerWallets.get(p.id);
    if (w && w.toLowerCase() === walletLower) return true;
  }
  return false;
}

export function getPlayerTableBySocket(socketId) {
  for (const table of tables.values()) {
    if (table.players.some(player => player?.socketId === socketId)) {
      return table;
    }
  }
  return null;
}

// ====== Rate limiting ======
export function allow(socket, maxPerWindow = 30, windowMs = 3000) {
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

// ====== Card conversion ======
export function convertCardToEvaluatorFormat(card) {
  if (!card || !card.r || !card.s) return null;
  const rank = card.r;
  const suit = SUIT_MAP[card.s];
  if (!suit) return null;
  return rank + suit;
}

// ====== Ranking ======
export function updateRanking(table) {
  table.players.forEach(player => {
    if (player) {
      const rank = rankings.get(player.id) || { points: 0, hands: 0, tournaments: 0, wins: 0, tourneyWins: 0 };
      rank.hands += 1;
      if (table.tournamentId) rank.tournaments += 1;
      rankings.set(player.id, rank);
    }
  });
}

export function getTopRanking(limit) {
  return Array.from(rankings.entries())
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, limit)
    .map(([id, record]) => ({ playerId: id, ...record }));
}

// ====== Table cleanup ======
export function cleanupTable(tableId) {
  const timeout = actionTimeouts.get(tableId);
  if (timeout) {
    clearTimeout(timeout);
    actionTimeouts.delete(tableId);
  }
}
