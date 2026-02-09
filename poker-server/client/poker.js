// poker.js - Lógica do front-end para o ZodPoker Multiplayer
// (linkWallet + múltiplas mesas + settle pelo servidor com distribuição correta)

let socket = null;
let gameState = {
  mySeat: -1,
  myPlayerId: null,
  players: [],
  phase: 'waiting',
  pot: 0,
  board: [],
  activePos: -1,
  dealerPos: -1,
  currentBet: 0,
  myHole: [],
  tournamentId: null,
  tableIdText: 'default'
};

const phaseNames = {
  waiting: 'Aguardando',
  preflop: 'Pré-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown'
};

const DEFAULT_SERVER = 'http://localhost:3001';

/* ===================== HELPERS ===================== */

function getElementById(id) { return document.getElementById(id); }
function getServerUrl() { return getElementById('serverUrl')?.value.trim() || DEFAULT_SERVER; }
function safeNumber(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function isAddress(a){ try { return !!(window.ethers && window.ethers.isAddress(a)); } catch { return false; } }

function setScreenVisibility({ login=false, game=false, ranking=false, tournament=false }) {
  if (getElementById('loginScreen')) getElementById('loginScreen').style.display = login ? 'block' : 'none';
  if (getElementById('gameContainer')) getElementById('gameContainer').classList.toggle('active', !!game);
  if (getElementById('rankingScreen')) getElementById('rankingScreen').style.display = ranking ? 'block' : 'none';
  if (getElementById('tournamentScreen')) getElementById('tournamentScreen').style.display = tournament ? 'block' : 'none';
}

// Sub-abas (comprar/vender)
function openTab(evt, subId) {
  const container = evt.currentTarget.closest('.buy-sell-section');
  if (!container) return;
  container.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
  container.querySelectorAll('.subtab-content').forEach(s => s.classList.remove('active'));
  evt.currentTarget.classList.add('active');
  const target = document.getElementById(subId);
  if (target) target.classList.add('active');
}

async function fetchBlockchainStatus() {
  try {
    const r = await fetch(`${getServerUrl()}/api/blockchain/status`, { cache: 'no-store' });
    return await r.json();
  } catch { return null; }
}

function hasContractsReady() {
  try {
    return !!(window.contracts &&
      window.contracts.chips?.target &&
      window.contracts.table?.target &&
      window.contracts.cashier?.target);
  } catch { return false; }
}

/* === FIX: suporte a layout retrato para os controles === */
let _controlsPinned = false;
function updatePortraitClass(enable) {
  _controlsPinned = !!enable;
  const body = document.body || document.documentElement;
  const isPortrait =
    (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) ||
    (window.innerHeight > window.innerWidth);
  body.classList.toggle('portrait-game', _controlsPinned && isPortrait);
}
window.addEventListener('resize', () => updatePortraitClass(_controlsPinned));
window.addEventListener('orientationchange', () => updatePortraitClass(_controlsPinned));

/* ====== Sair da mesa ====== */
window.leaveGame = function leaveGame() {
  try {
    if (socket && socket.connected) {
      socket.emit('leaveTable', { tableId: gameState.tableIdText });
    }
  } catch (e) {
    console.warn('[leaveGame] erro:', e?.message || e);
  } finally {
    gameState.mySeat = -1;
    gameState.myPlayerId = null;
    setScreenVisibility({ login: false, game: false, ranking: false, tournament: false });
    try { showLobby(); } catch {}
    try { window.refreshBalances?.(); } catch {}
    window.showMessage?.('Você saiu da mesa.', false);
  }
};

/* ===================== SOCKET/WALLET LINK ===================== */

function linkWalletIfPossible() {
  try {
    if (!socket?.connected) return;
    const walletAddress = window.userWallet;
    if (!walletAddress || !window.ethers || !window.ethers.isAddress(walletAddress)) return;
    socket.emit('linkWallet', { walletAddress });
    console.log('[linkWallet] enviado:', walletAddress);
  } catch (err) {
    console.warn('[linkWalletIfPossible] falhou:', err);
  }
}

/* ===================== ENTRAR NA MESA ===================== */

async function joinGame(tableIdText = 'default') {
  console.log('[joinGame] tableIdText:', tableIdText);

  const playerName = getElementById('playerName')?.value.trim() || 'Jogador';
  const buyinAmount = safeNumber(getElementById('buyin')?.value, 10000);
  const serverUrl = getServerUrl();

  if (!window.ethers) { window.showMessage?.('Erro: Ethers não carregado.', true); return; }
  if (buyinAmount < 5000 || buyinAmount > 100000) { window.showMessage?.('O buy-in deve estar entre $5000 e $100000!', true); return; }
  if (playerName.length < 3) { window.showMessage?.('Use um nome com pelo menos 3 letras!', true); return; }
  if (typeof window.isWalletConnected === 'undefined') { window.showMessage?.('Erro: poker_web3.js não carregado.', true); return; }

  if (!socket || !socket.connected) {
    console.log('[joinGame] Conectando Socket.IO:', serverUrl);
    socket = io(serverUrl, { transports: ['websocket', 'polling'], reconnection: true });
    window.socket = socket;
    attachCommonHandlers();
  }

  if (!window.isWalletConnected) {
    window.showMessage?.('Conectando a sua wallet...', false);
    const ok = await window.connectWallet?.();
    if (!ok || !window.userWallet || !isAddress(window.userWallet)) {
      window.showMessage?.('Não consegui conectar a wallet. Clique em "Conectar Wallet".', true);
      return;
    }
  }

  linkWalletIfPossible();
  await proceedToJoinGame(tableIdText, playerName, buyinAmount);
}

async function proceedToJoinGame(tableIdText, playerName, buyinAmount) {
  const walletAddress = window.userWallet;
  if (!walletAddress || !isAddress(walletAddress)) {
    window.showMessage?.('Wallet inválida. Reconecte.', true); return;
  }

  if (!hasContractsReady()) {
    try {
      window.showMessage?.('Carregando contratos...', false);
      if (!window.isWalletConnected) {
        const ok = await window.connectWallet?.();
        if (!ok) throw new Error('Wallet não conectada');
      } else {
        await window.loadContracts?.();
      }
    } catch (e) {
      window.showMessage?.('Não consegui carregar contratos.', true); return;
    }
    if (!hasContractsReady()) { window.showMessage?.('Contratos indisponíveis.', true); return; }
  }

  try { await window.refreshBalances?.(); } catch {}

  const status = await fetchBlockchainStatus();
  const blockchainMode = !!status?.enabled || !!status?.blockchainEnabled;

  if (blockchainMode) linkWalletIfPossible();

  if (socket?.connected) {
    emitJoinTable(tableIdText, playerName, buyinAmount);
  } else {
    window.showMessage?.('Conectando ao servidor...', false);
    socket.once('connect', () => emitJoinTable(tableIdText, playerName, buyinAmount));
  }
}

// poker.js
function emitJoinTable(tableIdText, playerName, buyinAmount) {
  console.log('[emitJoinTable]', { tableIdText, playerName, buyinAmount });
  gameState.tableIdText = tableIdText || 'default';
  try {
    localStorage.setItem('poker_last_table', JSON.stringify({ id: tableIdText }));
    window.lastTableIdText = tableIdText; // ajuda os fallbacks do web3
  } catch {}
  socket.emit('joinTable', { tableIdText, name: playerName, buyin: buyinAmount });
}


/* ===================== SOCKET HANDLERS ===================== */

function attachCommonHandlers() {
  if (!socket) return;

  socket.on('connect', () => {
    console.log('[socket] conectado');
    window.showMessage?.('Conectado ao servidor!', false);
    linkWalletIfPossible();
    setWaitingHint(true, 'Aguardando sua vez...');
  });

  socket.on('connect_error', (error) => {
    console.error('[socket] connect_error:', error);
    window.showMessage?.('Erro ao conectar: ' + (error?.message || ''), true);
  });

  socket.on('disconnect', () => {
    console.log('[socket] disconnect');
    window.showMessage?.('Desconectado do servidor.', true);
  });

  // Lobby
  socket.on('tableList', () => {
    if (getElementById('lobbyModal')?.style.display === 'block') {
      refreshLobby?.();
    }
  });

  // Atualizações de mesa
  socket.on('tableUpdated', (table) => updateTableCard?.(table));
  socket.on('errorMsg', (message) => {
    console.error('[server error]', message);
    window.showMessage?.(message, true);
  });

  // Jogo
  socket.on('seated', onSeated);
  socket.on('state', updateState);
  socket.on('hole', receiveHole);
  socket.on('actionRequest', handleActionRequest);
  socket.on('reveal', revealCards);
  socket.on('handEnded', handleHandEnd);
  socket.on('playerJoined', handlePlayerJoined);
  socket.on('playerLeft', handlePlayerLeft);
  socket.on('playerDisconnected', handlePlayerDisconnected);

  // Fluxo blockchain (sucesso do settlement feito pelo servidor)
  socket.on('blockchainRoundSettled', async () => {
    try {
      window.showMessage?.('✅ Settlement confirmado. Atualizando saldos...', false);
      hideSettleBar();
      hideWinnerOverlays(); // some o overlay quando liquidar
      try { await window.refreshBalances?.(); } catch {}
      updateGameBalance();
    } catch (e) {
      console.warn('[UI] pós-settle:', e);
    }
  });

  // Apenas informativo (servidor envia a payload assinada)
  socket.on('settlementData', (payload) => {
    console.log('[settlementData recebido]', payload);
  });

  // Chat
  socket.on('chatMessage', (data) => displayChatMessage(data));

  // Mensagens do sistema/erros
  socket.on('systemMessage', (message) => window.showMessage?.(message, false));
  socket.on('errorMsg', (message) => window.showMessage?.(message, true));

  // Lock / desbloqueio
  socket.on('roundLocked', ({ tableId }) => {
    showUnlockTableButton(tableId, 'Round ativo impede assentos/depositos. Forçar zero-settlement?');
  });
  socket.on('systemMessage', (m) => maybeShowUnlockFromMsg(m));
  socket.on('errorMsg', (m) => maybeShowUnlockFromMsg(m));

  attachBlockchainEventListeners();
}

/* ===================== UI / SHOWDOWN ===================== */

window.showWinnersUI = window.showWinnersUI || function (winners = []) {
  try {
    const txt = winners.map(w => {
      const hand = w.hand || w.handName || '';
      const pot = (w.potAmount != null) ? ` +${w.potAmount}` : '';
      return `🏆 ${w.name} ${hand ? `(${hand})` : ''}${pot}`;
    }).join(' | ');
    const el = document.getElementById('statusMsg');
    if (el) el.textContent = txt || 'Mão encerrada.';
    window.showMessage?.(txt || 'Mão encerrada.', false);
  } catch (e) { console.warn('[showWinnersUI] falhou:', e); }
};

function getSeatIndexByPlayerId(pid) {
  try { return (window.gameState?.players || []).findIndex(p => p && p.id === pid); } catch { return -1; }
}
function getSeatElementByPidOrSeat({ id, seat }) {
  const byPid = id ? document.querySelector(`.seat[data-player-id="${id}"]`) : null;
  const idx = (typeof seat === 'number') ? seat : getSeatIndexByPlayerId(id);
  return byPid || document.querySelector(`.seat[data-seat-index="${idx}"]`) || document.getElementById(`seat-${idx}`);
}

let _winnerHideTimer = null;
function clearWinnerOverlays() { document.querySelectorAll('.winner-overlay').forEach(el => el.remove()); }
function hideWinnerOverlays() {
  clearTimeout(_winnerHideTimer);
  _winnerHideTimer = null;
  document.querySelectorAll('.winner-overlay').forEach(el => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 250);
  });
}

