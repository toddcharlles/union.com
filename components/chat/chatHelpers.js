// Reactions disponíveis
export const REACTIONS = ['👍', '❤️', '😂', '🔥', '🚀', '💎'];

// URL BASE DO SITE
export const CHAT_SERVER_URL = 'https://unionzod.com';

// Formata endereço
export const formatAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Formata endereço curto para menção
export const formatShortAddress = (address) => {
  if (!address) return '';
  return address.slice(-4);
};

// Formata hora
export const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Formata tempo de gravação
export const formatRecordingTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Tempo restante formatado para enquetes
export const formatTimeRemaining = (endsAt) => {
  const remaining = endsAt - Date.now();
  if (remaining <= 0) return 'Encerrada';
  const mins = Math.floor(remaining / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}min restantes`;
  return `${mins}min restantes`;
};

// Calcular total de reações de uma mensagem
export const getTotalReactions = (reactions) => {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((sum, users) => sum + users.length, 0);
};

// Converter blob para base64
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};