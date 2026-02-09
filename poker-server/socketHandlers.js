// socketHandlers.js — Todos os eventos Socket.IO
import { nanoid } from "nanoid";
import { ethers } from "ethers";
import {
  tables, tableContracts, playerWallets, socketWallets, blockchain, tableLocks
} from './state.js';
import {
  allow, isAdmin, isWalletAlreadySeated, getPlayerTableBySocket,
  markActivity, enqueueTableJob, queueSeat, getTopRanking
} from './helpers.js';
import {
  createTable, broadcastState, startHand, playerAction,
  finalizeHand, unseatAndCleanup
} from './gameEngine.js';
import { getPlayerTableBalance, listenToTableEvents, forceSettleNow } from './blockchain.js';

let TABLE_CONFIG = null;

export function injectSocketDeps({ tableConfig }) {
  TABLE_CONFIG = tableConfig;
}

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("Novo jogador conectado:", socket.id);

    // ---- linkWallet ----
    socket.on("linkWallet", ({ walletAddress }) => {
      if (!ethers.isAddress(walletAddress)) {
        return socket.emit("errorMsg", "Endereco de wallet invalido.");
      }
      const walletLower = walletAddress.toLowerCase();
      socketWallets.set(socket.id, walletLower);
      const maybeTable = getPlayerTableBySocket(socket.id);
      if (maybeTable) {
        if (isWalletAlreadySeated(maybeTable, walletLower)) {
          socketWallets.delete(socket.id);
          return socket.emit("errorMsg", "Esta wallet ja esta sentada nesta mesa.");
        }
      }
      const table = getPlayerTableBySocket(socket.id);
      if (table) {
        const seat = table.players.findIndex(p => p?.socketId === socket.id);
        if (seat >= 0) playerWallets.set(table.players[seat].id, walletLower);
      }
      socket.emit("systemMessage", "Wallet vinculada com sucesso!");
      console.log(`\ud83d\udd17 Wallet vinculada: ${socket.id} -> ${walletLower}`);
    });

    // ---- helloRebind ----
    socket.on("helloRebind", ({ playerId }) => {
      for (const table of tables.values()) {
        const seat = table.players.findIndex(p => p && p.id === playerId);
        if (seat >= 0) {
          table.players[seat].socketId = socket.id;
          table.players[seat].connected = true;
          socket.join(table.id);
          broadcastState(table);
          socket.emit("systemMessage", "Reconectado a mesa com sucesso.");
          break;
        }
      }
    });

    // ---- joinTable ----
    socket.on("joinTable", async ({ tableIdText, name, buyin }) => {
      if (!allow(socket)) return socket.emit("errorMsg", "Muitas requisicoes, aguarde.");
      if (!tableIdText) return socket.emit("errorMsg", "tableIdText e obrigatorio.");
      name = (name || "").trim().slice(0, TABLE_CONFIG.maxNameLength) || "Anonimo";

      let table = tables.get(tableIdText);
      if (!table) {
        if (blockchain.factoryContract) {
          try {
            const tableAddress = await blockchain.factoryContract.getTable(tableIdText);
            if (tableAddress === ethers.ZeroAddress) {
              return socket.emit("errorMsg", "Mesa nao encontrada no contrato.");
            }
            table = createTable(tableIdText, TABLE_CONFIG.defaultSeats);
            table.contractAddress = tableAddress;
            tables.set(tableIdText, table);

            const tc = new ethers.Contract(tableAddress, (await import('./config.js')).TABLE_ABI, blockchain.operatorWallet);
            tableContracts.set(tableIdText, tc);
            listenToTableEvents(tc, tableIdText);
            markActivity(tableIdText);
          } catch (error) {
            return socket.emit("errorMsg", "Erro ao buscar mesa no contrato.");
          }
        } else {
          return socket.emit("errorMsg", "Mesa nao encontrada.");
        }
      }

      const seat = table.players.findIndex(p => !p);
      if (seat === -1) return socket.emit("errorMsg", "Mesa cheia.");

      if (TABLE_CONFIG.blockchainMode) {
        const wallet = socketWallets.get(socket.id);
        if (!wallet) return socket.emit("errorMsg", "Vincule sua wallet primeiro.");
        if (isWalletAlreadySeated(table, wallet.toLowerCase())) {
          return socket.emit("errorMsg", "Esta wallet ja esta sentada nesta mesa.");
        }
        buyin = 0;
      } else {
        if (typeof buyin !== "number" || buyin < TABLE_CONFIG.minBuyin || buyin > TABLE_CONFIG.maxBuyin) {
          return socket.emit("errorMsg", "Buy-in invalido.");
        }
      }

      const playerId = nanoid(10);
      const player = {
        id: playerId, name, stack: buyin, socketId: socket.id,
        connected: true, hole: [], bet: 0, folded: false, allIn: false, lastAction: null
      };

      table.players[seat] = player;
      socket.join(table.id);
      socket.emit("seated", { seat, playerId, tableId: tableIdText });

      const wallet = socketWallets.get(socket.id);
      if (wallet) {
        playerWallets.set(playerId, wallet);
        if (TABLE_CONFIG.blockchainMode) {
          try {
            const bal = await getPlayerTableBalance(tableIdText, wallet);
            player.stack = Number(bal);
          } catch (e) {
            console.warn(`\u26a0\ufe0f Falha ao ler saldo on-chain:`, e?.message || e);
          }
        }
      }

      if (wallet && TABLE_CONFIG.blockchainMode) {
        const tc = tableContracts.get(tableIdText);
        if (tc) {
          try {
            const isActive = await tc.roundActive();
            if (!isActive) {
              await tc.seatPlayer(wallet);
            } else {
              queueSeat(tableIdText, wallet.toLowerCase());
              io.to(tableIdText).emit("roundLocked", { tableId: tableIdText, pendingSeat: wallet.toLowerCase() });
            }
          } catch (e) {
            console.warn(`\u26a0\ufe0f seatPlayer falhou para ${wallet}:`, e?.message || e);
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

    // ---- playerAction ----
    socket.on("playerAction", ({ tableId, action, amount }) => {
      if (!allow(socket, 50, 3000)) return;
      const table = tables.get(tableId);
      if (!table) return;
      const seat = table.players.findIndex(p => p?.socketId === socket.id);
      if (seat === -1) return;
      const sanitizedAmount = Number.isInteger(amount) && amount >= 0 ? amount : 0;
      playerAction(table, seat, action, sanitizedAmount);
    });

    // ---- finalizeHand ----
    socket.on("finalizeHand", ({ tableId }) => {
      const table = tables.get(tableId);
      if (!table) return socket.emit("errorMsg", "Mesa invalida.");
      if (!table.canFinalize) return socket.emit("errorMsg", "Ainda nao e possivel finalizar a mao.");
      table.canFinalize = false;
      broadcastState(table);
      finalizeHand(table);
    });

    // ---- forceSettle ----
    socket.on("forceSettle", async ({ tableId }) => {
      try {
        if (!TABLE_CONFIG.blockchainMode) return socket.emit("errorMsg", "Blockchain nao habilitada");
        const out = await forceSettleNow(tableId);
        socket.emit("systemMessage", out.msg || `Settlement forcado. ${out.tx ? "Tx: " + out.tx : ""}`);
      } catch (e) {
        socket.emit("errorMsg", e?.message || String(e));
      }
    });

    // ---- sendMessage ----
    socket.on("sendMessage", ({ tableId, message }) => {
      const table = tables.get(tableId);
      if (!table) return;
      const seat = table.players.findIndex(p => p?.socketId === socket.id);
      if (seat === -1) return socket.emit("errorMsg", "Voce nao esta na mesa.");
      const text = String(message || "").slice(0, TABLE_CONFIG.maxMessageLength);
      const player = table.players[seat];
      const timestamp = new Date().toISOString();
      io.to(table.id).emit("chatMessage", { playerId: player.id, name: player.name, seat, message: text, timestamp });
      markActivity(table.id);
    });

    // ---- leaveTable ----
    socket.on("leaveTable", ({ tableId }) => {
      if (!tableId || typeof tableId !== "string") return;
      const table = tables.get(tableId);
      if (!table) return;
      const seat = table.players.findIndex(p => p?.socketId === socket.id);
      if (seat >= 0) unseatAndCleanup(table, seat, "leave");
    });

    // ---- getRanking ----
    socket.on("getRanking", () => {
      socket.emit("ranking", getTopRanking(100));
    });

    // ---- listTables ----
    socket.on("listTables", () => {
      const tableList = Array.from(tables.values())
        .filter(t => !t.tournamentId)
        .map(t => ({
          id: t.id,
          name: t.name || t.id,
          players: t.players.filter(Boolean).length,
          maxPlayers: t.players.length,
          phase: t.phase,
          isPublic: t.isPublic,
          blinds: t.customBlinds
            ? `${t.customBlinds.smallBlind}/${t.customBlinds.bigBlind}`
            : `${TABLE_CONFIG.smallBlind}/${TABLE_CONFIG.bigBlind}`
        }));
      socket.emit("tableList", tableList);
    });

    // ---- ADMIN: createTable ----
    socket.on("createTable", ({ name, seats, smallBlind, bigBlind }) => {
      if (!isAdmin(socket.id)) return socket.emit("errorMsg", "Apenas administradores podem criar mesas.");
      if (TABLE_CONFIG.blockchainMode) return socket.emit("errorMsg", "No modo on-chain, mesas sao criadas via contrato.");

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

      console.log(`\ud83c\udccf Mesa criada por admin: ${tableName} (${tableId}) \u2014 ${tableSeats} assentos, blinds ${sb}/${bb}`);

      const tableInfo = {
        id: tableId, name: tableName, players: 0, maxPlayers: tableSeats,
        phase: "waiting", isPublic: true, blinds: `${sb}/${bb}`
      };
      io.emit("newTable", tableInfo);
      socket.emit("tableCreated", tableInfo);
      socket.emit("systemMessage", `Mesa "${tableName}" criada com sucesso!`);
    });

    // ---- ADMIN: deleteTable ----
    socket.on("deleteTable", ({ tableId }) => {
      if (!isAdmin(socket.id)) return socket.emit("errorMsg", "Apenas administradores podem deletar mesas.");
      const table = tables.get(tableId);
      if (!table) return socket.emit("errorMsg", "Mesa nao encontrada.");
      const active = table.players.filter(Boolean).length;
      if (active > 0) return socket.emit("errorMsg", `Mesa tem ${active} jogador(es). Aguarde saida.`);

      tables.delete(tableId);
      tableLocks.delete(tableId);
      io.emit("tableRemoved", { tableId });
      socket.emit("systemMessage", `Mesa "${table.name || tableId}" removida.`);
      console.log(`\ud83d\uddd1\ufe0f Mesa removida por admin: ${table.name || tableId} (${tableId})`);
    });

    // ---- disconnect ----
    socket.on("disconnect", () => {
      for (const table of tables.values()) {
        const seat = table.players.findIndex(p => p?.socketId === socket.id);
        if (seat >= 0) unseatAndCleanup(table, seat, "disconnect");
      }
      socketWallets.delete(socket.id);
    });
  });
}