window.renderAllPlayersHands = function (allHands = [], _board = []) {
  try {
    clearWinnerOverlays();
    const winners = allHands.filter(h => h.isWinner || h.winner || h.rank === 1);
    const show = winners.length ? winners : allHands.slice(0, 1);
    show.forEach(w => {
      const seatEl = getSeatElementByPidOrSeat({ id: w.id, seat: w.seat });
      if (!seatEl) return;
      seatEl.querySelector('.winner-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'winner-overlay';
      const handName = w.handName || w.hand || '';
      const hole2 = (w.cards || []).slice(0, 2);
      overlay.innerHTML = `
        <div class="hand-name">${handName}</div>
        <div class="cards">
          ${hole2.map(c => `<span class="mini-card">${c.r}${c.s}</span>`).join('')}
        </div>
      `;
      seatEl.appendChild(overlay);
    });

    // fallback: some sozinho após 7s
    clearTimeout(_winnerHideTimer);
    _winnerHideTimer = setTimeout(() => hideWinnerOverlays(), 7000);
  } catch (e) { console.warn('[renderAllPlayersHands] falhou:', e); }
};

function hideSettleBar() { const bar = document.getElementById('settleBar'); if (bar) bar.style.display = 'none'; }
// --- BOTÃO "DESTRAVAR MESA (force zero-settle)" ------------------------
function showUnlockTableButton(tableIdText, reasonText) {
  const id = 'unlockTableBar';
  let bar = document.getElementById(id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = id;
    bar.style.cssText = [
      'position:fixed','bottom:16px','right:16px','z-index:9999',
      'background:#111','color:#fff','padding:12px 14px','max-width:360px',
      'border:1px solid rgba(255,255,255,.25)','border-radius:12px',
      'box-shadow:0 6px 18px rgba(0,0,0,.35)','font:14px/1.4 system-ui'
    ].join(';');
    bar.innerHTML = `
      <div id="unlockMsg" style="margin-bottom:8px;">
        ⚠️ Mesa bloqueada aguardando settlement anterior.
        <div style="opacity:.8;margin-top:4px" id="unlockWhy"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="unlockClose"
          style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:#374151;color:#fff;cursor:pointer">
          Fechar
        </button>
        <button id="unlockBtn"
          style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:#10b981;color:#fff;cursor:pointer">
          Destravar mesa
        </button>
      </div>`;
    document.body.appendChild(bar);
    bar.querySelector('#unlockClose').onclick = () => bar.remove();
  }
  bar.dataset.tableId = tableIdText || (window.gameState?.tableIdText ?? 'default');
  bar.style.display = 'block';
  const why = bar.querySelector('#unlockWhy');
  if (why) why.textContent = reasonText ? String(reasonText) : '';

  const btn = bar.querySelector('#unlockBtn');
  btn.onclick = async () => {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Enviando...';
    const tid = bar.dataset.tableId;
    try {
      const res = await fetch(`${getServerUrl()}/api/force-settle-zero/${encodeURIComponent(tid)}`, { method: 'POST' });
      const data = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha no servidor');
      window.showMessage?.('✅ Settlement zero enviado. Aguarde a confirmação.', false);
      btn.textContent = 'Enviado!';
      setTimeout(() => bar.remove(), 1500);
    } catch (e) {
      window.showMessage?.('❌ Falha ao destravar: ' + (e?.message || e), true);
      btn.disabled = false;
      btn.textContent = old;
    }
  };
}

// helper: liga mensagens do servidor ao botão
const _LOCK_PATTERNS = [
  /round ativo/i,
  /round on-chain.*ativo/i,
  /aguardando.*inatividade/i,
  /após settlement/i,
  /aguarde.*settlement/i
];
function maybeShowUnlockFromMsg(message) {
  try {
    if (!message) return;
    if (_LOCK_PATTERNS.some((re) => re.test(String(message)))) {
      showUnlockTableButton(window.gameState?.tableIdText, message);
    }
  } catch {}
}

// expõe se quiser chamar manualmente via console
window.forceZeroSettleCurrent = function () {
  showUnlockTableButton(window.gameState?.tableIdText);
};

function handleHandEnd({ winners = [], allHands = [], reason = '', board = [] }) {
  console.log('[UI] handEnded', winners, reason);
  try {
    const bar = document.getElementById('settleBar');
    if (bar) bar.style.display = 'block';
    const msg = document.getElementById('statusMsg');
    if (msg) msg.textContent = 'Mão encerrada. Clique em "Finalizar mão" para liquidar on-chain.';
  } catch {}
  try { window.showWinnersUI(winners); } catch {}
  try { if (allHands?.length) window.renderAllPlayersHands(allHands, board); } catch {}
  try { if (reason) window.showMessage?.(`📝 ${reason}`, false); } catch {}
}

function setWaitingHint(show, text = 'Aguardando sua vez...') {
  const placeholder = document.querySelector('.controls-placeholder');
  if (!placeholder) return;
  placeholder.textContent = show ? text : '';
  placeholder.classList.toggle('is-visible', !!show);
}

/* ===================== CALLBACKS DE JOGO ===================== */

function onSeated(data) {
  console.log('[seated] ', data);
  gameState.mySeat = data.seat;
  gameState.myPlayerId = data.playerId;
  gameState.tableIdText = data.tableId || gameState.tableIdText;
  try {
    // persiste p/ os fallbacks do web3
    localStorage.setItem('poker_last_table', JSON.stringify({ id: gameState.tableIdText }));
    window.lastTableIdText = gameState.tableIdText;
    // pede p/ o web3 resolver o endereço da mesa atual (via factory)
    window.setCurrentTableContext?.({ idText: gameState.tableIdText });
  } catch(e) { console.warn('[onSeated] persist ctx fail:', e); }

  gameState.tournamentId = data.tableId !== 'default' && !String(data.tableId).startsWith('t-') ? data.tableId : null;

  setScreenVisibility({ login: false, game: true, ranking: false, tournament: false });
  window.showMessage?.(`Você sentou no assento ${data.seat + 1}`, false);
  initSeats(gameState.players.length);

  try { linkWalletIfPossible(); } catch {}
  window.refreshBalances?.();
  setTimeout(() => updateGameBalance(), 300);
}

function updateState(state) {
  const prevPhase = gameState.phase;

  gameState.players   = state.players || [];
  gameState.phase     = state.phase || gameState.phase;
  gameState.pot       = state.pot ?? gameState.pot;
  gameState.board     = state.board || gameState.board;
  gameState.activePos = state.activeSeat ?? gameState.activePos;
  gameState.dealerPos = state.dealerSeat ?? gameState.dealerPos;
  gameState.currentBet= state.currentBet ?? gameState.currentBet;

  if (gameState.players.length !== document.querySelectorAll('.seat').length) {
    initSeats(gameState.players.length);
  }

  const phaseElement = getElementById('phase');
  if (phaseElement) phaseElement.textContent = phaseNames[gameState.phase] || 'Aguardando...';

  const potElement = getElementById('pot');
  if (potElement) potElement.textContent = `$${Number(gameState.pot).toLocaleString()}`;

  renderBoard();
  updateSeats();

  // ao sair de showdown para preflop/aguardando, some com o overlay
  if ((prevPhase === 'showdown' || prevPhase === 'river') &&
      (gameState.phase === 'waiting' || gameState.phase === 'preflop')) {
    hideWinnerOverlays();
  }
}

function receiveHole({ cards }) { gameState.myHole = cards || []; renderMyHole(); }

/* ===================== CONTROLES ===================== */

function renderControlsUI({ toCall = 0, minRaise = 100, maxRaise = 0 }) {
  const el = document.getElementById('controls');
  if (!el) return;

  const fmt = (n) => Number(n || 0).toLocaleString();

  const allowShortAllIn = maxRaise > 0 && maxRaise < minRaise;
  const sliderMin  = allowShortAllIn ? 1 : Math.max(1, minRaise);
  const sliderMax  = Math.max(0, maxRaise);
  const sliderStep = allowShortAllIn ? 1 : minRaise;
  const canRaise   = sliderMax > 0;
  const isCall     = toCall > 0;

  const initial = Math.min(sliderMax, Math.max(sliderMin, sliderMin));

  el.innerHTML = `
    <div class="control-panel">
      <div class="control-row">
        <button class="btn-pill btn-fold"  data-act="fold">Fold</button>
        <button class="btn-pill btn-check" data-act="${isCall ? 'call' : 'check'}">
          ${isCall ? `Call $${fmt(toCall)}` : 'Check'}
        </button>
        <button class="btn-pill btn-raise" data-act="raise" ${!canRaise ? 'disabled' : ''}>Raise</button>
        ${(isCall || canRaise) ? `<button class="btn-pill btn-allin" data-act="all-in">ALL-IN</button>` : `<span></span>`}
      </div>

      <div class="raise-row" style="display:${canRaise ? 'grid' : 'none'}">
        <div class="range-wrap">
          <input type="range" id="raiseRange"
                 min="${sliderMin}" max="${sliderMax}" step="${sliderStep}"
                 value="${initial}">
        </div>
        <input id="raiseValueInput" class="bet-input" type="number"
               min="${sliderMin}" max="${sliderMax}" step="${sliderStep}"
               value="${initial}">
      </div>

      <div class="info-row">
        <div class="item"><span>Mín. raise:</span> <span class="value">${fmt(minRaise)}</span></div>
        <div class="item"><span>Máx. raise:</span> <span class="value">${fmt(sliderMax)}</span></div>
        <div class="item"><span>To call:</span>    <span class="value">${fmt(toCall)}</span></div>
      </div>
    </div>
  `;

  // liga slider <-> input
  const range = el.querySelector('#raiseRange');
  const input = el.querySelector('#raiseValueInput');
  if (range && input) {
    const clamp = (v) => Math.max(Number(range.min), Math.min(Number(range.max), Number(v||0)));
    range.addEventListener('input', () => { input.value = range.value; });
    input.addEventListener('input', () => { input.value = clamp(input.value); range.value = input.value; });
  }

  // ações
  el.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      const payload = { tableId: gameState.tableIdText, action: act };
      if (act === 'raise') payload.amount = Number(range?.value || input?.value || 0);
      socket.emit('playerAction', payload);
      hideControlsUI();
      setWaitingHint(true, 'Aguardando sua vez...');
    });
  });

  // ativa o modo retrato quando controles estão abertos
  updatePortraitClass(true);
}

