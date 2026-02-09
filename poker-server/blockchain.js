// blockchain.js — Integracao blockchain (init, contratos, settlement, eventos on-chain)
import { ethers } from "ethers";
import {
  BLOCKCHAIN_CONFIG, CHIPS_ABI, TABLE_ABI, FACTORY_ABI
} from './config.js';
import {
  tables, tableContracts, playerWallets, blockchain
} from './state.js';
import {
  enqueueTableJob, markActivity, processPendingSeats, queueSeat,
  scheduleIdleCheck
} from './helpers.js';

// io e injetado do server.js
let io = null;
let _createTableFn = null;
let _startHandFn = null;
let _broadcastStateFn = null;

export function injectBlockchainDeps({ ioServer, createTable, startHand, broadcastState }) {
  io = ioServer;
  _createTableFn = createTable;
  _startHandFn = startHand;
  _broadcastStateFn = broadcastState;
}

// ====== Init ======
export function initBlockchain() {
  try {
    blockchain.provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.rpcUrl);

    if (!BLOCKCHAIN_CONFIG.operatorPrivateKey) {
      console.warn("\u26a0\ufe0f OPERATOR_PRIVATE_KEY nao configurada - blockchain desabilitada");
      return false;
    }

    blockchain.operatorWallet = new ethers.Wallet(BLOCKCHAIN_CONFIG.operatorPrivateKey, blockchain.provider);

    blockchain.chipsContract = new ethers.Contract(
      BLOCKCHAIN_CONFIG.contracts.casinoChips,
      CHIPS_ABI,
      blockchain.provider
    );

    if (BLOCKCHAIN_CONFIG.contracts.factory) {
      blockchain.factoryContract = new ethers.Contract(
        BLOCKCHAIN_CONFIG.contracts.factory,
        FACTORY_ABI,
        blockchain.operatorWallet
      );
    } else {
      console.error("\u274c FACTORY_ADDRESS nao configurado.");
      return false;
    }

    console.log(`\u2705 Blockchain inicializado`);
    console.log(`   Operator: ${blockchain.operatorWallet.address}`);
    console.log(`   Factory: ${BLOCKCHAIN_CONFIG.contracts.factory}`);

    listenToFactoryEvents();
    blockchain.enabled = true;
    return true;
  } catch (error) {
    console.error("\u274c Erro ao inicializar blockchain:", error.message);
    return false;
  }
}

// ====== Factory events ======
function listenToFactoryEvents() {
  if (!blockchain.factoryContract) return;

  blockchain.factoryContract.on("TableCreated", (
    tableIdText, tableAddress, creator, chips, operator,
    feeBpsUsed, isPublic, maxSeats, saleFeeBps, event
  ) => {
    const id = tableIdText;
    console.log(`\ud83c\udd95 Nova mesa criada: ${id} @ ${tableAddress}`);

    const table = _createTableFn(id, Number(maxSeats));
    table.contractAddress = tableAddress;
    table.creator = creator.toLowerCase();
    table.isPublic = isPublic;
    table.maxSeats = Number(maxSeats);

    const tableContract = new ethers.Contract(tableAddress, TABLE_ABI, blockchain.operatorWallet);
    tableContracts.set(id, tableContract);
    tables.set(id, table);

    markActivity(id);
    listenToTableEvents(tableContract, id);
    io.emit("newTable", { id, address: tableAddress, isPublic, maxSeats: Number(maxSeats) });
  });

  console.log("\ud83d\udc42 Escutando eventos da Factory...");
}

// ====== Table events ======
export function listenToTableEvents(tableContract, tableIdText) {
  tableContract.on("RoundStarted", () => {
    io.to(tableIdText).emit("blockchainRoundStarted");
    markActivity(tableIdText);
  });

  tableContract.on("RoundSettled", async () => {
    io.to(tableIdText).emit("blockchainRoundSettled");
    markActivity(tableIdText);

    try { await processPendingSeats(tableIdText); } catch (e) { console.warn(e?.message || e); }

    await refreshOnChainStacks(tableIdText);
    const table = tables.get(tableIdText);
    if (table) {
      try { await refreshStacksFromChain(tableIdText); } catch (_) {}
      const ready = table.players.filter(p => p && p.stack > 0 && p.connected).length >= 2;
      if (ready) setTimeout(() => _startHandFn(table), 3000);
      else { table.phase = "waiting"; _broadcastStateFn(table); }
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
      player: walletLower, amount: amountNum, txHash: event.log.transactionHash
    });
    markActivity(tableIdText);
    updatePlayerStackFromEvent(tableIdText, walletLower, amountNum, true);
  });

  tableContract.on("Withdrawn", (player, amount, event) => {
    const walletLower = player.toLowerCase();
    const amountNum = parseFloat(ethers.formatEther(amount));
    io.to(tableIdText).emit("blockchainWithdraw", {
      player: walletLower, amount: amountNum, txHash: event.log.transactionHash
    });
    markActivity(tableIdText);
    updatePlayerStackFromEvent(tableIdText, walletLower, amountNum, false);
  });

  tableContract.on("SettlementBySig", (caller, signer, nonce) => {
    io.to(tableIdText).emit("blockchainSettlementBySig", {
      caller: caller.toLowerCase(), signer: signer.toLowerCase(), nonce
    });
    markActivity(tableIdText);
  });
}

