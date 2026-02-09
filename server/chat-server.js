// chat-server.js
// ===============================
// CHAT SERVER SOCKET.IO - PRODUÇÃO
// Mini-Rede Social ZOD
// ===============================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// ===============================
// CONFIG
// ===============================
const PORT = process.env.CHAT_PORT || 3011;
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const BANS_FILE = path.join(__dirname, 'bans.json');
const PRIVATE_MESSAGES_FILE = path.join(__dirname, 'private_messages.json');
const POLLS_FILE = path.join(__dirname, 'polls.json');
const MAX_MESSAGES = 500;
const MAX_PRIVATE_MESSAGES = 100; // Per conversation
const RATE_LIMIT_MS = 3000;

// BSC Mainnet RPCs (fallback list)
const BSC_RPCS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org'
];

// Contract Addresses (BSC Mainnet - PRODUÇÃO)
const CONTRACTS = {
  ZOD: '0xeD0e0d988DA8C70250671c3b03dCF7249142a045',
  ECONOMY: '0xA9e1f23da4A25Bd566398b6c3cFeDE63b56eeE44'
};

// ABIs mínimos (baseado nos contratos reais)
const ZOD_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

const ECONOMY_ABI = [
  // userMiningStates retorna struct com 18 campos uint256
  // [0]=miningPowerRate, [5]=licenseExpiryTimestamp, [17]=registrationTimestamp
  'function userMiningStates(address user) external view returns (uint256 miningPowerRate, uint256 remainingMinableBalance, uint256 lastStateUpdateTime, uint256 claimableBalance, uint256 totalMinedLifetime, uint256 licenseExpiryTimestamp, uint256 lastClaimTimestamp, uint256 miningCompletionTimestamp, uint256 totalMiningBoostReceived, uint256 totalReferralBonusReceived, uint256 totalMiningBoostLost, uint256 totalReferralBonusLost, uint256 lifetimeMiningBoostCount, uint256 lifetimeReferralBonusCount, uint256 totalPenaltyPaid, uint256 penaltyCount, uint256 accumulatedMiningPowerUSDSeconds, uint256 registrationTimestamp)',
  'function userTotalInvestedUSD(address user) external view returns (uint256)',
  'function isUserActivated(address user) external view returns (bool)'
];

// Criar provider com fallback
let currentRpcIndex = 0;
let provider = new ethers.providers.JsonRpcProvider(BSC_RPCS[currentRpcIndex]);
let zodContract = new ethers.Contract(CONTRACTS.ZOD, ZOD_ABI, provider);
let economyContract = new ethers.Contract(CONTRACTS.ECONOMY, ECONOMY_ABI, provider);

// Função para trocar RPC em caso de erro
function switchRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % BSC_RPCS.length;
  console.log(`🔄 Trocando para RPC: ${BSC_RPCS[currentRpcIndex]}`);
  provider = new ethers.providers.JsonRpcProvider(BSC_RPCS[currentRpcIndex]);
  zodContract = new ethers.Contract(CONTRACTS.ZOD, ZOD_ABI, provider);
  economyContract = new ethers.Contract(CONTRACTS.ECONOMY, ECONOMY_ABI, provider);
}

// ===============================
// ADMINS (on-chain sync)
// ===============================
const ADMIN_ADDRESSES = [
  '0xEb1C187A7F6cD92E86032aBE2808419d78cECa38',
  '0xf0257B4CDD252A7DCA256851C629bA010f016024',
  '0x0D13772949BE231bE366C0eC4D9FD0FB958F12ec',
  '0x2E7436C7aE904eF4b1004665e1F6043a52419F1c',
  '0x59a85D2722031D483eC5dD2a87D18b2c18ce97C9'
].map(a => a.toLowerCase());

// ===============================
// STATUS THRESHOLDS (USD)
// ===============================
const STATUS_CONFIG = {
  ELITE: { minInvested: 10000, emoji: '🟡', label: 'Elite' },
  STRONG: { minInvested: 1000, emoji: '🟣', label: 'Minerador Forte' },
  MEDIUM: { minInvested: 100, emoji: '🔵', label: 'Minerador Médio' },
  ACTIVE: { minInvested: 10, emoji: '🟢', label: 'Minerador Ativo' },
  HOLDER: { minInvested: 0, emoji: '⚪', label: 'Holder' }
};

// ===============================
// BADGES VISUAIS (identidade social)
// ===============================
// OG = registrou nos primeiros 30 dias do contrato (timestamp do deploy)
const CONTRACT_DEPLOY_TIMESTAMP = 1700000000; // ajustar para o timestamp real do deploy
const OG_WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 dias

function calculateBadges(userData, address, messageStats) {
  const badges = [];
  const addrLower = address.toLowerCase();

  // Admin / Moderador
  if (ADMIN_ADDRESSES.includes(addrLower)) {
    badges.push({ id: 'mod', emoji: '🛡️', label: 'Moderador', color: '#ef4444' });
  }

  // OG - registrou cedo
  if (userData.registrationTimestamp > 0 &&
      userData.registrationTimestamp <= CONTRACT_DEPLOY_TIMESTAMP + OG_WINDOW_SECONDS) {
    badges.push({ id: 'og', emoji: '🟢', label: 'OG', color: '#22c55e' });
  }

  // Whale - investiu $50k+
  if (userData.investedUSD >= 50000) {
    badges.push({ id: 'whale', emoji: '🐋', label: 'Whale', color: '#3b82f6' });
  }

  // Diamond Hands - holder com $1k+ e licença ativa
  if (userData.investedUSD >= 1000 && userData.hasActiveLicense) {
    badges.push({ id: 'diamond', emoji: '💎', label: 'Diamond Hands', color: '#8b5cf6' });
  }

  // Top Engajamento - muitas reações recebidas
  const stats = messageStats?.get(addrLower);
  if (stats && stats.totalReactionsReceived >= 50) {
    badges.push({ id: 'fire', emoji: '🔥', label: 'Top Engajamento', color: '#f97316' });
  }

  // Veterano - registrou há mais de 90 dias
  const now = Math.floor(Date.now() / 1000);
  if (userData.registrationTimestamp > 0 &&
      (now - userData.registrationTimestamp) > 90 * 24 * 60 * 60) {
    badges.push({ id: 'veteran', emoji: '⭐', label: 'Veterano', color: '#eab308' });
  }

  return badges;
}

