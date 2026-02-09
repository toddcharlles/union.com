// tournaments.js — Sistema de torneios
import { nanoid } from "nanoid";
import { TOURNAMENT_CONFIG } from './config.js';
import { tables, tournaments } from './state.js';
import { createTable, startHand } from './gameEngine.js';

let io = null;

export function injectTournamentDeps({ ioServer }) {
  io = ioServer;
}

export function createTournament({ name, buyIn = TOURNAMENT_CONFIG.buyIn }) {
  const id = nanoid(8);
  tournaments.set(id, { id, name, buyIn, players: [], status: 'open', prizePool: 0 });
  broadcastTournaments();
  return id;
}

export function joinTournament(tournamentId, playerId, buyIn) {
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

export function endTournament(id, winnerId) {
  const tournament = tournaments.get(id);
  if (!tournament) return;
  tournament.status = 'finished';
  tournament.winner = winnerId;
  broadcastTournaments();
}

export function listTournaments() {
  return Array.from(tournaments.values()).map(t => ({
    id: t.id, name: t.name, buyIn: t.buyIn,
    players: t.players.length, status: t.status, prizePool: t.prizePool
  }));
}

function broadcastTournaments() {
  if (io) io.emit('tournamentUpdate', listTournaments());
}
