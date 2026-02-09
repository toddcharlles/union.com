// apiRoutes.js — Todas as rotas REST
import { ethers } from "ethers";
import { BLOCKCHAIN_CONFIG } from './config.js';
import { tables, tableContracts, rankings, blockchain } from './state.js';
import { getTopRanking, markActivity } from './helpers.js';
import { listTournaments } from './tournaments.js';
import { createTable, startHand, broadcastState } from './gameEngine.js';
import {
  getChipsBalance, getPlayerTableBalance, signSettlement,
  computeEip712FromTable, forceSettleNow, forceSettleZeroDeltas,
  refreshStacksFromChain
} from './blockchain.js';
import { queueSeat } from './helpers.js';

let TABLE_CONFIG = null;
let io = null;

export function injectApiDeps({ tableConfig, ioServer }) {
  TABLE_CONFIG = tableConfig;
  io = ioServer;
}

export function registerApiRoutes(app) {
  app.get("/api/ranking", (req, res) => {
    res.json({ ranking: getTopRanking(100) });
  });

  app.get("/api/status", (req, res) => {
    const status = Array.from(tables.values()).map(t => ({
      id: t.id, tournamentId: t.tournamentId,
      players: t.players.filter(Boolean).length,
      phase: t.phase, pots: t.pots.map(p => p.amount)
    }));
    res.json({
      status: "online",
      tables: status,
      totalPlayers: status.reduce((sum, t) => sum + t.players, 0),
      totalRankedPlayers: rankings.size,
      blockchainEnabled: TABLE_CONFIG.blockchainMode
    });
  });

  app.get("/api/tables", (req, res) => {
    const tableList = Array.from(tables.values())
      .filter(t => !t.tournamentId)
      .map(t => ({
        id: t.id, address: t.contractAddress,
        players: t.players.filter(Boolean).length,
        maxPlayers: t.players.length,
        phase: t.phase,
        pot: t.pots.reduce((sum, p) => sum + p.amount, 0),
        isPublic: t.isPublic
      }));
    res.json({ tables: tableList });
  });

  app.get("/api/tournaments", (req, res) => {
    res.json(listTournaments());
  });

  app.get("/api/blockchain/status", (req, res) => {
    res.json({
      enabled: TABLE_CONFIG.blockchainMode,
      network: "bscMainnet",
      chainId: BLOCKCHAIN_CONFIG.chainId,
      contracts: BLOCKCHAIN_CONFIG.contracts,
      operatorAddress: blockchain.operatorWallet?.address || null
    });
  });

  app.get("/api/blockchain/balance/:address", async (req, res) => {
    if (!TABLE_CONFIG.blockchainMode) return res.status(400).json({ error: "Blockchain nao habilitada" });
    try {
      const chipsBalance = await getChipsBalance(req.params.address);
      res.json({ address: req.params.address, chipsBalance, contracts: BLOCKCHAIN_CONFIG.contracts });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/factory/:tableIdText", async (req, res) => {
    try {
      if (!blockchain.factoryContract) return res.status(400).json({ error: "Factory nao configurada" });
      const tableAddress = await blockchain.factoryContract.getTable(req.params.tableIdText);
      res.json({ tableIdText: req.params.tableIdText, table: tableAddress });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/force-settle/:tableIdText", async (req, res) => {
    try {
      if (!TABLE_CONFIG.blockchainMode) return res.status(400).json({ error: "Blockchain nao habilitada" });
      const out = await forceSettleNow(req.params.tableIdText);
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.post("/api/tables/:tableId/settlement/sign", async (req, res) => {
    try {
      if (!TABLE_CONFIG.blockchainMode) return res.status(400).json({ error: "Blockchain nao habilitada" });
      const { players, deltas } = computeEip712FromTable(req.params.tableId);
      const payload = await signSettlement(req.params.tableId, players, deltas);
      return res.json({
        tableId: payload.tableId, contract: payload.contract, players: payload.players,
        deltas: payload.deltas.map(d => d.toString()), nonce: payload.nonce.toString(),
        deadline: payload.deadline, signature: payload.signature
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.post("/api/tables/:tableId/settlement/submit", async (req, res) => {
    try {
      if (!TABLE_CONFIG.blockchainMode) return res.status(400).json({ error: "Blockchain nao habilitada" });
      const tableIdText = req.params.tableId;
      const contract = tableContracts.get(tableIdText);
      if (!contract) return res.status(400).json({ error: "Contrato nao encontrado" });

      const { players, deltas, nonce, deadline, signature } = req.body || {};
      if (!players || !deltas || !nonce || !deadline || !signature) {
        return res.status(400).json({ error: "Payload incompleto" });
      }

      const deltasStr = deltas.map(d => d.toString());
      const tx = await contract.settleNetBySig(players, deltasStr, nonce, deadline, signature);
      const rc = await tx.wait();

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
      if (!TABLE_CONFIG.blockchainMode) return res.status(400).json({ error: "Blockchain nao habilitada" });
      const out = await forceSettleZeroDeltas(req.params.tableIdText);
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.post("/api/seat/:tableId/:wallet", async (req, res) => {
    try {
      const { tableId, wallet } = req.params;
      const c = tableContracts.get(tableId);
      if (!c) return res.status(400).json({ error: "Contrato da mesa nao encontrado" });
      if (!ethers.isAddress(wallet)) return res.status(400).json({ error: "Wallet invalida" });

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
}