// ===============================
// REACTIONS DISPONÍVEIS
// ===============================
const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '🔥', '🚀', '💎'];

// ===============================
// COMMUNITY PIN THRESHOLDS
// ===============================
const COMMUNITY_PIN_REACTIONS_TOTAL = 20; // 20 reações totais OU
const COMMUNITY_PIN_DIAMOND = 10; // 10 💎 = auto pin
const COMMUNITY_HIGHLIGHTS_MAX = 10;

// ===============================
// MESSAGE STATS (para badges e leaderboard)
// ===============================
const messageStats = new Map(); // address -> { totalReactionsReceived, totalMentions, messageCount }

function recalculateStats() {
  messageStats.clear();
  for (const msg of messages) {
    const addr = msg.address?.toLowerCase();
    if (!addr) continue;

    if (!messageStats.has(addr)) {
      messageStats.set(addr, { totalReactionsReceived: 0, totalMentions: 0, messageCount: 0 });
    }
    const stats = messageStats.get(addr);
    stats.messageCount++;

    // Contar reações recebidas
    if (msg.reactions) {
      for (const users of Object.values(msg.reactions)) {
        stats.totalReactionsReceived += users.length;
      }
    }

    // Contar menções recebidas de outras mensagens
    if (msg.mentions) {
      for (const mention of msg.mentions) {
        // Procurar quem foi mencionado
        for (const [otherAddr, otherStats] of messageStats.entries()) {
          if (otherAddr.endsWith(mention) || otherAddr.includes(mention)) {
            otherStats.totalMentions++;
          }
        }
      }
    }
  }
}

// ===============================
// TYPING INDICATORS
// ===============================
const typingUsers = new Map(); // address -> timeout

// ===============================
// LEADERBOARD
// ===============================
function getLeaderboard() {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Mensagens do dia
  const todayMessages = messages.filter(m => m.timestamp >= oneDayAgo);
  // Mensagens da semana
  const weekMessages = messages.filter(m => m.timestamp >= oneWeekAgo);

  // Top reagidos do dia
  const topReactedToday = todayMessages
    .map(m => {
      const totalReactions = m.reactions
        ? Object.values(m.reactions).reduce((sum, users) => sum + users.length, 0)
        : 0;
      return { ...m, totalReactions };
    })
    .filter(m => m.totalReactions > 0)
    .sort((a, b) => b.totalReactions - a.totalReactions)
    .slice(0, 10);

  // Mensagem do dia (mais reagida)
  const messageOfDay = topReactedToday[0] || null;

  // Usuários mais reagidos da semana
  const userReactions = {};
  for (const msg of weekMessages) {
    if (!msg.reactions || !msg.address) continue;
    const addr = msg.address.toLowerCase();
    if (!userReactions[addr]) userReactions[addr] = 0;
    for (const users of Object.values(msg.reactions)) {
      userReactions[addr] += users.length;
    }
  }
  const topUsersReacted = Object.entries(userReactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([address, reactions]) => ({ address, reactions }));

  // Usuários mais citados da semana
  const userMentions = {};
  for (const msg of weekMessages) {
    if (!msg.mentions) continue;
    for (const mention of msg.mentions) {
      for (const [addr] of userSockets.entries()) {
        if (addr.endsWith(mention) || addr.includes(mention)) {
          if (!userMentions[addr]) userMentions[addr] = 0;
          userMentions[addr]++;
        }
      }
    }
  }
  const topMentioned = Object.entries(userMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([address, mentions]) => ({ address, mentions }));

  // Usuários mais ativos (mais mensagens)
  const userActivity = {};
  for (const msg of weekMessages) {
    if (!msg.address) continue;
    const addr = msg.address.toLowerCase();
    if (!userActivity[addr]) userActivity[addr] = 0;
    userActivity[addr]++;
  }
  const topActive = Object.entries(userActivity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([address, count]) => ({ address, messageCount: count }));

  return {
    topReactedToday,
    messageOfDay,
    topUsersReacted,
    topMentioned,
    topActive
  };
}

// ===============================
// COMMUNITY HIGHLIGHTS (mensagens auto-pinadas)
// ===============================
let communityHighlights = []; // Mensagens que atingiram threshold

function checkCommunityPin(msg) {
  if (!msg.reactions) return false;

  const totalReactions = Object.values(msg.reactions)
    .reduce((sum, users) => sum + users.length, 0);
  const diamondCount = (msg.reactions['💎'] || []).length;

  if (totalReactions >= COMMUNITY_PIN_REACTIONS_TOTAL || diamondCount >= COMMUNITY_PIN_DIAMOND) {
    // Verificar se já está nos highlights
    if (!communityHighlights.find(h => h.id === msg.id)) {
      communityHighlights.push({
        ...msg,
        highlightedAt: Date.now(),
        totalReactions,
        diamondCount
      });
      // Manter apenas os últimos N
      if (communityHighlights.length > COMMUNITY_HIGHLIGHTS_MAX) {
        communityHighlights = communityHighlights.slice(-COMMUNITY_HIGHLIGHTS_MAX);
      }
      return true; // Novo highlight
    }
  }
  return false;
}