function hideControlsUI() {
  const el = document.getElementById('controls');
  if (el) el.innerHTML = '';
  updatePortraitClass(false); // mantém layout correto ao esconder
}

function handleActionRequest(data = {}) {
  setWaitingHint(false, 'Sua vez de agir');
  renderControlsUI({
    toCall:   Number(data.toCall)   || 0,
    minRaise: Number(data.minRaise) || 100,
    maxRaise: Number(data.maxRaise) ?? 0
  });
}

function revealCards({ seat, hole, cards }) {
  const seatElement = document.getElementById(`seat-${seat}`);
  if (!seatElement) return;
  const holeElement = seatElement.querySelector('.hole');
  const revealed = hole || cards || [];
  if (holeElement) {
    holeElement.innerHTML = revealed.map(renderCardHTML).join('');
    holeElement.classList.add('show');
  }
}

function handlePlayerJoined({ name, seat }) { window.showMessage?.(`${name} entrou (assento ${seat + 1}).`, false); }
function handlePlayerLeft({ name, seat }) { window.showMessage?.(`${name} saiu (assento ${seat + 1}).`, false); }
function handlePlayerDisconnected({ name, seat }) { window.showMessage?.(`${name} desconectou (assento ${seat + 1}).`, true); }

/* ===================== RENDER / UI ===================== */

