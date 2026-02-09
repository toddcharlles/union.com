// js/features/lobby.js
import { state } from '../core/state.js';
import { getServerTables } from '../server/api.js';
import { setActiveTableById } from '../chain/contracts.js';
import { escapeHtml } from '../core/helpers.js';
import { showMessage } from '../core/notifier.js';

export function bindLobby(){
  const openBtn = document.getElementById('btnLobby');
  const modal   = document.getElementById('lobbyModal');
  const close   = modal?.querySelector('[data-close="lobbyModal"]');
  if (!openBtn || !modal) return;
  openBtn.onclick = () => { modal.style.display = 'flex'; refreshLobby(); };
  close && (close.onclick = () => { modal.style.display = 'none'; });
}

export async function refreshLobby(){
  const statusEl = document.getElementById('lobbyStatus');
  const listEl   = document.getElementById('tablesList');
  if(!statusEl || !listEl) return;
  statusEl.textContent = '⏳ Buscando mesas...';
  const serverTables = await getServerTables();
  const known = (state.knownTables||[]).map(t => ({ id:t.id, name:t.name, type:'on-chain', address:t.address, players: t.players||0, maxPlayers:t.maxPlayers||6, phase:t.phase||'waiting', pot:t.pot||0 }));
  const tables = [...serverTables.map(t=>({ ...t, type:'off-chain' })), ...known];
  statusEl.textContent = tables.length ? `🎯 ${tables.length} mesa(s)` : '😴 Nenhuma mesa pública.';
  listEl.innerHTML = '';
  for(const t of tables){ listEl.appendChild(card(t)); }
}

function card(table){
  const wrap = document.createElement('div'); wrap.className = 'table-card';
  wrap.innerHTML = `
    <div class="table-header">
      <h3>${escapeHtml(table.name||table.id)}</h3>
      <span class="table-badge ${table.type === 'on-chain' ? 'on-chain':'off-chain'}">
        ${table.type === 'on-chain' ? '⛓️ On-Chain' : '🎮 Off-Chain'}
      </span>
    </div>
    <div>👥 ${table.players||0}/${table.maxPlayers||6}</div>
    <div class="table-actions">
      <button class="join-btn">${table.type === 'on-chain' ? '⛓️ Entrar (on-chain)' : '🎮 Entrar'}</button>
      ${table.type === 'on-chain' && table.address ? `<button class="btn-secondary btn-sm view">🔍 Ver Contrato</button>` : ''}
    </div>`;
  wrap.querySelector('.join-btn').onclick = async () => {
    try{
      if (table.type === 'on-chain') {
        await setActiveTableById(table.id || table.name);
        showMessage(`Mesa ${table.name||table.id} conectada. Abra o modal Blockchain para jogar.`);
      } else {
        showMessage("Conectado à mesa off-chain (server).");
      }
      const modal = document.getElementById('lobbyModal'); if (modal) modal.style.display = 'none';
    }catch(e){ showMessage(`Erro ao entrar: ${e?.message||e}`, true); }
  };
  if (table.type === 'on-chain' && table.address) {
    wrap.querySelector('.view').onclick = () => window.open(`https://testnet.bscscan.com/address/${table.address}`, '_blank');
  }
  return wrap;
}