// ===============================
// SOCIAL MEMORY (memória social)
// ===============================
function getSocialMemory() {
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekMessages = messages.filter(m => m.timestamp >= oneWeekAgo);

  // Mensagem mais reagida da semana
  let mostReactedWeek = null;
  let maxReactions = 0;
  for (const msg of weekMessages) {
    if (!msg.reactions) continue;
    const total = Object.values(msg.reactions).reduce((sum, u) => sum + u.length, 0);
    if (total > maxReactions) {
      maxReactions = total;
      mostReactedWeek = { ...msg, totalReactions: total };
    }
  }

  // Usuários em alta (mais crescimento de reações na última semana)
  const trendingUsers = {};
  for (const msg of weekMessages) {
    if (!msg.address || !msg.reactions) continue;
    const addr = msg.address.toLowerCase();
    if (!trendingUsers[addr]) trendingUsers[addr] = { reactions: 0, messages: 0 };
    trendingUsers[addr].messages++;
    for (const users of Object.values(msg.reactions)) {
      trendingUsers[addr].reactions += users.length;
    }
  }
  const trending = Object.entries(trendingUsers)
    .map(([address, data]) => ({
      address,
      score: data.reactions * 2 + data.messages, // Peso maior para reações
      reactions: data.reactions,
      messages: data.messages
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    mostReactedWeek,
    trending,
    communityHighlights: communityHighlights.slice(-5)
  };
}

// ===============================
// POLL SANITIZERS
// ===============================
// Sanitizar enquete para broadcast (sem revelar endereços dos votantes)
function sanitizePoll(poll) {
  return {
    id: poll.id,
    createdBy: poll.createdBy,
    question: poll.question,
    options: poll.options.map(o => ({
      id: o.id,
      text: o.text,
      voteCount: o.votes.length
    })),
    allowMultiple: poll.allowMultiple,
    createdAt: poll.createdAt,
    endsAt: poll.endsAt,
    isActive: poll.isActive,
    totalVotes: poll.totalVotes
  };
}

// Sanitizar enquete para um usuário específico (inclui se votou em cada opção)
function sanitizePollForUser(poll, userAddress) {
  return {
    id: poll.id,
    createdBy: poll.createdBy,
    question: poll.question,
    options: poll.options.map(o => ({
      id: o.id,
      text: o.text,
      voteCount: o.votes.length,
      myVote: userAddress ? o.votes.includes(userAddress) : false
    })),
    allowMultiple: poll.allowMultiple,
    createdAt: poll.createdAt,
    endsAt: poll.endsAt,
    isActive: poll.isActive,
    totalVotes: poll.totalVotes
  };
}

// ===============================
// EXPRESS APP
// ===============================
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const server = http.createServer(app);

// ===============================
// SOCKET.IO
// ===============================
const io = new Server(server, {
  path: '/socket.io/',
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket'],
  allowEIO3: true
});

// ===============================
// DATA PERSISTENCE
// ===============================
function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Erro ao carregar mensagens:', err);
  }
  return [];
}

function saveMessages(list) {
  try {
    const toSave = list.slice(-MAX_MESSAGES);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(toSave, null, 2));
  } catch (err) {
    console.error('Erro ao salvar mensagens:', err);
  }
}

function loadBans() {
  try {
    if (fs.existsSync(BANS_FILE)) {
      const raw = fs.readFileSync(BANS_FILE, 'utf8');
      return new Set(JSON.parse(raw));
    }
  } catch (err) {
    console.error('Erro ao carregar bans:', err);
  }
  return new Set();
}

function saveBans() {
  try {
    fs.writeFileSync(BANS_FILE, JSON.stringify([...bannedAddresses], null, 2));
  } catch (err) {
    console.error('Erro ao salvar bans:', err);
  }
}

