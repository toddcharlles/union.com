// casinochips.js — módulo de fichas (CHIPS/Cashier/USDT) — depende de window.ZodConn
// Exporte global: window.Chips
(function () {
  if (window.Chips) return;

  const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];

  const CASHIER_ABI = [
    "function buyChips(uint256 usdtAmount)",
    "function redeemChips(uint256 chipAmount)",
    "function previewBuy(uint256) view returns (uint256 chipsOut, uint256 feeLiquidity, uint256 feeTreasury)",
    "function previewRedeem(uint256) view returns (uint256 usdtOut)",
    "function isEligible(address) view returns (bool)",
    "function usdt() view returns (address)",
    "function stable() view returns (address)",
    "function stableToken() view returns (address)",
    "function paymentToken() view returns (address)",
    "function quote() view returns (address)",
    "function quoteToken() view returns (address)",
    "function token() view returns (address)",
    "function minBuy() view returns (uint256)",
    "function maxBuy() view returns (uint256)"
  ];

  const state = {
    chipsAddr: null,
    cashierAddr: null,
    preferredUSDT: "0xE6D6c6CB1048Fb5341FA63D7DB934a8E5910eA6A",
    chipsContract: null,
    cashierContract: null
  };

  function getExplorerPrefix() { return "https://testnet.bscscan.com/address/"; }

  async function fetchStatus() {
    try {
      const url = `${ZodConn.getServerUrl()}/api/blockchain/status`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (_) { return null; }
  }

  async function ensureInstances() {
    if (!ZodConn.getProvider()) throw new Error("Provider não inicializado — conecte a carteira.");
    const signer = await ZodConn.getSigner();
    if (!state.chipsAddr || !state.cashierAddr) {
      const st = await fetchStatus();
      state.chipsAddr = st?.contracts?.casinoChips || state.chipsAddr;
      state.cashierAddr = st?.contracts?.cashier || state.cashierAddr;
    }
    if (!state.chipsAddr || !state.cashierAddr) throw new Error("Endereços de CHIPS/Cashier indisponíveis.");
    if (!state.chipsContract) state.chipsContract = new ethers.Contract(state.chipsAddr, ERC20_ABI, signer);
    if (!state.cashierContract) state.cashierContract = new ethers.Contract(state.cashierAddr, CASHIER_ABI, signer);
  }

  async function readChipsDecimalsSafe() {
    try { await ensureInstances(); return await state.chipsContract.decimals(); } catch { return 18; }
  }

  async function getPaymentTokenFromCashier() {
    await ensureInstances();
    const c = state.cashierContract;
    const getters = ["paymentToken", "usdt", "stable", "stableToken", "quote", "quoteToken", "token"];
    for (const g of getters) {
      try {
        const addr = await c[g]();
        if (ethers.isAddress(addr)) return addr;
      } catch (_) {}
    }
    return state.preferredUSDT;
  }

  async function balances() {
    await ensureInstances();
    const [dec, bal] = await Promise.all([
      readChipsDecimalsSafe(),
      state.chipsContract.balanceOf(ZodConn.getAccount())
    ]);
    return { chips: ethers.formatUnits(bal, dec) };
  }

  async function buyChipsWithUSDT(humanUsdt) {
    await ensureInstances();
    await ZodConn.ensureChain();
    const signer = await ZodConn.getSigner();
    const paymentAddr = await getPaymentTokenFromCashier();
    const usdt = new ethers.Contract(paymentAddr, ERC20_ABI, signer);
    const dec = await usdt.decimals().catch(() => 6);
    const amount = ethers.parseUnits(String(humanUsdt).replace(',', '.'), dec);

    const [minBuy, maxBuy, eligible] = await Promise.all([
      state.cashierContract.minBuy?.().catch(() => 0n),
      state.cashierContract.maxBuy?.().catch(() => 0n),
      state.cashierContract.isEligible?.(ZodConn.getAccount()).catch(() => true),
    ]);
    if (eligible === false) throw new Error("Sua carteira não é elegível para comprar CHIPS.");
    if (minBuy && amount < minBuy) throw new Error(`Valor mínimo: ${ethers.formatUnits(minBuy, dec)} USDT.`);
    if (maxBuy && maxBuy > 0n && amount > maxBuy) throw new Error(`Valor máximo: ${ethers.formatUnits(maxBuy, dec)} USDT.`);

    const spender = state.cashierAddr;
    const bal = await usdt.balanceOf(ZodConn.getAccount());
    if (bal < amount) throw new Error(`Saldo USDT insuficiente: ${ethers.formatUnits(bal, dec)} USDT.`);

    let alw = await usdt.allowance(ZodConn.getAccount(), spender);
    if (alw < amount) {
      if (alw > 0n) { const tx0 = await usdt.approve(spender, 0); await tx0.wait(); }
      const txA = await usdt.approve(spender, amount); await txA.wait();
    }

    // (opcional) staticCall para pré-checar erro
    try { if (state.cashierContract.buyChips?.staticCall) await state.cashierContract.buyChips.staticCall(amount); } catch (e) {
      throw new Error((e?.reason || e?.message || "Compra revertida."));
    }

    const tx = await state.cashierContract.buyChips(amount);
    await tx.wait();
    return true;
  }

  async function redeemChipsForUSDT(humanChips) {
    await ensureInstances();
    await ZodConn.ensureChain();
    const dec = await readChipsDecimalsSafe();
    const amount = ethers.parseUnits(String(humanChips).replace(',', '.'), dec);

    const bal = await state.chipsContract.balanceOf(ZodConn.getAccount());
    if (bal < amount) throw new Error(`Saldo de CHIPS insuficiente: ${ethers.formatUnits(bal, dec)} CHIPS.`);

    const spender = state.cashierAddr;
    let alw = await state.chipsContract.allowance(ZodConn.getAccount(), spender);
    if (alw < amount) {
      if (alw > 0n) { const tx0 = await state.chipsContract.approve(spender, 0); await tx0.wait(); }
      const txA = await state.chipsContract.approve(spender, amount); await txA.wait();
    }

    const tx = await state.cashierContract.redeemChips(amount);
    await tx.wait();
    return true;
  }

  function setAddresses({ chips, cashier, usdtPreferred } = {}) {
    if (ethers.isAddress(chips)) state.chipsAddr = chips;
    if (ethers.isAddress(cashier)) state.cashierAddr = cashier;
    if (ethers.isAddress(usdtPreferred)) state.preferredUSDT = usdtPreferred;
    state.chipsContract = null;
    state.cashierContract = null;
  }

  window.Chips = {
    state,
    setAddresses,
    balances,
    buyChipsWithUSDT,
    redeemChipsForUSDT,
    readChipsDecimalsSafe,
    getPaymentTokenFromCashier
  };

  // adapters de compatibilidade (mantém IDs/funções do front)
  window.buyChipsWithUSDT = async (v) => {
    try { await buyChipsWithUSDT(v); window.showMessage && window.showMessage("✅ Compra de chips feita!"); }
    catch (e) { window.showMessage && window.showMessage("Erro: " + (e.message||e), true); throw e; }
  };
  window.redeemChipsForUSDT = async (v) => {
    try { await redeemChipsForUSDT(v); window.showMessage && window.showMessage("✅ Resgate solicitado!"); }
    catch (e) { window.showMessage && window.showMessage("Erro: " + (e.message||e), true); throw e; }
  };
})(); 
