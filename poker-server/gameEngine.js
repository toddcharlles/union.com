// gameEngine.js — Motor do jogo (mesa, maos, acoes, showdown, pots)
import PokerEvaluator from "poker-evaluator";
import { TOURNAMENT_CONFIG } from './config.js';
import {
  tables, tableContracts, playerWallets, actionTimeouts
} from './state.js';
import {
  enqueueTableJob, markActivity, convertCardToEvaluatorFormat,
  updateRanking, cleanupTable, scheduleIdleCheck
} from './helpers.js';
import {
  startOnChainRound, signSettlement, getSettlementNonce,
  refreshStacksFromChain
} from './blockchain.js';

const pokerEvaluator = PokerEvaluator;
const getHandRank = (cards) => pokerEvaluator.evalHand(cards);

// io e TABLE_CONFIG injetados do server.js
let io = null;
let TABLE_CONFIG = null;
let _endTournamentFn = null;

export function injectGameDeps({ ioServer, tableConfig, endTournament }) {
  io = ioServer;
  TABLE_CONFIG = tableConfig;
  _endTournamentFn = endTournament;
}

// ====== Table creation ======
export function createTable(id, seats) {
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
    minRaise: TABLE_CONFIG?.bigBlind || 100,
    tournamentId: id.startsWith('t-') ? id.slice(2) : null,
    blindLevel: 0,
    nextBlindTime: 0,
    lastAggressor: -1,
    actionsThisRound: 0,
    canFinalize: false,
    pendingWinners: null
  };
}