// Carrega mensagens privadas
function loadPrivateMessages() {
  try {
    if (fs.existsSync(PRIVATE_MESSAGES_FILE)) {
      const raw = fs.readFileSync(PRIVATE_MESSAGES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Erro ao carregar mensagens privadas:', err);
  }
  return {};
}

// Salva mensagens privadas
function savePrivateMessages() {
  try {
    fs.writeFileSync(PRIVATE_MESSAGES_FILE, JSON.stringify(privateMessages, null, 2));
  } catch (err) {
    console.error('Erro ao salvar mensagens privadas:', err);
  }
}

// Carrega enquetes
function loadPolls() {
  try {
    if (fs.existsSync(POLLS_FILE)) {
      const raw = fs.readFileSync(POLLS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Erro ao carregar enquetes:', err);
  }
  return [];
}

// Salva enquetes
function savePolls() {
  try {
    fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2));
  } catch (err) {
    console.error('Erro ao salvar enquetes:', err);
  }
}

// Gera chave de conversa (ordena addresses para consistência)
function getConversationKey(addr1, addr2) {
  const sorted = [addr1.toLowerCase(), addr2.toLowerCase()].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

let messages = loadMessages();
let pinnedMessages = new Set(); // IDs das mensagens fixadas
let bannedAddresses = loadBans();
let privateMessages = loadPrivateMessages(); // { conversationKey: [messages] }
let polls = loadPolls(); // Array de enquetes

// ===============================
// CACHE DE USUÁRIOS
// ===============================
const userCache = new Map(); // address -> { data, timestamp }
const CACHE_TTL = 60000; // 1 minuto

// ===============================
// CONTROLE DE CONEXÕES
// ===============================
let connectedUsers = 0;
const lastMessageTime = new Map();
const userSockets = new Map(); // address -> socket.id (para notificações)

// ===============================
// FUNÇÕES DE VERIFICAÇÃO
// ===============================
async function getUserData(address, retryCount = 0) {
  const now = Date.now();
  const addrLower = address.toLowerCase();
  const cached = userCache.get(addrLower);

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  console.log(`📡 Buscando dados para: ${addrLower.slice(0, 10)}...`);

  try {
    // Primeiro, apenas verificar saldo ZOD (obrigatório)
    let zodBalanceNum = 0;
    try {
      console.log('  → Chamando balanceOf...');
      const zodBalance = await zodContract.balanceOf(address);
      console.log('  → Balance raw:', zodBalance.toString());
      zodBalanceNum = parseFloat(ethers.utils.formatEther(zodBalance));
      console.log(`  ✓ Saldo ZOD: ${zodBalanceNum}`);
    } catch (e) {
      console.error('  ✗ Erro balanceOf:', e.message);
      // Tentar trocar RPC e retry
      if (retryCount < 3) {
        switchRpc();
        return getUserData(address, retryCount + 1);
      }
      return null;
    }

    // Valores default para usuários sem dados no Economy
    let investedUSD = 0;
    let miningPowerRate = 0;
    let hasActiveLicense = false;
    let registrationTimestamp = 0;

    // Tentar buscar dados do Economy (pode falhar para usuários novos)
    try {
      console.log('  → Chamando Economy contracts...');
      const [miningState, totalInvested] = await Promise.all([
        economyContract.userMiningStates(address),
        economyContract.userTotalInvestedUSD(address)
      ]);

      investedUSD = parseFloat(ethers.utils.formatEther(totalInvested));
      miningPowerRate = parseFloat(ethers.utils.formatEther(miningState[0]));
      const licenseExpiry = Number(miningState[5]);
      registrationTimestamp = Number(miningState[17]);
      hasActiveLicense = licenseExpiry > Math.floor(Date.now() / 1000);
      console.log(`  ✓ Economy: invested=$${investedUSD}, power=${miningPowerRate}`);
    } catch (e) {
      console.log('  ℹ Usuário sem dados no Economy (novo)');
    }

    // Determinar status
    let status;

    if (ADMIN_ADDRESSES.includes(addrLower)) {
      status = { emoji: '🔴', label: 'Administrador', isAdmin: true };
    } else if (investedUSD >= STATUS_CONFIG.ELITE.minInvested) {
      status = { emoji: STATUS_CONFIG.ELITE.emoji, label: STATUS_CONFIG.ELITE.label };
    } else if (investedUSD >= STATUS_CONFIG.STRONG.minInvested) {
      status = { emoji: STATUS_CONFIG.STRONG.emoji, label: STATUS_CONFIG.STRONG.label };
    } else if (investedUSD >= STATUS_CONFIG.MEDIUM.minInvested) {
      status = { emoji: STATUS_CONFIG.MEDIUM.emoji, label: STATUS_CONFIG.MEDIUM.label };
    } else if (investedUSD >= STATUS_CONFIG.ACTIVE.minInvested || miningPowerRate > 0) {
      status = { emoji: STATUS_CONFIG.ACTIVE.emoji, label: STATUS_CONFIG.ACTIVE.label };
    } else {
      status = { emoji: STATUS_CONFIG.HOLDER.emoji, label: STATUS_CONFIG.HOLDER.label };
    }

    const data = {
      zodBalance: zodBalanceNum,
      investedUSD,
      miningPowerRate,
      hasActiveLicense,
      registrationTimestamp,
      status,
      isAdmin: ADMIN_ADDRESSES.includes(addrLower),
      badges: calculateBadges({ investedUSD, miningPowerRate, hasActiveLicense, registrationTimestamp }, address, messageStats)
    };

    console.log(`  ✓ Status: ${status.emoji} ${status.label} | Badges: ${data.badges.map(b => b.emoji).join('')}`);
    userCache.set(addrLower, { data, timestamp: now });
    return data;
  } catch (err) {
    console.error('  ✗ Erro geral getUserData:', err.message);
    if (retryCount < 3) {
      switchRpc();
      return getUserData(address, retryCount + 1);
    }
    return null;
  }
}

function isAdmin(address) {
  return ADMIN_ADDRESSES.includes(address.toLowerCase());
}

function isBanned(address) {
  return bannedAddresses.has(address.toLowerCase());
}

// Extrair menções do texto
function extractMentions(text) {
  const mentionRegex = /@([a-fA-F0-9]{4,})/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  return mentions;
}

// ===============================
// SOCKET EVENTS
// ===============================
io.on('connection', (socket) => {
  connectedUsers++;
  console.log('🟢 Usuário conectado:', socket.id);
  io.emit('userCount', connectedUsers);

  // Envia histórico com mensagens fixadas marcadas (disponível para TODOS, incluindo modo leitura)
  const historyWithPins = messages.slice(-100).map(msg => ({
    ...msg,
    isPinned: pinnedMessages.has(msg.id)
  }));
  socket.emit('messageHistory', historyWithPins);
  socket.emit('availableReactions', AVAILABLE_REACTIONS);
  socket.emit('communityHighlightsList', communityHighlights.slice(-COMMUNITY_HIGHLIGHTS_MAX));

  // Enviar enquetes ativas
  const now = Date.now();
  const activePolls = polls.filter(p => p.isActive && now < p.endsAt).slice(-10);
  socket.emit('pollsList', activePolls.map(p => sanitizePoll(p)));

  // ===============================
  // AUTENTICAR USUÁRIO
  // ===============================
  socket.on('authenticate', async (data) => {
    try {
      const { address } = data;
      if (!address) return;

      const userData = await getUserData(address);

      if (!userData) {
        socket.emit('authResult', { success: false, error: 'Erro ao verificar carteira' });
        return;
      }

      if (userData.zodBalance <= 0) {
        socket.emit('authResult', {
          success: false,
          error: 'Você precisa ter ZOD na carteira para participar do chat'
        });
        return;
      }

      if (isBanned(address)) {
        socket.emit('authResult', {
          success: false,
          error: 'Sua carteira foi banida do chat'
        });
        return;
      }

      // Registrar socket do usuário
      socket.address = address.toLowerCase();
      userSockets.set(socket.address, socket.id);

      socket.emit('authResult', {
        success: true,
        userData: {
          ...userData,
          address: address.toLowerCase()
        }
      });

    } catch (err) {
      console.error('Erro authenticate:', err);
      socket.emit('authResult', { success: false, error: 'Erro de autenticação' });
    }
  });

  // ===============================
  // ENVIAR MENSAGEM
  // ===============================
  socket.on('sendMessage', async (data) => {
    try {
      const { address, message, replyTo, image, audio } = data;

      // Validar que tem mensagem OU imagem OU audio
      if (!address || (!message && !image && !audio)) {
        socket.emit('error', 'Mensagem inválida');
        return;
      }

      if (message && message.length > 500) {
        socket.emit('error', 'Mensagem muito longa');
        return;
      }

      // Validar imagem se enviada
      if (image) {
        // Verificar se é base64 válido de imagem
        if (!image.startsWith('data:image/')) {
          socket.emit('error', 'Formato de imagem inválido');
          return;
        }
        // Limitar tamanho (500KB em base64 ~ 375KB real)
        if (image.length > 500000) {
          socket.emit('error', 'Imagem muito grande (máx 500KB)');
          return;
        }
      }

      // Validar áudio se enviado
      if (audio) {
        // Verificar se é base64 válido de áudio
        if (!audio.startsWith('data:audio/')) {
          socket.emit('error', 'Formato de áudio inválido');
          return;
        }
        // Limitar tamanho (1MB para áudios - mensagens de voz podem ser maiores)
        if (audio.length > 1000000) {
          socket.emit('error', 'Áudio muito grande (máx 1MB)');
          return;
        }
      }

      const addrLower = address.toLowerCase();

      // Verificar ban
      if (isBanned(addrLower)) {
        socket.emit('error', 'Você foi banido do chat');
        return;
      }

      // Verificar ZOD balance
      const userData = await getUserData(address);
      if (!userData || userData.zodBalance <= 0) {
        socket.emit('error', 'Você precisa ter ZOD para enviar mensagens');
        return;
      }

      // Rate limit
      const now = Date.now();
      const last = lastMessageTime.get(addrLower);
      if (last && now - last < RATE_LIMIT_MS) {
        const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
        socket.emit('error', `Aguarde ${wait}s`);
        return;
      }

      // Extrair menções
      const mentions = message ? extractMentions(message) : [];

      const newMessage = {
        id: now.toString(),
        address: addrLower,
        message: message ? message.trim() : '',
        timestamp: now,
        status: userData.status,
        badges: userData.badges || [],
        isAdmin: userData.isAdmin,
        reactions: {},
        mentions,
        replyTo: replyTo || null,
        image: image || null,
        audio: audio || null
      };

      messages.push(newMessage);
      lastMessageTime.set(addrLower, now);

      if (messages.length % 10 === 0) {
        saveMessages(messages);
      }

      io.emit('newMessage', newMessage);

      // Notificar usuários mencionados
      mentions.forEach(mention => {
        // Procurar socketId do usuário mencionado (últimos 4 chars do address)
        for (const [addr, socketId] of userSockets.entries()) {
          if (addr.endsWith(mention) || addr.includes(mention)) {
            io.to(socketId).emit('mentioned', {
              messageId: newMessage.id,
              by: addrLower,
              message: message.substring(0, 50)
            });
            break;
          }
        }
      });

    } catch (err) {
      console.error('Erro sendMessage:', err);
      socket.emit('error', 'Erro ao enviar mensagem');
    }
  });

  // ===============================
  // REAGIR A MENSAGEM
  // ===============================
  socket.on('addReaction', async (data) => {
    try {
      const { address, messageId, reaction } = data;

      if (!address || !messageId || !reaction) return;
      if (!AVAILABLE_REACTIONS.includes(reaction)) return;

      const addrLower = address.toLowerCase();

      // Verificar ZOD
      const userData = await getUserData(address);
      if (!userData || userData.zodBalance <= 0) return;

      const msg = messages.find(m => m.id === messageId);
      if (!msg) return;

      // Inicializar reactions se necessário
      if (!msg.reactions) msg.reactions = {};
      if (!msg.reactions[reaction]) msg.reactions[reaction] = [];

      // Toggle reaction
      const idx = msg.reactions[reaction].indexOf(addrLower);
      if (idx >= 0) {
        msg.reactions[reaction].splice(idx, 1);
        if (msg.reactions[reaction].length === 0) {
          delete msg.reactions[reaction];
        }
      } else {
        msg.reactions[reaction].push(addrLower);
      }

      // Calcular total de reações para a notificação
      const totalReactions = Object.values(msg.reactions)
        .reduce((sum, users) => sum + users.length, 0);

      io.emit('reactionUpdate', {
        messageId,
        reactions: msg.reactions,
        totalReactions,
        reactedBy: addrLower,
        reactionAdded: idx < 0 // true se adicionou, false se removeu
      });

      // Notificar o autor da mensagem sobre a reação
      if (idx < 0 && msg.address && msg.address !== addrLower) {
        const authorSocketId = userSockets.get(msg.address);
        if (authorSocketId) {
          io.to(authorSocketId).emit('reactionNotification', {
            messageId,
            reaction,
            by: addrLower,
            totalReactions,
            messagePreview: (msg.message || '').substring(0, 30)
          });
        }
      }

      // Check community pin
      const isNewHighlight = checkCommunityPin(msg);
      if (isNewHighlight) {
        io.emit('communityHighlight', {
          message: msg,
          totalReactions,
          diamondCount: (msg.reactions['💎'] || []).length
        });
      }

    } catch (err) {
      console.error('Erro addReaction:', err);
    }
  });

  // ===============================
  // ADMIN: DELETAR MENSAGEM
  // ===============================
  socket.on('deleteMessage', async (data) => {
    try {
      const { address, messageId } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem deletar mensagens');
        return;
      }

      const idx = messages.findIndex(m => m.id === messageId);
      if (idx >= 0) {
        messages.splice(idx, 1);
        pinnedMessages.delete(messageId);
        saveMessages(messages);
        io.emit('messageDeleted', messageId);
      }

    } catch (err) {
      console.error('Erro deleteMessage:', err);
    }
  });

  // ===============================
  // ADMIN: BANIR USUÁRIO
  // ===============================
  socket.on('banUser', async (data) => {
    try {
      const { address, targetAddress } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem banir usuários');
        return;
      }

      const targetLower = targetAddress.toLowerCase();

      // Não pode banir admin
      if (isAdmin(targetLower)) {
        socket.emit('error', 'Não é possível banir um administrador');
        return;
      }

      bannedAddresses.add(targetLower);
      saveBans();

      // Desconectar usuário banido
      const bannedSocketId = userSockets.get(targetLower);
      if (bannedSocketId) {
        io.to(bannedSocketId).emit('banned', 'Você foi banido do chat');
      }

      io.emit('userBanned', targetLower);

    } catch (err) {
      console.error('Erro banUser:', err);
    }
  });

  // ===============================
  // ADMIN: DESBANIR USUÁRIO
  // ===============================
  socket.on('unbanUser', async (data) => {
    try {
      const { address, targetAddress } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem desbanir usuários');
        return;
      }

      bannedAddresses.delete(targetAddress.toLowerCase());
      saveBans();
      socket.emit('success', 'Usuário desbanido');

    } catch (err) {
      console.error('Erro unbanUser:', err);
    }
  });

  // ===============================
  // ADMIN: FIXAR MENSAGEM
  // ===============================
  socket.on('pinMessage', async (data) => {
    try {
      const { address, messageId } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem fixar mensagens');
        return;
      }

      const msg = messages.find(m => m.id === messageId);
      if (!msg) return;

      if (pinnedMessages.has(messageId)) {
        pinnedMessages.delete(messageId);
        io.emit('messageUnpinned', messageId);
      } else {
        pinnedMessages.add(messageId);
        io.emit('messagePinned', { messageId, message: msg });
      }

    } catch (err) {
      console.error('Erro pinMessage:', err);
    }
  });

  // ===============================
  // BUSCAR DADOS DE USUÁRIO
  // ===============================
  socket.on('getUserStatus', async (data) => {
    try {
      const { address } = data;
      const userData = await getUserData(address);
      socket.emit('userStatus', { address, ...userData });
    } catch (err) {
      console.error('Erro getUserStatus:', err);
    }
  });

  // ===============================
  // MENSAGENS PRIVADAS
  // ===============================

  // Iniciar/carregar conversa privada
  socket.on('loadPrivateChat', async (data) => {
    try {
      const { address, targetAddress } = data;
      if (!address || !targetAddress) return;

      const addrLower = address.toLowerCase();
      const targetLower = targetAddress.toLowerCase();

      // Verificar ZOD
      const userData = await getUserData(address);
      if (!userData || userData.zodBalance <= 0) {
        socket.emit('error', 'Você precisa ter ZOD para usar mensagens privadas');
        return;
      }

      // Verificar se target existe
      const targetData = await getUserData(targetAddress);
      if (!targetData) {
        socket.emit('error', 'Usuário não encontrado');
        return;
      }

      const convKey = getConversationKey(addrLower, targetLower);
      const chatMessages = privateMessages[convKey] || [];

      socket.emit('privateChatHistory', {
        targetAddress: targetLower,
        targetData: {
          status: targetData.status,
          isAdmin: targetData.isAdmin
        },
        messages: chatMessages.slice(-50)
      });

    } catch (err) {
      console.error('Erro loadPrivateChat:', err);
      socket.emit('error', 'Erro ao carregar chat privado');
    }
  });

  // Enviar mensagem privada
  socket.on('sendPrivateMessage', async (data) => {
    try {
      const { address, targetAddress, message, image, audio } = data;

      // Validar
      if (!address || !targetAddress || (!message && !image && !audio)) {
        socket.emit('error', 'Mensagem inválida');
        return;
      }

      if (message && message.length > 500) {
        socket.emit('error', 'Mensagem muito longa');
        return;
      }

      // Validar mídia
      if (image && (!image.startsWith('data:image/') || image.length > 500000)) {
        socket.emit('error', 'Imagem inválida ou muito grande');
        return;
      }

      if (audio && (!audio.startsWith('data:audio/') || audio.length > 1000000)) {
        socket.emit('error', 'Áudio inválido ou muito grande');
        return;
      }

      const addrLower = address.toLowerCase();
      const targetLower = targetAddress.toLowerCase();

      // Verificar ban
      if (isBanned(addrLower)) {
        socket.emit('error', 'Você foi banido do chat');
        return;
      }

      // Verificar ZOD
      const userData = await getUserData(address);
      if (!userData || userData.zodBalance <= 0) {
        socket.emit('error', 'Você precisa ter ZOD para enviar mensagens');
        return;
      }

      // Rate limit
      const now = Date.now();
      const last = lastMessageTime.get(addrLower);
      if (last && now - last < RATE_LIMIT_MS) {
        const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
        socket.emit('error', `Aguarde ${wait}s`);
        return;
      }

      const convKey = getConversationKey(addrLower, targetLower);

      const newPrivateMessage = {
        id: now.toString(),
        from: addrLower,
        to: targetLower,
        message: message ? message.trim() : '',
        timestamp: now,
        status: userData.status,
        isAdmin: userData.isAdmin,
        image: image || null,
        audio: audio || null
      };

      // Inicializar conversa se não existir
      if (!privateMessages[convKey]) {
        privateMessages[convKey] = [];
      }

      privateMessages[convKey].push(newPrivateMessage);
      lastMessageTime.set(addrLower, now);

      // Limitar tamanho da conversa
      if (privateMessages[convKey].length > MAX_PRIVATE_MESSAGES) {
        privateMessages[convKey] = privateMessages[convKey].slice(-MAX_PRIVATE_MESSAGES);
      }

      // Salvar periodicamente
      if (Object.keys(privateMessages).length % 5 === 0) {
        savePrivateMessages();
      }

      // Emitir para o remetente
      socket.emit('newPrivateMessage', newPrivateMessage);

      // Emitir para o destinatário (se conectado)
      const targetSocketId = userSockets.get(targetLower);
      if (targetSocketId) {
        io.to(targetSocketId).emit('newPrivateMessage', newPrivateMessage);
        // Notificação de nova mensagem privada
        io.to(targetSocketId).emit('privateMessageNotification', {
          from: addrLower,
          preview: message ? message.substring(0, 30) : (image ? '📷 Imagem' : '🎤 Áudio')
        });
      }

    } catch (err) {
      console.error('Erro sendPrivateMessage:', err);
      socket.emit('error', 'Erro ao enviar mensagem privada');
    }
  });

  // Listar conversas ativas
  socket.on('getPrivateConversations', async (data) => {
    try {
      const { address } = data;
      if (!address) return;

      const addrLower = address.toLowerCase();
      const conversations = [];

      for (const [convKey, msgs] of Object.entries(privateMessages)) {
        if (convKey.includes(addrLower) && msgs.length > 0) {
          // Encontrar o outro participante
          const [addr1, addr2] = convKey.split('_');
          const otherAddress = addr1 === addrLower ? addr2 : addr1;
          const lastMsg = msgs[msgs.length - 1];

          // Buscar dados do outro usuário
          const otherData = await getUserData(otherAddress);

          conversations.push({
            address: otherAddress,
            status: otherData?.status || { emoji: '⚪', label: 'Holder' },
            lastMessage: lastMsg.message || (lastMsg.image ? '📷 Imagem' : '🎤 Áudio'),
            lastTimestamp: lastMsg.timestamp,
            unreadCount: msgs.filter(m => m.to === addrLower && !m.read).length
          });
        }
      }

      // Ordenar por mais recente
      conversations.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

      socket.emit('privateConversations', conversations);

    } catch (err) {
      console.error('Erro getPrivateConversations:', err);
    }
  });

  // ===============================
  // TYPING INDICATOR
  // ===============================
  socket.on('typing', (data) => {
    const { address } = data || {};
    if (!address) return;
    const addrLower = address.toLowerCase();

    // Limpar timeout anterior
    if (typingUsers.has(addrLower)) {
      clearTimeout(typingUsers.get(addrLower));
    }

    // Broadcast typing (exceto para quem está digitando)
    socket.broadcast.emit('userTyping', { address: addrLower });

    // Auto-limpar após 3s
    typingUsers.set(addrLower, setTimeout(() => {
      typingUsers.delete(addrLower);
      socket.broadcast.emit('userStoppedTyping', { address: addrLower });
    }, 3000));
  });

  socket.on('stopTyping', (data) => {
    const { address } = data || {};
    if (!address) return;
    const addrLower = address.toLowerCase();
    if (typingUsers.has(addrLower)) {
      clearTimeout(typingUsers.get(addrLower));
      typingUsers.delete(addrLower);
    }
    socket.broadcast.emit('userStoppedTyping', { address: addrLower });
  });

  // ===============================
  // LEADERBOARD
  // ===============================
  socket.on('getLeaderboard', () => {
    const leaderboard = getLeaderboard();
    socket.emit('leaderboard', leaderboard);
  });

  // ===============================
  // SOCIAL MEMORY
  // ===============================
  socket.on('getSocialMemory', () => {
    const memory = getSocialMemory();
    socket.emit('socialMemory', memory);
  });

  // ===============================
  // COMMUNITY HIGHLIGHTS
  // ===============================
  socket.on('getCommunityHighlights', () => {
    socket.emit('communityHighlightsList', communityHighlights.slice(-COMMUNITY_HIGHLIGHTS_MAX));
  });

  // ===============================
  // ADMIN: CRIAR ENQUETE
  // ===============================
  socket.on('createPoll', async (data) => {
    try {
      const { address, question, options, duration, allowMultiple } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem criar enquetes');
        return;
      }

      if (!question || !question.trim()) {
        socket.emit('error', 'A enquete precisa de uma pergunta');
        return;
      }

      if (!options || !Array.isArray(options) || options.length < 2 || options.length > 10) {
        socket.emit('error', 'A enquete precisa de 2 a 10 opções');
        return;
      }

      // Validar opções não vazias
      const cleanOptions = options.map(o => o.trim()).filter(o => o.length > 0);
      if (cleanOptions.length < 2) {
        socket.emit('error', 'Pelo menos 2 opções válidas são necessárias');
        return;
      }

      const now = Date.now();
      // Duração em minutos (padrão 60, máximo 1440 = 24h)
      const durationMs = Math.min(Math.max((duration || 60), 5), 1440) * 60 * 1000;

      const poll = {
        id: now.toString(),
        createdBy: address.toLowerCase(),
        question: question.trim().substring(0, 200),
        options: cleanOptions.map((text, index) => ({
          id: index,
          text: text.substring(0, 100),
          votes: [] // Array de endereços que votaram nesta opção
        })),
        allowMultiple: !!allowMultiple,
        createdAt: now,
        endsAt: now + durationMs,
        isActive: true,
        totalVotes: 0
      };

      polls.push(poll);

      // Manter no máximo 50 enquetes
      if (polls.length > 50) {
        polls = polls.slice(-50);
      }

      savePolls();

      // Broadcast para todos
      io.emit('newPoll', poll);

      console.log(`📊 Nova enquete criada por ${address.slice(0, 8)}: "${poll.question}"`);

    } catch (err) {
      console.error('Erro createPoll:', err);
      socket.emit('error', 'Erro ao criar enquete');
    }
  });

  // ===============================
  // VOTAR EM ENQUETE
  // ===============================
  socket.on('votePoll', async (data) => {
    try {
      const { address, pollId, optionId } = data;
      if (!address || pollId === undefined || optionId === undefined) return;

      const addrLower = address.toLowerCase();

      // Verificar ZOD (precisa ser holder)
      const userData = await getUserData(address);
      if (!userData || userData.zodBalance <= 0) {
        socket.emit('error', 'Você precisa ter ZOD para votar');
        return;
      }

      const poll = polls.find(p => p.id === pollId);
      if (!poll) {
        socket.emit('error', 'Enquete não encontrada');
        return;
      }

      // Verificar se está ativa
      if (!poll.isActive || Date.now() > poll.endsAt) {
        poll.isActive = false;
        socket.emit('error', 'Esta enquete já encerrou');
        return;
      }

      const option = poll.options.find(o => o.id === optionId);
      if (!option) {
        socket.emit('error', 'Opção inválida');
        return;
      }

      // Verificar se já votou nesta opção (toggle)
      const voteIndex = option.votes.indexOf(addrLower);
      if (voteIndex >= 0) {
        // Remover voto
        option.votes.splice(voteIndex, 1);
        poll.totalVotes--;
      } else {
        // Se não permite múltiplas respostas, remover votos anteriores
        if (!poll.allowMultiple) {
          for (const opt of poll.options) {
            const idx = opt.votes.indexOf(addrLower);
            if (idx >= 0) {
              opt.votes.splice(idx, 1);
              poll.totalVotes--;
            }
          }
        }
        // Adicionar voto
        option.votes.push(addrLower);
        poll.totalVotes++;
      }

      savePolls();

      // Broadcast atualização (enviar sem os endereços, só contagens)
      io.emit('pollUpdate', sanitizePoll(poll));

    } catch (err) {
      console.error('Erro votePoll:', err);
      socket.emit('error', 'Erro ao votar');
    }
  });

  // ===============================
  // ADMIN: ENCERRAR ENQUETE
  // ===============================
  socket.on('closePoll', async (data) => {
    try {
      const { address, pollId } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem encerrar enquetes');
        return;
      }

      const poll = polls.find(p => p.id === pollId);
      if (!poll) {
        socket.emit('error', 'Enquete não encontrada');
        return;
      }

      poll.isActive = false;
      poll.endsAt = Date.now();
      savePolls();

      io.emit('pollClosed', sanitizePoll(poll));
      console.log(`📊 Enquete encerrada: "${poll.question}"`);

    } catch (err) {
      console.error('Erro closePoll:', err);
    }
  });

  // ===============================
  // ADMIN: DELETAR ENQUETE
  // ===============================
  socket.on('deletePoll', async (data) => {
    try {
      const { address, pollId } = data;

      if (!isAdmin(address)) {
        socket.emit('error', 'Apenas administradores podem deletar enquetes');
        return;
      }

      polls = polls.filter(p => p.id !== pollId);
      savePolls();

      io.emit('pollDeleted', pollId);
      console.log(`📊 Enquete deletada: ${pollId}`);

    } catch (err) {
      console.error('Erro deletePoll:', err);
    }
  });

  // ===============================
  // CARREGAR ENQUETES ATIVAS
  // ===============================
  socket.on('getPolls', (data) => {
    const { address } = data || {};
    const addrLower = address ? address.toLowerCase() : null;

    // Auto-encerrar enquetes expiradas
    const now = Date.now();
    for (const poll of polls) {
      if (poll.isActive && now > poll.endsAt) {
        poll.isActive = false;
      }
    }

    // Enviar enquetes sanitizadas (com info se o usuário votou)
    const sanitized = polls.slice(-20).map(p => sanitizePollForUser(p, addrLower));
    socket.emit('pollsList', sanitized);
  });

  // ===============================
  // DISCONNECT
  // ===============================
  socket.on('disconnect', () => {
    connectedUsers--;
    console.log('🔴 Usuário desconectado:', socket.id);

    if (socket.address) {
      userSockets.delete(socket.address);
    }

    io.emit('userCount', connectedUsers);
  });
});

