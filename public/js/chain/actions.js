// js/chain/actions.js
import { state } from '../core/state.js';
import { showMessage, notify } from '../core/notifier.js';
import { seatRequest } from '../server/api.js';

async function callViewRaw(to, sig, method, args=[]){
  const iface = new window.ethers.Interface([sig]);
  const data = iface.encodeFunctionData(method, args);
  const raw = await state.provider.call({ to, data });
  if (!raw || raw === '0x' || window.ethers.getBytes(raw).length < 32) return null;
  const out = iface.decodeFunctionResult(method, raw);
  return Array.isArray(out) ? out[0] : out;
}

export async function isSeatedOnChain(tableAddr){
  try{ return await callViewRaw(tableAddr, 'function seated(address) view returns (bool)','seated',[state.wallet]) === true; }
  catch{ return null; }
}
export async function isRoundActive(tableAddr){
  try{ return await callViewRaw(tableAddr, 'function roundActive() view returns (bool)','roundActive',[]) === true; }
  catch{ return null; }
}
async function readChipsDecimals(){ try{ return await state.contracts.chips.decimals(); } catch{ return 18; } }

async function resolveTableChipsAddress(tableAddr){
  const candidates = [
    { m:'chips', sig:'function chips() view returns (address)' },
    { m:'token', sig:'function token() view returns (address)' },
    { m:'casinoChips', sig:'function casinoChips() view returns (address)' }
  ];
  for(const c of candidates){
    const a = await callViewRaw(tableAddr, c.sig, c.m);
    if (a && window.ethers.isAddress(a) && a !== window.ethers.ZeroAddress) return a;
  }
  return state.contracts.chips?.target || state.contracts.chips?.address || null;
}

export async function refreshBalances(){
  try{
    if (!state.isConnected || !state.contracts.chips) return;
    const [bal, dec] = await Promise.all([
      state.contracts.chips.balanceOf(state.wallet),
      readChipsDecimals()
    ]);
    let tableBalBN = 0n;
    try { if (state.contracts.table) tableBalBN = await readTableBalanceGeneric(state.wallet, state.contracts.table); } catch {}
    const walletEl = document.getElementById('walletChipsBalance');
    const tableEl  = document.getElementById('tableChipsBalance');
    if (walletEl) walletEl.textContent = `${window.ethers.formatUnits(bal, dec)} CHIPS`;
    if (tableEl)  tableEl.textContent  = `${window.ethers.formatUnits(tableBalBN, dec)} CHIPS`;
  }catch(e){ console.warn("[refreshBalances]", e); }
}

async function readTableBalanceGeneric(addr, tableInstance = state.contracts.table){
  if (!addr || !tableInstance) return 0n;
  const methods = ["balance","balanceOf","playerBalance","playerBalances","balances"];
  const to = tableInstance.target || tableInstance.address;
  for(const m of methods){
    try{
      const sig = ({
        balance: "function balance(address) view returns (uint256)",
        balanceOf: "function balanceOf(address) view returns (uint256)",
        playerBalance: "function playerBalance(address) view returns (uint256)",
        playerBalances: "function playerBalances(address) view returns (uint256)",
        balances: "function balances(address) view returns (uint256)"
      })[m];
      const iface = new window.ethers.Interface([sig]);
      const data = iface.encodeFunctionData(m, [addr]);
      const raw  = await state.provider.call({ to, data });
      if (!raw || raw === "0x" || window.ethers.getBytes(raw).length < 32) continue;
      const [value] = iface.decodeFunctionResult(m, raw);
      if (value != null) return BigInt(value);
    }catch{}
  }
  return 0n;
}

export async function updateSeatButtonUI(){
  try{
    const btn = document.getElementById('seatOnChainBtn');
    const statusEl = document.getElementById('seatOnChainStatus');
    const table = state.contracts.table;
    if (!btn) return;
    if (!table){ btn.disabled=true; btn.textContent="🪑 Sentar on-chain"; if(statusEl) statusEl.textContent="Selecione uma mesa."; return; }
    const addr = table.target || table.address;
    const [seated, active] = await Promise.all([isSeatedOnChain(addr), isRoundActive(addr)]);
    if (seated) { btn.disabled=true; btn.textContent="✅ Já sentado"; if(statusEl) statusEl.textContent="Você já está sentado on-chain."; }
    else { btn.disabled=false; btn.textContent = active ? "🪑 Sentar após round" : "🪑 Sentar on-chain"; if(statusEl) statusEl.textContent = active ? "Round ativo: assento após settlement." : ""; }
  }catch(_){}
}