// ====== Blockchain helpers ======
export async function getSettlementNonce(contract) {
  try { if (typeof contract.settleNonce === 'function') return await contract.settleNonce(); } catch {}
  try { if (typeof contract.getSettleNonce === 'function') return await contract.getSettleNonce(); } catch {}
  try { if (typeof contract.nonce === 'function') return await contract.nonce(); } catch {}
  try { if (typeof contract.getNonce === 'function') return await contract.getNonce(); } catch {}
  try { if (typeof contract.nonces === 'function') return await contract.nonces(blockchain.operatorWallet.address); } catch {}
  return BigInt(Math.floor(Date.now() / 1000));
}

export async function getPlayerTableBalance(tableIdText, playerAddress) {
  const tc = tableContracts.get(tableIdText);
  if (!tc || !ethers.isAddress(playerAddress)) return 0;

  const cand = ["balanceOf", "balance", "balances", "getBalance"];
  for (const fn of cand) {
    try {
      if (typeof tc[fn] === "function") {
        const raw = await tc[fn](playerAddress);
        return Number(ethers.formatEther(raw));
      }
    } catch (_) {}
  }
  return 0;
}

export async function getChipsBalance(playerAddress) {
  try {
    const balance = await blockchain.chipsContract.balanceOf(playerAddress);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error(`Erro ao ler CHIPS de ${playerAddress}:`, error.message);
    return "0";
  }
}

export async function startOnChainRound(tableIdText) {
  const tc = tableContracts.get(tableIdText);
  if (!tc) { console.warn("\u26a0\ufe0f Contrato nao encontrado"); return null; }

  try {
    const isActive = await tc.roundActive();
    if (isActive) {
      console.warn(`\u26a0\ufe0f Round on-chain ainda ativo em ${tableIdText}.`);
      scheduleIdleCheck(tableIdText);
      return null;
    }
    console.log(`\ud83c\udfb2 Iniciando round on-chain na mesa ${tableIdText}...`);
    const tx = await tc.startRound();
    const receipt = await tx.wait();
    console.log(`\u2705 Round iniciado: ${receipt.hash}`);
    return receipt;
  } catch (error) {
    console.error("\u274c Erro ao iniciar round:", error.message);
    return null;
  }
}

export async function settleRound(tableIdText, addresses, deltas) {
  const tc = tableContracts.get(tableIdText);
  if (!tc) { console.warn(`\u26a0\ufe0f Contrato nao encontrado para settlement da mesa ${tableIdText}`); return null; }
  const sum = deltas.reduce((a, d) => a + BigInt(d), 0n);
  if (sum !== 0n) {
    console.error(`\u274c Soma dos deltas deve ser zero. Soma atual: ${sum}`);
    return null;
  }
  try {
    console.log(`\ud83d\udcb0 Iniciando settlement on-chain na mesa ${tableIdText}...`);
    const deltasStr = deltas.map(d => d.toString());
    const tx = await tc.settleNet(addresses, deltasStr);
    const receipt = await tx.wait();
    console.log(`\u2705 Settlement concluido na mesa ${tableIdText}: ${receipt.hash}`);
    try { await refreshStacksFromChain(tableIdText); } catch (_) {}
    return receipt;
  } catch (error) {
    console.error(`\u274c Erro no settlement da mesa ${tableIdText}:`, error.message);
    return null;
  }
}

function toBigIntArray(arr) {
  return arr.map((x) => {
    if (typeof x === "bigint") return x;
    if (typeof x === "number") return BigInt(x);
    if (typeof x === "string") return BigInt(x);
    throw new Error("delta invalido");
  });
}

