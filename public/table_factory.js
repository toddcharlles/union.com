// table_factory.js — módulo da Factory de Mesas — depende de window.ZodConn
// Exporte global: window.TableFactory
(function () {
  if (window.TableFactory) return;

  const FACTORY_ABI = [
    "function createTable(string tableIdText, uint16 feeBps, bool makePublic, uint16 tableMaxSeats) external",
    "function getTable(string tableIdText) view returns (address)",
    "function canCreateTable(address user) view returns (bool ok, string reason)",
    "function createPrice() view returns (uint256)",
    "function isEligibleToCreate(address user) view returns (bool)",
    "event TableCreated(string indexed tableIdText, address indexed table, address indexed creator)"
  ];

  const state = {
    factoryAddr: null,
    factory: null,
    knownTables: JSON.parse(localStorage.getItem('poker_known_tables') || '[]')
  };

  async function fetchStatus() {
    try {
      const url = `${ZodConn.getServerUrl()}/api/blockchain/status`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (_) { return null; }
  }

  async function ensureFactory() {
    if (!ZodConn.getProvider()) throw new Error("Provider não inicializado — conecte a carteira.");
    if (!state.factoryAddr) {
      const st = await fetchStatus();
      state.factoryAddr = st?.contracts?.factory || state.factoryAddr;
    }
    if (!state.factoryAddr) throw new Error("Endereço da Factory indisponível.");
    if (!state.factory) {
      const signer = await ZodConn.getSigner();
      state.factory = new ethers.Contract(state.factoryAddr, FACTORY_ABI, signer);
    }
  }

  function registerNewTable(tableName, tableAddress, creator, maxSeats = 6, isPublic = true) {
    const newTable = {
      id: tableName, name: tableName, address: tableAddress, creator,
      maxPlayers: maxSeats, players: 0, phase: 'waiting', pot: 0,
      type: 'on-chain', isPublic, createdAt: Date.now(), lastSeen: Date.now()
    };
    const existingIndex = state.knownTables.findIndex(t => t.id === tableName);
    if (existingIndex >= 0) state.knownTables[existingIndex] = newTable;
    else state.knownTables.push(newTable);
    localStorage.setItem('poker_known_tables', JSON.stringify(state.knownTables));
    window.knownTables = state.knownTables;
    return newTable;
  }

  async function isEligible(address) {
    await ensureFactory();
    const [eligible, info] = await Promise.all([
      state.factory.isEligibleToCreate(address),
      state.factory.canCreateTable(address)
    ]);
    return { eligible, reason: info?.reason || "" };
  }

  async function createTable(tableIdText, feePercent, makePublic, maxSeats) {
    await ensureFactory();
    await ZodConn.ensureChain();
    if (!tableIdText.toLowerCase().endsWith('.zod')) throw new Error("Nome da mesa deve terminar com '.zod'");
    const feeBps = Math.floor(Number(feePercent) * 100);
    if (maxSeats < 2 || maxSeats > 10) throw new Error("Número de assentos deve ser 2-10");
    if (feeBps > 500) throw new Error("Taxa máxima é 5%");

    const [exists, price] = await Promise.all([
      state.factory.getTable(tableIdText),
      state.factory.createPrice()
    ]);
    if (exists && exists !== ethers.ZeroAddress) throw new Error("Já existe uma mesa com este nome");

    // cobra em USDT (aprovando o endereço da factory)
    const payment = state.factoryAddr;
    // USDT preferido igual ao módulo de chips
    const usdtAddr = window.Chips?.state?.preferredUSDT || "0xE6D6c6CB1048Fb5341FA63D7DB934a8E5910eA6A";
    const signer = await ZodConn.getSigner();
    const erc = new ethers.Contract(usdtAddr, ["function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)"], signer);
    const dec = await erc.decimals().catch(() => 6);
    const bal = await erc.balanceOf(ZodConn.getAccount());
    if (bal < price) throw new Error(`Saldo USDT insuficiente. Necessário: ${ethers.formatUnits(price, dec)} USDT`);
    let alw = await erc.allowance(ZodConn.getAccount(), payment);
    if (alw < price) {
      if (alw > 0n) { const tx0 = await erc.approve(payment, 0); await tx0.wait(); }
      const txA = await erc.approve(payment, price); await txA.wait();
    }

    const tx = await state.factory.createTable(tableIdText, feeBps, makePublic, Number(maxSeats));
    await tx.wait();
    const addr = await state.factory.getTable(tableIdText);
    registerNewTable(tableIdText, addr, ZodConn.getAccount(), Number(maxSeats), !!makePublic);
    return addr;
  }

  async function getTable(tableIdText) {
    await ensureFactory();
    return await state.factory.getTable(tableIdText);
  }

  async function scanTableCreated(fromBlock = "latest", toBlock = "latest") {
    await ensureFactory();
    const filter = state.factory.filters.TableCreated();
    try {
      const evs = await state.factory.queryFilter(filter, fromBlock, toBlock);
      const out = [];
      for (const ev of evs) {
        const name = ev.args.tableIdText;
        const addr = ev.args.table;
        out.push(registerNewTable(name, addr, ev.args.creator, 6, true));
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  window.TableFactory = {
    state,
    ensureFactory,
    isEligible,
    createTable,
    getTable,
    scanTableCreated,
    registerNewTable
  };
})(); 