function initSeats(seatCount = 6) {
  const seatsContainer = getElementById('seats');
  if (!seatsContainer) return;

  seatsContainer.innerHTML = '';
  for (let i = 0; i < seatCount; i++) {
    const seat = document.createElement('div');
    seat.className = `seat seat-${i}`;
    seat.id = `seat-${i}`;
    seat.setAttribute('data-seat-index', i);
    seat.innerHTML = `
      <div class="avatar">🂠</div>
      <div class="meta">
        <div class="name">Vago</div>
        <div class="stack">$0</div>
        <div class="player-bet"></div>
      </div>
      <div class="hole"></div>
      <div class="all-in" style="display:none">ALL-IN</div>
    `;
    seatsContainer.appendChild(seat);
  }
}

function updateSeats() {
  for (let i = 0; i < gameState.players.length; i++) {
    const player = gameState.players[i];
    const seatElement = getElementById(`seat-${i}`);
    if (!seatElement) continue;

    seatElement.setAttribute('data-seat-index', i);
    if (player) {
      seatElement.setAttribute('data-player-id', player.id || '');
      const nameElement = seatElement.querySelector('.name');
      const stackElement = seatElement.querySelector('.stack');
      const betElement = seatElement.querySelector('.player-bet');

      nameElement.textContent = `${player.name}${i === gameState.dealerPos ? ' (D)' : ''}`;
      stackElement.textContent = `$${Number(player.stack).toLocaleString()}`;

      const parts = [];
      if (player.folded) parts.push('Fold');
      if (player.allIn) parts.push('All-in');
      if (player.lastAction) parts.push(player.lastAction);
      betElement.textContent = parts.join(' | ');

      seatElement.classList.toggle('active', i === gameState.activePos);
      seatElement.classList.toggle('folded', !!player.folded);
      seatElement.classList.toggle('disconnected', !!player.disconnected);
      seatElement.classList.toggle('all-in', !!player.allIn);
    } else {
      seatElement.removeAttribute('data-player-id');
      const nameElement = seatElement.querySelector('.name');
      const stackElement = seatElement.querySelector('.stack');
      const betElement = seatElement.querySelector('.player-bet');

      nameElement.textContent = 'Vago';
      stackElement.textContent = '$0';
      betElement.textContent = '';
      seatElement.classList.remove('active', 'folded', 'disconnected', 'all-in');
    }
  }
}