export async function signSettlement(tableIdText, players, deltas, nonceOverride = null) {
  const contract = tableContracts.get(tableIdText);
  if (!contract) throw new Error('Contrato nao encontrado');

  const nonce = nonceOverride ?? await getSettlementNonce(contract);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const domain = {
    name: (typeof contract.EIP712_NAME === 'function') ? (await contract.EIP712_NAME()) : 'SimplePokerTable',
    version: (typeof contract.EIP712_VERSION === 'function') ? (await contract.EIP712_VERSION()) : '1',
    chainId: BLOCKCHAIN_CONFIG.chainId,
    verifyingContract: contract.target
  };

  const types = {
    Settlement: [
      { name: 'nonce', type: 'uint256' },
      { name: 'players', type: 'address[]' },
      { name: 'deltas', type: 'int256[]' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  const value = { nonce, players, deltas, deadline };
  const signature = await blockchain.operatorWallet.signTypedData(domain, types, value);
  console.log('[signSettlement] Assinatura gerada:', signature);

  return { tableId: tableIdText, contract: contract.target, players, deltas, nonce, deadline, signature };
}

// ====== Stack refresh ======
async function refreshOneStackFromChain(tableIdText, walletLower) {
  const bal = await getPlayerTableBalance(tableIdText, walletLower);
  const table = tables.get(tableIdText);
  if (!table) return;
  for (const p of table.players) {
    if (!p) continue;
    const w = playerWallets.get(p.id);
    if (w && w.toLowerCase() === walletLower) {
      p.stack = Number(bal);
      p.initialStack = p.stack;
    }
  }
}

export async function refreshStacksFromChain(tableIdText) {
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
  _broadcastStateFn(table);
}

export async function refreshOnChainStacks(tableIdText) {
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
  _broadcastStateFn(table);
}

async function updatePlayerStackFromEvent(tableIdText, walletLower) {
  try { await refreshOneStackFromChain(tableIdText, walletLower); }
  catch (e) { console.warn('[updatePlayerStackFromEvent] falhou:', e?.message || e); }
}

export async function tryUnseatOnChain(tableIdText, walletLower, TABLE_CONFIG) {
  if (!TABLE_CONFIG.blockchainMode) return;
  const contract = tableContracts.get(tableIdText);
  if (!contract || !ethers.isAddress(walletLower)) return;
  try {
    const active = await contract.roundActive();
    if (!active) {
      await contract.unseatPlayer(walletLower);
      console.log(`\ud83d\udd3b unseatPlayer on-chain para ${walletLower} em ${tableIdText}`);
    } else {
      console.warn(`\u26a0\ufe0f Round ativo em ${tableIdText}; unseat sera tentado apos settlement`);
    }
  } catch (e) {
    console.warn(`\u26a0\ufe0f Falha unseatPlayer(${walletLower}) em ${tableIdText}:`, e?.message || e);
  }
}

// ====== Settlement computation ======
export function computeSettlementFromStacks(table) {
  const items = [];
  for (const p of table.players) {
    if (!p || typeof p.initialStack !== "number") continue;
    const wallet = playerWallets.get(p.id);
    if (!wallet) continue;
    const delta = (p.stack ?? 0) - (p.initialStack ?? 0);
    items.push({ address: wallet, deltaNum: delta });
  }
  if (!items.length) throw new Error("Nao ha deltas calculaveis.");

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
    deltas[deltas.length - 1] -= sum;
  }
  return { addresses, deltas };
}

export function computeEip712FromTable(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) throw new Error("Mesa invalida");

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

  const sum = deltas.reduce((a, b) => a + b, 0n);
  if (sum !== 0n) deltas[deltas.length - 1] -= sum;

  return { players, deltas };
}

export async function forceSettleNow(tableIdText) {
  const contract = tableContracts.get(tableIdText);
  if (!contract) throw new Error('Contrato nao encontrado para ' + tableIdText);

  const { players, deltas } = computeEip712FromTable(tableIdText);

  const sum = deltas.reduce((a, b) => a + b, 0n);
  if (sum !== 0n && deltas.length > 0) {
    deltas[deltas.length - 1] -= sum;
  }

  const nonce = await getSettlementNonce(contract);
  const { signature, deadline } = await signSettlement(tableIdText, players, deltas, nonce);

  const tx = await contract.settleNetBySig(
    players, deltas.map(d => d.toString()), nonce, deadline, signature, { gasLimit: 500000 }
  );
  const rc = await tx.wait();
  console.log('[forceSettleNow] Tx hash:', rc.hash);

  try { await refreshStacksFromChain(tableIdText); } catch (e) { console.warn('Falha no refresh stacks:', e); }
  io.to(tableIdText).emit('blockchainRoundSettled');
  markActivity(tableIdText);

  const table = tables.get(tableIdText);
  if (table) setTimeout(() => _startHandFn(table), 3000);

  return { ok: true, tx: rc.hash };
}

export async function forceSettleZeroDeltas(tableIdText) {
  const table = tables.get(tableIdText);
  if (!table) throw new Error("Mesa invalida");
  const contract = tableContracts.get(tableIdText);
  if (!contract) throw new Error("Contrato da mesa nao encontrado");

  const active = await contract.roundActive();
  if (!active) return { ok: true, msg: "Round ja esta fechado." };

  const addresses = table.players.map(p => p && playerWallets.get(p.id)).filter(Boolean);
  if (!addresses.length) throw new Error("Sem carteiras para assinar.");

  const zeros = addresses.map(() => 0n);
  const rc = await settleRound(tableIdText, addresses, zeros);
  return { ok: true, tx: rc?.hash || null };
}