export async function seatOnChainNow(){
  try{
    if (!state.isConnected) return showMessage("Conecte sua wallet primeiro.", true);
    const table = state.contracts.table; if(!table) return showMessage("Selecione uma mesa.", true);
    const addr  = table.target || table.address;
    const idText = state.selectedTable.idText || state.selectedTable.name;
    const [seated, active] = await Promise.all([isSeatedOnChain(addr), isRoundActive(addr)]);
    const btn = document.getElementById('seatOnChainBtn');
    const statusEl = document.getElementById('seatOnChainStatus');
    if (seated) { if(btn){btn.disabled=true;btn.textContent="✅ Já sentado";} if(statusEl) statusEl.textContent="Você já está sentado on-chain."; return; }
    if (!idText) return showMessage("Sem idText da mesa. Entre pelo lobby.", true);
    if (btn) { btn.disabled=true; btn.textContent="⏳ Enviando pedido..."; }
    if (statusEl) statusEl.textContent = active ? "Round ativo: seu assento será aplicado após o settlement." : "Pedindo assento on-chain...";
    const data = await seatRequest(idText, state.wallet);
    if (data?.queued) showMessage("Pedido de assento enfileirado. Aplicado após settlement.");
    else showMessage("Assento solicitado. Verificando on-chain...");
    const ok = await waitUntilSeated(addr, { timeoutMs: data?.queued ? 120000 : 45000 });
    if (ok){ if(btn){btn.disabled=true;btn.textContent="✅ Já sentado";} if(statusEl) statusEl.textContent="Assento confirmado on-chain. Você já pode depositar."; }
    else { if(btn){btn.disabled=false;btn.textContent= active ? "🪑 Sentar após round":"🪑 Sentar on-chain";} if(statusEl) statusEl.textContent="Ainda não refletiu on-chain. Tente após settlement."; showMessage("Ainda não apareceu como sentado.", true); }
  }catch(e){ const btn = document.getElementById('seatOnChainBtn'); if(btn){btn.disabled=false; btn.textContent="🪑 Sentar on-chain";} showMessage("Erro ao sentar: " + (e?.message||e), true); }
  finally{ try{ await updateSeatButtonUI(); }catch{} }
}

async function waitUntilSeated(tableAddr, { timeoutMs = 45000, tickMs = 1200 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const ok = await isSeatedOnChain(tableAddr); if (ok === true) return true; } catch {}
    await new Promise(r => setTimeout(r, tickMs));
  }
  return false;
}

export async function depositChips(humanAmount){
  if(!state.isConnected) return showMessage("Wallet desconectada", true);
  const table = state.contracts.table; if(!table) return showMessage("Selecione uma mesa primeiro.", true);
  const tableAddr = table.target || table.address;
  const seated = await isSeatedOnChain(tableAddr);
  const active = await isRoundActive(tableAddr);
  if (active === true) return showMessage("Round ativo: aguarde o settlement.", true);
  if (seated === false) return showMessage("Você ainda não está sentado on-chain nesta mesa.", true);

  const chipsAddr = await resolveTableChipsAddress(tableAddr);
  if (!chipsAddr) return showMessage("Não foi possível identificar o token CHIPS da mesa.", true);
  const signer = await state.provider.getSigner();
  const chips  = new window.ethers.Contract(chipsAddr, state.contracts.chips.interface.fragments, signer);
  const dec    = await readChipsDecimals();
  const amount = window.ethers.parseUnits(String(humanAmount), dec);

  const bal = await chips.balanceOf(state.wallet);
  if (bal < amount) return showMessage(`Saldo CHIPS insuficiente.`, true);
  let alw = await chips.allowance(state.wallet, tableAddr);
  if (alw < amount) {
    if (alw > 0n) { showMessage("Limpando allowance (1/2)..."); await (await chips.approve(tableAddr, 0)).wait(); }
    showMessage("Aprovando CHIPS (2/2)..."); await (await chips.approve(tableAddr, amount)).wait();
  }

  const stop = notify.loading("Enviando depósito...");
  try{
    const tx = await table.deposit(amount);
    await tx.wait();
    showMessage("✅ Depósito feito!");
    refreshBalances();
  }catch(e){
    showMessage("Erro no depósito: " + (e?.reason || e?.message || 'revert'), true);
  }finally{ stop(); }
}