function renderBoard() {
  const boardElement = getElementById('board');
  if (!boardElement) return;
  boardElement.innerHTML = (gameState.board || []).map(renderCardHTML).join('');
}

function renderMyHole() {
  const mySeatElement = getElementById(`seat-${gameState.mySeat}`);
  if (!mySeatElement) return;
  const holeElement = mySeatElement.querySelector('.hole');
  if (!holeElement) return;
  holeElement.innerHTML = (gameState.myHole || []).map(renderCardHTML).join('');
  holeElement.classList.toggle('show', (gameState.myHole || []).length > 0);
}

function renderCardHTML(card) {
  const isRed = card?.s === '♥' || card?.s === '♦';
  return `
    <div class="h-card ${isRed ? 'is-red' : ''}">
      <div class="h-rank">${card?.r || ''}</div>
      <div class="h-suit">${card?.s || ''}</div>
    </div>
  `;
}

/* ===================== CHAT ===================== */

function toggleChat() {
  const panel = getElementById('chatPanel');
  if (!panel) return;
  panel.style.display = (panel.style.display === 'none') ? '' : 'none';
}

function sendChatMessage() {
  const input = getElementById('chatInput');
  if (!input || !socket) return;
  const rawMessage = input.value.trim();
  if (!rawMessage) return;

  socket.emit('sendMessage', {
    tableId: gameState.tableIdText || 'default',
    message: rawMessage
  });

  input.value = '';
}

