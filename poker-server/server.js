// server.js — Orquestrador do Poker Server Hibrido (modular)
// Instala: npm init -y && npm i express socket.io nanoid cors ethers dotenv poker-evaluator body-parser
// Executa: node server.js

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";

import { createTableConfig } from './config.js';
import { initBlockchain, injectBlockchainDeps, forceSettleNow } from './blockchain.js';
import { injectDeps as injectHelperDeps } from './helpers.js';
import {
  createTable, broadcastState, startHand, injectGameDeps
} from './gameEngine.js';
import { injectTournamentDeps, endTournament } from './tournaments.js';
import { registerSocketHandlers, injectSocketDeps } from './socketHandlers.js';
import { registerApiRoutes, injectApiDeps } from './apiRoutes.js';

dotenv.config();

// ====== Express + Socket.IO setup ======
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

// ====== Init blockchain ======
const blockchainEnabled = initBlockchain();

// ====== Create config ======
const TABLE_CONFIG = createTableConfig(blockchainEnabled);

// ====== Inject dependencies into all modules ======
injectBlockchainDeps({ ioServer: io, createTable, startHand, broadcastState });
injectHelperDeps({ forceSettleNow, TABLE_CONFIG });
injectGameDeps({ ioServer: io, tableConfig: TABLE_CONFIG, endTournament });
injectTournamentDeps({ ioServer: io });
injectSocketDeps({ tableConfig: TABLE_CONFIG });
injectApiDeps({ tableConfig: TABLE_CONFIG, ioServer: io });

// ====== Register handlers ======
registerSocketHandlers(io);
registerApiRoutes(app);

// ====== Start server ======
const PORT = process.env.PORT || 3012;
server.listen(PORT, () => {
  console.log(`\n\ud83c\udfb0 Poker Server Hibrido em http://localhost:${PORT}`);
  console.log(`\u26d3\ufe0f Blockchain: ${blockchainEnabled ? '\u2705 Habilitada' : '\u274c Desabilitada'}`);
  console.log(`\ud83d\udcca Status: http://localhost:${PORT}/api/status`);
  console.log(`\ud83d\udd17 Blockchain Status: http://localhost:${PORT}/api/blockchain/status`);
  console.log(`\ud83c\udfc6 Ranking: http://localhost:${PORT}/api/ranking`);
  console.log(`\ud83d\udd17 Mesas: http://localhost:${PORT}/api/tables`);
  console.log(`\ud83c\udfc5 Torneios: http://localhost:${PORT}/api/tournaments`);
});