export async function withdrawChips(humanAmount){
  if(!state.isConnected) return showMessage("Wallet desconectada", true);
  const table = state.contracts.table; if(!table) return showMessage("Selecione uma mesa primeiro.", true);
  const dec = await readChipsDecimals();
  const amount = window.ethers.parseUnits(String(humanAmount), dec);
  const balBN = await readTableBalanceGeneric(state.wallet, table);
  if (balBN <= 0n) return showMessage("Seu saldo na mesa é 0.", true);
  if (amount > balBN) return showMessage(`Saldo na mesa insuficiente.`, true);
  const stop = notify.loading("Enviando saque...");
  try{
    const tx = await table.withdraw(amount);
    await tx.wait();
    showMessage("✅ Saque feito!");
    refreshBalances();
  }catch(e){ showMessage("Erro no saque: " + (e?.reason || e?.message || 'revert'), true); }
  finally{ stop(); }
}

export async function withdrawAll(){
  if(!state.isConnected) return showMessage("Wallet desconectada", true);
  const table = state.contracts.table; if(!table) return showMessage("Selecione uma mesa primeiro.", true);
  const stop = notify.loading("Enviando saque total...");
  try{
    const tx = await table.withdrawAll();
    await tx.wait();
    showMessage("✅ Saque total feito!");
    refreshBalances();
  }catch(e){ showMessage("Erro no saque total: " + (e?.reason || e?.message || 'revert'), true); }
  finally{ stop(); }
}

export async function buyChipsWithUSDT(humanUsdt){
  if(!state.isConnected) return showMessage("Wallet desconectada", true);
  const cashier = state.contracts.cashier; if(!cashier) return showMessage("Cashier não carregado.", true);
  const signer = await state.provider.getSigner();
  let payment = null;
  try{ payment = await cashier.paymentToken(); }catch{}
  if (!payment || !window.ethers.isAddress(payment)) return showMessage("Token de pagamento inválido no Cashier.", true);

  const usdt = new window.ethers.Contract(payment, ["function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)"], signer);
  const dec  = await usdt.decimals().catch(()=>6);
  const amount = window.ethers.parseUnits(String(humanUsdt), dec);

  const [minBuy, maxBuy] = await Promise.all([
    cashier.minBuy?.().catch(()=>0n),
    cashier.maxBuy?.().catch(()=>0n)
  ]);
  if (minBuy && amount < minBuy) return showMessage(`Valor mínimo: ${window.ethers.formatUnits(minBuy, dec)} USDT.`, true);
  if (maxBuy && maxBuy > 0n && amount > maxBuy) return showMessage(`Valor máximo: ${window.ethers.formatUnits(maxBuy, dec)} USDT.`, true);

  const bal = await usdt.balanceOf(state.wallet);
  if (bal < amount) return showMessage("Saldo USDT insuficiente.", true);
  const spender = cashier.target || cashier.address;
  let alw = await usdt.allowance(state.wallet, spender);
  if (alw < amount){
    if (alw > 0n) { showMessage("Limpando allowance USDT (1/2)..."); await (await usdt.approve(spender, 0)).wait(); }
    showMessage("Aprovando USDT (2/2)..."); await (await usdt.approve(spender, amount)).wait();
  }
  const stop = notify.loading("Comprando CHIPS...");
  try{
    const tx = await cashier.buyChips(amount);
    await tx.wait();
    showMessage("✅ Compra concluída!");
    refreshBalances();
  }catch(e){ showMessage("Erro na compra: " + (e?.reason||e?.message||'revert'), true); }
  finally{ stop(); }
}

export async function redeemChipsForUSDT(humanChips){
  if(!state.isConnected) return showMessage("Wallet desconectada", true);
  const cashier = state.contracts.cashier; if(!cashier) return showMessage("Cashier não carregado.", true);
  const dec = await state.contracts.chips.decimals().catch(()=>18);
  const amount = window.ethers.parseUnits(String(humanChips), dec);

  const chips = state.contracts.chips.connect(await state.provider.getSigner());
  const bal = await chips.balanceOf(state.wallet);
  if (bal < amount) return showMessage("Saldo CHIPS insuficiente.", true);

  const spender = cashier.target || cashier.address;
  let alw = await chips.allowance(state.wallet, spender);
  if (alw < amount) {
    if (alw > 0n) { showMessage("Limpando allowance CHIPS (1/2)..."); await (await chips.approve(spender, 0)).wait(); }
    showMessage("Aprovando CHIPS (2/2)..."); await (await chips.approve(spender, amount)).wait();
  }
  const stop = notify.loading("Resgatando CHIPS...");
  try{
    const tx = await cashier.redeemChips(amount);
    await tx.wait();
    showMessage("✅ Resgate concluído!");
    refreshBalances();
  }catch(e){ showMessage("Erro no resgate: " + (e?.reason||e?.message||'revert'), true); }
  finally{ stop(); }
}