// ===============================
// ROTAS REST
// ===============================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    users: connectedUsers,
    messages: messages.length,
    bannedCount: bannedAddresses.size
  });
});

app.get('/api/messages', (req, res) => {
  const historyWithPins = messages.slice(-100).map(msg => ({
    ...msg,
    isPinned: pinnedMessages.has(msg.id)
  }));
  res.json(historyWithPins);
});

app.get('/api/admins', (req, res) => {
  res.json(ADMIN_ADDRESSES);
});

// Leaderboard REST endpoint
app.get('/api/leaderboard', (req, res) => {
  res.json(getLeaderboard());
});

// Community highlights REST endpoint
app.get('/api/highlights', (req, res) => {
  res.json(communityHighlights.slice(-COMMUNITY_HIGHLIGHTS_MAX));
});

// Social memory REST endpoint
app.get('/api/social-memory', (req, res) => {
  res.json(getSocialMemory());
});

// Polls REST endpoint
app.get('/api/polls', (req, res) => {
  const now = Date.now();
  const activePolls = polls.filter(p => p.isActive && now < p.endsAt);
  res.json(activePolls.map(p => sanitizePoll(p)));
});

// ===============================
// SHUTDOWN
// ===============================
function shutdown() {
  console.log('💾 Salvando dados...');
  saveMessages(messages);
  saveBans();
  savePrivateMessages();
  savePolls();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ===============================
// START
// ===============================
server.listen(PORT, '127.0.0.1', () => {
  // Recalcular stats no startup
  recalculateStats();
  console.log(`🚀 Chat server rodando em http://127.0.0.1:${PORT}`);
  console.log(`📊 Admins: ${ADMIN_ADDRESSES.length}`);
  console.log(`🚫 Bans: ${bannedAddresses.size}`);
  console.log(`📈 Stats: ${messageStats.size} usuários trackados`);
});
