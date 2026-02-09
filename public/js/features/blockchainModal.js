// js/features/blockchainModal.js
import { state } from '../core/state.js';
import { depositChips, withdrawChips, withdrawAll, refreshBalances, updateSeatButtonUI, seatOnChainNow, buyChipsWithUSDT, redeemChipsForUSDT } from '../chain/actions.js';
import { showMessage } from '../core/notifier.js';

export function bindBlockchainModal(){
  const openBtn = document.querySelector('[data-open="blockchainModal"]');
  const modal = document.getElementById('blockchainModal');
  if (!openBtn || !modal) return;
  openBtn.addEventListener('click', async () => {
    const table = state.contracts.table;
    if (!table) { showMessage('Selecione uma mesa no lobby primeiro.', true); return; }
    modal.style.display = 'flex';
    await refreshBalances();
    await updateSeatButtonUI();
  });
  modal.querySelector('[data-close]')?.addEventListener('click', ()=> modal.style.display='none');
  modal.querySelector('[data-act="deposit"]')?.addEventListener('click', async ()=>{
    const n = parseFloat((document.getElementById('depositAmount')?.value||'').replace(',', '.'));
    if(!n || n<=0) return showMessage('Valor inválido.', true);
    await depositChips(n);
  });
  modal.querySelector('[data-act="withdraw"]')?.addEventListener('click', async ()=>{
    const n = parseFloat((document.getElementById('withdrawAmount')?.value||'').replace(',', '.'));
    if(!n || n<=0) return showMessage('Valor inválido.', true);
    await withdrawChips(n);
  });
  modal.querySelector('[data-act="withdrawAll"]')?.addEventListener('click', withdrawAll);
  // se sua UI tiver botões de seat/buy/redeem, exponha globalmente:
  window.seatOnChainNow = seatOnChainNow;
  window.buyChipsWithUSDT = buyChipsWithUSDT;
  window.redeemChipsForUSDT = redeemChipsForUSDT;
}