// ====== Broadcast state ======
export function broadcastState(table) {
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

// ====== Deck ======
function shuffleDeck() {
  const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
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

// ====== Player navigation ======
function findNextActive(current, table) {
  const startSeat = current;
  let next = (current + 1) % table.players.length;
  let iterations = 0;
  const maxIterations = table.players.length;

  while (iterations < maxIterations) {
    const player = table.players[next];
    if (player && player.stack > 0 && !player.folded && player.connected && !player.allIn) {
      return next;
    }
    next = (next + 1) % table.players.length;
    iterations++;
    if (next === startSeat) return -1;
  }
  return -1;
}

// ====== Betting ======
function forceBet(table, seat, amount) {
  const player = table.players[seat];
  const bet = Math.min(amount, player.stack);
  player.stack -= bet;
  player.bet += bet;
  table.pots[0].amount += bet;
  if (player.stack === 0) player.allIn = true;
}

// ====== Start Hand ======
export function startHand(table) {
  enqueueTableJob(table.id, async () => {
    if (TABLE_CONFIG.blockchainMode) {
      const tc = tableContracts.get(table.id);
      if (tc) {
        try {
          const isActive = await tc.roundActive();
          if (isActive) {
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

    const activePlayers = table.players.filter(p => p && p.stack > 0 && p.connected);
    if (activePlayers.length < 2) {
      table.phase = 'waiting';
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
      const tc = tableContracts.get(table.id);
      if (tc) {
        try {
          const isActive = await tc.roundActive();
          if (!isActive) await startOnChainRound(table.id);
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

// ====== Action request ======
function requestAction(table) {
  const seat = table.activeSeat;
  const player = table.players[seat];

  if (!player || player.folded || player.allIn || player.stack <= 0) {
    return nextAction(table);
  }

  const existing = actionTimeouts.get(table.id);
  if (existing) { clearTimeout(existing); actionTimeouts.delete(table.id); }

  const toCall = table.currentBet - player.bet;
  const maxRaise = Math.max(0, player.stack - toCall);

  io.to(player.socketId).emit('hole', { cards: player.hole });
  io.to(player.socketId).emit('actionRequest', { toCall, minRaise: table.minRaise, maxRaise });

  const timeoutId = setTimeout(() => {
    if (table.activeSeat === seat && table.phase !== 'showdown') {
      playerAction(table, seat, 'fold');
    }
    actionTimeouts.delete(table.id);
  }, TABLE_CONFIG.actionTimeout);

  actionTimeouts.set(table.id, timeoutId);
}

// ====== Next action ======
function nextAction(table) {
  const existing = actionTimeouts.get(table.id);
  if (existing) clearTimeout(existing);
  actionTimeouts.delete(table.id);

  const activePlayers = table.players.filter(p => p && !p.folded && p.stack > 0 && p.connected);
  if (activePlayers.length <= 1) { advancePhase(table); return; }

  const canAct = activePlayers.filter(p => !p.allIn);
  if (canAct.length === 0) { advancePhase(table); return; }

  const allActed = canAct.every(p => p.actedThisRound);
  const allEqualized = canAct.every(p => p.bet === table.currentBet);

  if (allActed && allEqualized) { advancePhase(table); return; }

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

  advancePhase(table);
}

// ====== Player action ======
export function playerAction(table, seat, action, amount = 0) {
  enqueueTableJob(table.id, async () => {
    const player = table.players[seat];
    if (table.activeSeat !== seat || !player) return;

    const existing = actionTimeouts.get(table.id);
    if (existing) { clearTimeout(existing); actionTimeouts.delete(table.id); }

    const toCall = table.currentBet - player.bet;
    let valid = false;

    switch (action) {
      case 'fold':
        player.folded = true;
        player.lastAction = 'fold';
        player.actedThisRound = true;
        table.actionsThisRound++;
        valid = true;
        break;

      case 'check':
        if (toCall === 0) {
          player.lastAction = 'check';
          player.actedThisRound = true;
          table.actionsThisRound++;
          valid = true;
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
        }
        break;

      case 'raise': {
        const raiseCap = Math.max(0, player.stack - toCall);
        const requested = Math.max(0, Number(amount) || 0);
        const raiseAmount = Math.min(requested, raiseCap);

        if (raiseAmount === 0) {
          playerAction(table, seat, 'call', 0);
          return;
        }

        const willBeAllIn = (toCall + raiseAmount) === player.stack;
        const meetsMin = raiseAmount >= table.minRaise;
        if (!meetsMin && !willBeAllIn) break;

        const totalBet = toCall + raiseAmount;
        if (player.stack < totalBet) break;

        player.stack -= totalBet;
        player.bet += totalBet;
        table.pots[table.pots.length - 1].amount += totalBet;
        table.currentBet = Math.max(table.currentBet, player.bet);

        if (willBeAllIn) {
          player.allIn = true;
          player.lastAction = 'all-in (raise)';
          if (meetsMin) {
            table.minRaise = raiseAmount;
            table.lastAggressor = seat;
            table.players.forEach((p, idx) => { if (p) p.actedThisRound = (idx === seat); });
            table.actionsThisRound = 1;
          } else {
            player.actedThisRound = true;
            table.actionsThisRound++;
          }
        } else {
          table.minRaise = raiseAmount;
          table.lastAggressor = seat;
          table.players.forEach((p, idx) => { if (p) p.actedThisRound = (idx === seat); });
          table.actionsThisRound = 1;
          player.actedThisRound = true;
          player.lastAction = `raise ${raiseAmount}`;
        }
        valid = true;
        break;
      }

      case 'all-in': {
        const stackBefore = player.stack;
        if (stackBefore <= 0) break;

        const callAmt = Math.min(toCall, player.stack);
        player.stack -= callAmt;
        player.bet += callAmt;
        table.pots[table.pots.length - 1].amount += callAmt;

        const raisePart = player.stack;
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
            player.actedThisRound = true;
            table.actionsThisRound++;
          }
          player.allIn = true;
          player.lastAction = 'all-in';
        } else {
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
        break;
      }
    }

    if (valid) {
      broadcastState(table);
      markActivity(table.id);
      setTimeout(() => nextAction(table), 100);
    }
  });
}

// ====== Side pots ======
function createSidePots(table) {
  const runningPot = table.pots.reduce((s, p) => s + p.amount, 0);
  const bets = table.players.map(p => (p ? p.bet : 0));
  const sumBets = bets.reduce((a, b) => a + b, 0);
  const carried = Math.max(0, runningPot - sumBets);
  const levels = [...new Set(bets.filter(b => b > 0))].sort((a, b) => a - b);

  const newPots = [];
  let prev = 0;
  for (const lvl of levels) {
    const eligibleIdx = table.players
      .map((p, idx) => (p && p.bet >= lvl ? idx : -1))
      .filter(idx => idx >= 0);
    const count = eligibleIdx.length;
    const amount = (lvl - prev) * count;
    newPots.push({ amount, eligible: eligibleIdx });
    prev = lvl;
  }

  if (newPots.length === 0) {
    table.pots = [{ amount: carried, eligible: [] }];
  } else {
    newPots[0].amount += carried;
    table.pots = newPots;
  }

  table.players.forEach(p => { if (p) p.bet = 0; });
}

// ====== Showdown ======
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
      seat: table.players.indexOf(p), name: p.name, cards: p.hole, handName: "\u2014"
    }));
    const reason = `${winner.name} venceu porque todos os demais foldaram.`;
    table.canFinalize = true;
    table.pendingWinners = winners;
    io.to(table.id).emit('handEnded', { winners, allHands, reason, board: table.board });
    markActivity(table.id);
    broadcastState(table);
    return;
  }

  const boardCards = table.board.map(convertCardToEvaluatorFormat).filter(Boolean);
  const playerHands = activePlayers.map(player => {
    const holeCards = player.hole.map(convertCardToEvaluatorFormat).filter(Boolean);
    const fullHand = [...holeCards, ...boardCards];
    const rank = getHandRank(fullHand);
    return { player, seat: table.players.indexOf(player), name: player.name, rankValue: rank.value, description: rank.handName };
  });

  playerHands.sort((a, b) => b.rankValue - a.rankValue);
  const bestRank = playerHands[0].rankValue;
  const winners = playerHands.filter(ph => ph.rankValue === bestRank);

  const resolvedWinners = [];
  for (const pot of table.pots) {
    if (pot.amount <= 0) continue;
    const eligible = playerHands.filter(ph => pot.eligible.length === 0 || pot.eligible.includes(ph.seat));
    if (eligible.length === 0) {
      activePlayers[0].stack += pot.amount;
      continue;
    }
    const bestInPot = Math.max(...eligible.map(p => p.rankValue));
    const potWinners = eligible.filter(p => p.rankValue === bestInPot);
    const baseShare = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - baseShare * potWinners.length;
    potWinners.forEach((w, idx) => {
      const add = baseShare + (idx < remainder ? 1 : 0);
      w.player.stack += add;
      resolvedWinners.push({ seat: w.seat, name: w.name, potAmount: add, hand: w.description });
    });
  }

  const allHands = playerHands.map(ph => ({
    seat: ph.seat, name: ph.name, cards: table.players[ph.seat].hole, handName: ph.description
  }));

  let reason;
  if (winners.length === 1) {
    const w = winners[0];
    const others = playerHands.filter(x => x.rankValue !== bestRank);
    reason = others.length
      ? `${w.name} venceu com ${w.description}. O melhor oponente tinha ${others[0].description}.`
      : `${w.name} venceu com ${w.description}.`;
  } else {
    reason = `Empate entre ${winners.map(w => w.name).join(" e ")} com ${winners[0].description}.`;
  }

  const finalMap = new Map();
  resolvedWinners.forEach(w => {
    if (!finalMap.has(w.seat)) finalMap.set(w.seat, { ...w, potAmount: 0 });
    finalMap.get(w.seat).potAmount += w.potAmount;
  });

  const finalWinners = Array.from(finalMap.values());
  table.canFinalize = true;
  table.pendingWinners = finalWinners;
  io.to(table.id).emit('handEnded', { winners: finalWinners, allHands, reason, board: table.board });
  markActivity(table.id);
  broadcastState(table);
}

// ====== Finalize hand ======
export async function finalizeHand(table) {
  const { ethers } = await import("ethers");
  updateRanking(table);

  if (TABLE_CONFIG.blockchainMode) {
    enqueueTableJob(table.id, async () => {
      const settlements = [];
      let totalDelta = 0n;
      const playersInHand = table.players.filter(p => p && !p.eliminated && p.initialStack !== undefined);

      for (const player of playersInHand) {
        const wallet = playerWallets.get(player.id);
        if (!wallet) continue;
        const deltaNum = (player.stack ?? 0) - (player.initialStack ?? 0);
        const deltaWei = ethers.parseEther(deltaNum.toString());
        settlements.push({ address: wallet, delta: deltaWei });
        totalDelta += deltaWei;
      }

      if (totalDelta !== 0n && settlements.length > 0) {
        settlements[settlements.length - 1].delta -= totalDelta;
      }

      if (settlements.length === 0) {
        setTimeout(() => startHand(table), 3000);
        return;
      }

      const addresses = settlements.map(s => s.address);
      const deltas = settlements.map(s => s.delta);

      try {
        const contract = tableContracts.get(table.id);
        if (!contract) throw new Error('Contrato da mesa nao encontrado');

        const nonce = await getSettlementNonce(contract);
        const payload = await signSettlement(table.id, addresses, deltas, nonce);

        const wirePayload = {
          tableId: payload.tableId, contract: payload.contract, players: payload.players,
          deltas: payload.deltas.map(d => d.toString()), nonce: payload.nonce.toString(),
          deadline: payload.deadline, signature: payload.signature
        };
        io.to(table.id).emit('settlementData', wirePayload);

        const tx = await contract.settleNetBySig(
          payload.players, payload.deltas.map(d => d.toString()),
          payload.nonce, payload.deadline, payload.signature, { gasLimit: 500000 }
        );
        const rc = await tx.wait();
        console.log(`\u2705 Settlement concluido em ${table.id}: ${rc.hash}`);

        try { await refreshStacksFromChain(table.id); } catch (_) {}
        io.to(table.id).emit('blockchainRoundSettled');
        markActivity(table.id);
        setTimeout(() => startHand(table), 3000);
      } catch (error) {
        console.error(`[finalizeHand] Erro ao liquidar on-chain:`, error?.message || error);
        io.to(table.id).emit('errorMsg', 'Erro ao liquidar on-chain: ' + (error?.message || String(error)));
      }
    });
  } else {
    setTimeout(() => startHand(table), 3000);
  }

  if (table.tournamentId) {
    table.players.forEach(p => { if (p && p.stack <= 0) p.eliminated = true; });
    const remaining = table.players.filter(p => p && !p.eliminated);
    if (remaining.length === 1) _endTournamentFn(table.tournamentId, remaining[0].id);
  }
}

// ====== Advance phase ======
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

  table.players.forEach(p => { if (p) { p.bet = 0; p.actedThisRound = false; } });
  table.activeSeat = findNextActive(table.dealerSeat, table);

  if (table.activeSeat === -1) {
    handleShowdown(table);
    return;
  }

  markActivity(table.id);
  broadcastState(table);
  requestAction(table);
}

// ====== Unseat and cleanup ======
export function unseatAndCleanup(table, seat, reason = "left") {
  const player = table.players[seat];
  if (!player) return;

  const isHisTurn = table.activeSeat === seat && table.phase !== "showdown";
  if (isHisTurn) {
    player.folded = true;
    player.actedThisRound = true;
    player.lastAction = "auto-fold (disconnect)";
  }

  const walletLower = playerWallets.get(player.id);
  table.players[seat] = null;

  io.to(table.id).emit("playerLeft", { seat, reason });
  broadcastState(table);

  if (walletLower) {
    import('./blockchain.js').then(({ tryUnseatOnChain }) => {
      tryUnseatOnChain(table.id, walletLower, TABLE_CONFIG);
    });
  }

  if (isHisTurn) {
    setTimeout(() => nextAction(table), 50);
  }

  markActivity(table.id);
}
