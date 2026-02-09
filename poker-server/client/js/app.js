// js/app.js
import { showMessage } from './core/notifier.js';
import { connectWallet } from './chain/contracts.js';
import { refreshBalances } from './chain/actions.js';
import { bindLobby, refreshLobby } from './features/lobby.js';
import { bindBlockchainModal } from './features/blockchainModal.js';
import { state } from './core/state.js';

window.showMessage = showMessage;
window.connectWallet = connectWallet;

document.addEventListener('DOMContentLoaded', () => {
  const btnConnect = document.getElementById('btnConnect');
  btnConnect && (btnConnect.onclick = async () => {
    const ok = await connectWallet();
    if (ok){
      const info = document.getElementById('walletInfo');
      info && (info.textContent = `Carteira: ${state.wallet.slice(0,6)}...${state.wallet.slice(-4)}`);
      refreshBalances();
    }
  });
  bindLobby();
  bindBlockchainModal();
  refreshLobby().catch(()=>{});
});