function displayChatMessage(payload) {
  const text = payload?.text ?? payload?.message ?? '';
  const from = payload?.name || 'Anon';
  const seat = (typeof payload?.seat === 'number') ? payload.seat : gameState.mySeat;

  const chatBox = getElementById('chatMessages') || getElementById('chatBox');
  if (chatBox) {
    const messageLine = document.createElement('div');
    messageLine.className = 'chat-line';
    messageLine.textContent = `${from}: ${text}`;
    chatBox.appendChild(messageLine);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  showSpeechBubble(seat, text);
}

function showSpeechBubble(seat, text) {
  try {
    const seatElement = getElementById(`seat-${seat}`);
    if (!seatElement) return;

    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    Object.assign(bubble.style, {
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: '8px',
      maxWidth: '220px',
      background: 'rgba(17,24,39,0.95)',
      color: '#fff',
      borderRadius: '12px',
      padding: '6px 10px',
      fontSize: '12px',
      lineHeight: '1.3',
      border: '1px solid rgba(255,255,255,.25)',
      pointerEvents: 'none',
      zIndex: 5,
      whiteSpace: 'pre-wrap'
    });
    bubble.textContent = text;
    seatElement.appendChild(bubble);
    setTimeout(() => bubble.remove(), 5000);
  } catch (error) {
    console.warn('[showSpeechBubble] erro:', error);
  }
}

/* ===================== RANKING / TORNEIOS ===================== */

function showRankingScreen() {
  socket?.emit('getRanking');
  setScreenVisibility({ login: false, game: false, ranking: true, tournament: false });
}
function hideRankingScreen() { setScreenVisibility({ login: true, game: false, ranking: false, tournament: false }); }
function showTournamentScreen() {
  socket?.emit('getTournaments');
  setScreenVisibility({ login: false, game: false, ranking: false, tournament: true });
}
function hideTournamentScreen() { setScreenVisibility({ login: true, game: false, ranking: false, tournament: false }); }

function showRanking(data) {
  const rankingBody = getElementById('rankingBody');
  if (!rankingBody) return;
  rankingBody.innerHTML = '';
  (data || []).forEach((rank, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${rank.playerId}</td>
      <td>${rank.points}</td>
      <td>${rank.hands}</td>
      <td>${rank.tournaments}</td>
      <td>${rank.wins}</td>
      <td>${rank.tourneyWins || 0}</td>
    `;
    rankingBody.appendChild(row);
  });
}

function updateTournamentList(data) {
  const tournamentBody = getElementById('tournamentBody');
  if (!tournamentBody) return;
  tournamentBody.innerHTML = '';
  (data || []).forEach(tournament => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${tournament.name}</td>
      <td>$${Number(tournament.buyIn).toLocaleString()}</td>
      <td>${tournament.players}/${tournament.maxPlayers}</td>
      <td>${tournament.status}</td>
      <td>$${Number(tournament.prizePool).toLocaleString()}</td>
      <td><button class="join-btn" onclick="joinTournament('${tournament.id}')">Entrar</button></td>
    `;
    tournamentBody.appendChild(row);
  });
}

function joinTournament(tournamentId) {
  const buyin = safeNumber(getElementById('tournamentBuyin')?.value, 10000);
  const name = getElementById('playerName')?.value.trim() || 'Jogador';
  socket?.emit('joinTournament', { tournamentId, name, buyin });
}

/* ===================== EXTRAS / BINDINGS ===================== */

function updateGameBalance() {
  if (gameState.mySeat >= 0 && gameState.players[gameState.mySeat]) {
    console.log('[updateGameBalance] Saldo atualizado no jogo');
    updateSeats();
  }
}

function attachBlockchainEventListeners() {
  if (!socket) return;

  socket.on('blockchainDeposit', (data) => {
    if (window.userWallet && data.player?.toLowerCase() === window.userWallet.toLowerCase()) {
      window.showMessage(`✅ ${data.amount} CHIPS depositados`, false);
      updateGameBalance();
    }
  });

  socket.on('blockchainWithdraw', (data) => {
    if (window.userWallet && data.player?.toLowerCase() === window.userWallet.toLowerCase()) {
      window.showMessage(`✅ ${data.amount} CHIPS sacados`, false);
      updateGameBalance();
    }
  });
  socket.on('blockchainSeated', ({ player }) => {
    if (window.userWallet && player?.toLowerCase() === window.userWallet.toLowerCase()) {
      window.showMessage('✅ Você foi sentado on-chain. Agora é possível depositar fichas.', false);
    }
  });

}

/* ===================== BOTÃO DE SETTLE ===================== */

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('settleBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      const msg = document.getElementById('statusMsg');
      if (msg) msg.textContent = 'Finalizando e liquidando on-chain...';

      // ao clicar em finalizar, já ocultamos os overlays após um pequeno delay
      setTimeout(() => hideWinnerOverlays(), 1200);

      socket.emit('finalizeHand', { tableId: gameState.tableIdText });
    } catch (e) {
      console.error('[settleBtn] Erro:', e?.message || e);
      window.showMessage?.('Falha ao finalizar mão: ' + (e?.message || e), true);
    } finally {
      btn.disabled = false;
    }
  });
});

/* ===================== EXPORTS ===================== */

window.joinGame = joinGame;
window.showRankingScreen = showRankingScreen;
window.hideRankingScreen = hideRankingScreen;
window.showTournamentScreen = showTournamentScreen;
window.hideTournamentScreen = hideTournamentScreen;
window.sendChatMessage = sendChatMessage;
window.toggleChat = toggleChat;
window.updateGameBalance = updateGameBalance;
window.attachBlockchainEventListeners = attachBlockchainEventListeners;
window.showRanking = showRanking;
window.updateTournamentList = updateTournamentList;

console.log('[poker.js] carregado (múltiplas mesas + settle pelo servidor).');
