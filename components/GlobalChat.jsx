import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// URL BASE DO SITE
const CHAT_SERVER_URL = 'https://unionzod.com';

// Reactions disponíveis
const REACTIONS = ['👍', '❤️', '😂', '🔥', '🚀', '💎'];

const GlobalChat = ({ account, isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [userData, setUserData] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showReactions, setShowReactions] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);

  // Private messaging state
  const [chatMode, setChatMode] = useState('global'); // 'global' or 'private'
  const [privateTarget, setPrivateTarget] = useState(null);
  const [privateTargetData, setPrivateTargetData] = useState(null);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [showConversations, setShowConversations] = useState(false);
  const [unreadPrivate, setUnreadPrivate] = useState(0);

  // === NOVAS FEATURES ===
  // Typing indicators
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Reaction animations
  const [reactionAnimations, setReactionAnimations] = useState([]); // { id, emoji, messageId }

  // Mention highlight
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // Leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);

  // Community highlights
  const [communityHighlights, setCommunityHighlights] = useState([]);
  const [showHighlights, setShowHighlights] = useState(false);

  // Social memory
  const [showSocialMemory, setShowSocialMemory] = useState(false);
  const [socialMemory, setSocialMemory] = useState(null);

  // Active panel (only one at a time)
  const [activePanel, setActivePanel] = useState(null); // 'leaderboard' | 'highlights' | 'memory' | 'conversations' | 'polls' | null

  // Share menu
  const [shareMenuId, setShareMenuId] = useState(null);

  // Polls (enquetes)
  const [polls, setPolls] = useState([]);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollForm, setPollForm] = useState({ question: '', options: ['', ''], duration: 60, allowMultiple: false });

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const messageRefs = useRef({}); // Para scroll até mensagem mencionada

  // Formata endereço
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Formata endereço curto para menção
  const formatShortAddress = (address) => {
    if (!address) return '';
    return address.slice(-4);
  };

  // Formata hora
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Scroll automático
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Scroll até uma mensagem específica (para menções)
  const scrollToMessage = useCallback((messageId) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 3000);
    }
  }, []);

  // Processar texto com menções
  const renderMessageText = (text, mentions = []) => {
    if (!mentions || mentions.length === 0) {
      return <span>{text}</span>;
    }

    // Regex para encontrar menções
    const parts = text.split(/(@[a-fA-F0-9]{4,})/g);

    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        const mentionCode = part.slice(1).toLowerCase();
        const isMention = mentions.includes(mentionCode);
        const isMyMention = account && (
          account.toLowerCase().endsWith(mentionCode) ||
          account.toLowerCase().includes(mentionCode)
        );
        if (isMention) {
          return (
            <span
              key={idx}
              className={`px-1 rounded font-bold ${
                isMyMention
                  ? 'bg-yellow-300 text-yellow-900 animate-pulse'
                  : 'bg-yellow-200 text-yellow-800'
              }`}
            >
              {part}
            </span>
          );
        }
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // Render badges
  const renderBadges = (badges) => {
    if (!badges || badges.length === 0) return null;
    return (
      <span className="inline-flex gap-0.5 ml-1">
        {badges.map((badge) => (
          <span
            key={badge.id}
            title={badge.label}
            className="text-xs cursor-help inline-flex items-center justify-center w-4 h-4 rounded-full"
            style={{
              backgroundColor: badge.color + '22',
              border: `1px solid ${badge.color}55`
            }}
          >
            {badge.emoji}
          </span>
        ))}
      </span>
    );
  };

  // Trigger reaction animation
  const triggerReactionAnimation = useCallback((emoji, messageId) => {
    const id = Date.now() + Math.random();
    setReactionAnimations(prev => [...prev, { id, emoji, messageId }]);
    setTimeout(() => {
      setReactionAnimations(prev => prev.filter(a => a.id !== id));
    }, 1000);
  }, []);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!socketRef.current || !account || !isAuthenticated) return;

    socketRef.current.emit('typing', { address: account });

    // Limpar timeout anterior
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && account) {
        socketRef.current.emit('stopTyping', { address: account });
      }
    }, 2000);
  }, [account, isAuthenticated]);

  // Toggle panel
  const togglePanel = useCallback((panel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  }, []);

  // Share message as text
  const shareAsText = useCallback((msg) => {
    const addr = formatAddress(msg.address);
    const text = `"${msg.message}" — ${addr} no Chat ZOD\n\nhttps://unionzod.com`;
    navigator.clipboard.writeText(text).then(() => {
      setNotification('Mensagem copiada!');
      setTimeout(() => setNotification(null), 2000);
    });
    setShareMenuId(null);
  }, []);

  // Share on X (Twitter)
  const shareOnX = useCallback((msg) => {
    const addr = formatAddress(msg.address);
    const text = encodeURIComponent(
      `"${msg.message?.substring(0, 200)}" — ${addr} no Chat ZOD 🔥\n\nhttps://unionzod.com`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
    setShareMenuId(null);
  }, []);

  // Generate share image (canvas)
  const shareAsImage = useCallback((msg) => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 600, 300);
    gradient.addColorStop(0, '#1e1b4b');
    gradient.addColorStop(1, '#312e81');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 300);

    // Border glow
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 580, 280);

    // Status badge
    ctx.font = '24px serif';
    ctx.fillText(msg.status?.emoji || '⚪', 30, 60);

    // Address
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#a5b4fc';
    ctx.fillText(formatAddress(msg.address), 60, 58);

    // Message
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#e0e7ff';
    const words = (msg.message || '').split(' ');
    let line = '';
    let y = 100;
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > 540) {
        ctx.fillText(line, 30, y);
        line = word + ' ';
        y += 28;
        if (y > 220) {
          ctx.fillText(line + '...', 30, y);
          break;
        }
      } else {
        line = testLine;
      }
    }
    if (y <= 220) ctx.fillText(line, 30, y);

    // Reactions
    if (msg.reactions) {
      const reactions = Object.entries(msg.reactions)
        .map(([emoji, users]) => `${emoji} ${users.length}`)
        .join('  ');
      ctx.font = '16px serif';
      ctx.fillStyle = '#c4b5fd';
      ctx.fillText(reactions, 30, 260);
    }

    // Footer
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#6366f1';
    ctx.fillText('Chat ZOD — unionzod.com', 30, 280);
    ctx.fillText(formatTime(msg.timestamp), 500, 280);

    // Download
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-zod-${msg.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });

    setShareMenuId(null);
    setNotification('Imagem gerada!');
    setTimeout(() => setNotification(null), 2000);
  }, []);

  // Conexão com Socket.IO
  useEffect(() => {
    if (!isOpen) return;

    const socket = io(CHAT_SERVER_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError('');
      console.log('✅ Chat conectado');

      // Autenticar se tiver conta
      if (account) {
        socket.emit('authenticate', { address: account });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsAuthenticated(false);
      console.log('❌ Chat desconectado');
    });

    socket.on('connect_error', (err) => {
      console.error('Erro de conexão:', err);
      setError('Erro ao conectar ao chat');
      setIsConnected(false);
    });

    // Resultado da autenticação
    socket.on('authResult', (result) => {
      if (result.success) {
        setIsAuthenticated(true);
        setUserData(result.userData);
        setError('');
      } else {
        setIsAuthenticated(false);
        setError(result.error);
      }
    });

    // Histórico de mensagens
    socket.on('messageHistory', (history) => {
      setMessages(history);
      // Separar mensagens fixadas
      const pinned = history.filter(m => m.isPinned);
      setPinnedMessages(pinned);
      setTimeout(scrollToBottom, 100);
    });

    // Nova mensagem
    socket.on('newMessage', (message) => {
      setMessages((prev) => [...prev, message]);
      setTimeout(scrollToBottom, 100);
    });

    // Atualização de reação
    socket.on('reactionUpdate', ({ messageId, reactions, reactedBy, reactionAdded }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions } : msg
        )
      );

      // Trigger animation para reação adicionada
      if (reactionAdded && reactions) {
        const lastReaction = Object.entries(reactions).find(([, users]) =>
          users.includes(reactedBy)
        );
        if (lastReaction) {
          triggerReactionAnimation(lastReaction[0], messageId);
        }
      }
    });

    // Notificação de reação (para o autor)
    socket.on('reactionNotification', ({ reaction, by, totalReactions, messagePreview }) => {
      setNotification(
        `${reaction} @${by.slice(-4)} reagiu à sua mensagem${messagePreview ? ': "' + messagePreview + '"' : ''} (${totalReactions} total)`
      );
      setTimeout(() => setNotification(null), 4000);
    });

    // Mensagem deletada
    socket.on('messageDeleted', (messageId) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setPinnedMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    });

    // Mensagem fixada
    socket.on('messagePinned', ({ messageId, message }) => {
      setPinnedMessages((prev) => [...prev, { ...message, isPinned: true }]);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: true } : msg
        )
      );
    });

    // Mensagem desfixada
    socket.on('messageUnpinned', (messageId) => {
      setPinnedMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: false } : msg
        )
      );
    });

    // Mencionado - destaque forte
    socket.on('mentioned', ({ by, message, messageId }) => {
      setNotification(`🔥 @${formatShortAddress(by)} mencionou você: "${message}..."`);
      setTimeout(() => setNotification(null), 5000);

      // Scroll automático até a mensagem e highlight
      if (messageId) {
        setTimeout(() => scrollToMessage(messageId), 300);
      }
    });

    // Banido
    socket.on('banned', () => {
      setError('Você foi banido do chat');
      setIsAuthenticated(false);
    });

    // Contagem de usuários
    socket.on('userCount', (count) => {
      setUserCount(count);
    });

    // Erro
    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    // === TYPING INDICATORS ===
    socket.on('userTyping', ({ address }) => {
      setTypingUsers(prev => {
        if (prev.includes(address)) return prev;
        return [...prev, address];
      });
    });

    socket.on('userStoppedTyping', ({ address }) => {
      setTypingUsers(prev => prev.filter(a => a !== address));
    });

    // === COMMUNITY HIGHLIGHTS ===
    socket.on('communityHighlight', ({ message, totalReactions }) => {
      setCommunityHighlights(prev => [...prev, { ...message, totalReactions, highlightedAt: Date.now() }]);
      setNotification(`🏆 Mensagem de @${message.address?.slice(-4)} virou destaque! (${totalReactions} reações)`);
      setTimeout(() => setNotification(null), 5000);
    });

    socket.on('communityHighlightsList', (highlights) => {
      setCommunityHighlights(highlights);
    });

    // === LEADERBOARD ===
    socket.on('leaderboard', (data) => {
      setLeaderboard(data);
    });

    // === SOCIAL MEMORY ===
    socket.on('socialMemory', (data) => {
      setSocialMemory(data);
    });

    // === POLLS (ENQUETES) ===
    socket.on('pollsList', (pollsData) => {
      setPolls(pollsData);
    });

    socket.on('newPoll', (poll) => {
      setPolls(prev => [...prev.filter(p => p.id !== poll.id), poll]);
      setNotification(`📊 Nova enquete: "${poll.question}"`);
      setTimeout(() => setNotification(null), 5000);
    });

    socket.on('pollUpdate', (updatedPoll) => {
      setPolls(prev => prev.map(p => p.id === updatedPoll.id ? updatedPoll : p));
    });

    socket.on('pollClosed', (closedPoll) => {
      setPolls(prev => prev.map(p => p.id === closedPoll.id ? { ...closedPoll, isActive: false } : p));
      setNotification(`📊 Enquete encerrada: "${closedPoll.question}"`);
      setTimeout(() => setNotification(null), 4000);
    });

    socket.on('pollDeleted', (pollId) => {
      setPolls(prev => prev.filter(p => p.id !== pollId));
    });

    // ==============================
    // PRIVATE MESSAGING EVENTS
    // ==============================

    // Histórico de chat privado
    socket.on('privateChatHistory', ({ targetAddress, targetData, messages: history }) => {
      setPrivateTargetData(targetData);
      setPrivateMessages(history);
      setTimeout(scrollToBottom, 100);
    });

    // Nova mensagem privada
    socket.on('newPrivateMessage', (msg) => {
      setPrivateMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
    });

    // Notificação de mensagem privada
    socket.on('privateMessageNotification', ({ from, preview }) => {
      setUnreadPrivate(prev => prev + 1);
      setNotification(`💬 Mensagem de @${from.slice(-4)}: "${preview}"`);
      setTimeout(() => setNotification(null), 5000);
    });

    // Lista de conversas
    socket.on('privateConversations', (convs) => {
      setConversations(convs);
      const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      setUnreadPrivate(totalUnread);
    });

    setTimeout(() => inputRef.current?.focus(), 150);

    return () => {
      socket.disconnect();
    };
  }, [isOpen, account, scrollToBottom, scrollToMessage, triggerReactionAnimation]);

  // Re-autenticar quando conta mudar
  useEffect(() => {
    if (isConnected && account && socketRef.current) {
      socketRef.current.emit('authenticate', { address: account });
    }
  }, [account, isConnected]);

  // Selecionar imagem
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Apenas imagens são permitidas');
      return;
    }

    if (file.size > 500000) {
      setError('Imagem muito grande (máx 500KB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target.result);
      setImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ==============================
  // AUDIO RECORDING
  // ==============================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioPreview(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      setError('Não foi possível acessar o microfone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioPreview(null);
    setRecordingTime(0);
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ==============================
  // PRIVATE MESSAGING
  // ==============================
  const openPrivateChat = (targetAddress) => {
    if (!socketRef.current || !account) return;
    if (targetAddress.toLowerCase() === account.toLowerCase()) return;

    setPrivateTarget(targetAddress.toLowerCase());
    setChatMode('private');
    setActivePanel(null);

    socketRef.current.emit('loadPrivateChat', {
      address: account,
      targetAddress
    });
  };

  const backToGlobal = () => {
    setChatMode('global');
    setPrivateTarget(null);
    setPrivateTargetData(null);
    setPrivateMessages([]);
  };

  const loadConversations = () => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('getPrivateConversations', { address: account });
    togglePanel('conversations');
  };

  // Enviar mensagem
  const handleSend = async () => {
    const hasContent = newMessage.trim() || selectedImage || audioBlob;
    if (!hasContent || !account || !socketRef.current || isSending || !isAuthenticated) return;

    setIsSending(true);
    setError('');

    try {
      let audioData = null;
      if (audioBlob) {
        audioData = await blobToBase64(audioBlob);
        if (audioData.length > 1000000) {
          setError('Áudio muito grande (máx 1MB)');
          setIsSending(false);
          return;
        }
      }

      // Stop typing
      if (socketRef.current && account) {
        socketRef.current.emit('stopTyping', { address: account });
      }

      if (chatMode === 'private' && privateTarget) {
        socketRef.current.emit('sendPrivateMessage', {
          address: account,
          targetAddress: privateTarget,
          message: newMessage.trim(),
          image: selectedImage || null,
          audio: audioData
        });
      } else {
        socketRef.current.emit('sendMessage', {
          address: account,
          message: newMessage.trim(),
          replyTo: replyTo?.id || null,
          image: selectedImage || null,
          audio: audioData
        });
      }

      setNewMessage('');
      setReplyTo(null);
      setSelectedImage(null);
      setImagePreview(null);
      setAudioBlob(null);
      setAudioPreview(null);
      setRecordingTime(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Erro ao enviar:', err);
      setError('Erro ao enviar mensagem');
    }

    setIsSending(false);
  };

  // Adicionar reação
  const handleReaction = (messageId, reaction) => {
    if (!account || !socketRef.current || !isAuthenticated) return;

    socketRef.current.emit('addReaction', {
      address: account,
      messageId,
      reaction
    });

    setShowReactions(null);
  };

  // Double-click para reação rápida (❤️)
  const handleDoubleClick = useCallback((messageId) => {
    if (!account || !socketRef.current || !isAuthenticated) return;
    socketRef.current.emit('addReaction', {
      address: account,
      messageId,
      reaction: '❤️'
    });
  }, [account, isAuthenticated]);

  // Deletar mensagem (admin)
  const handleDelete = (messageId) => {
    if (!account || !socketRef.current || !userData?.isAdmin) return;

    if (window.confirm('Deletar esta mensagem?')) {
      socketRef.current.emit('deleteMessage', {
        address: account,
        messageId
      });
    }
  };

  // Banir usuário (admin)
  const handleBan = (targetAddress) => {
    if (!account || !socketRef.current || !userData?.isAdmin) return;

    if (window.confirm(`Banir ${formatAddress(targetAddress)} do chat?`)) {
      socketRef.current.emit('banUser', {
        address: account,
        targetAddress
      });
    }
  };

  // Fixar/Desfixar mensagem (admin)
  const handlePin = (messageId) => {
    if (!account || !socketRef.current || !userData?.isAdmin) return;

    socketRef.current.emit('pinMessage', {
      address: account,
      messageId
    });
  };

  // Responder mensagem
  const handleReply = (msg) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  // Inserir menção
  const insertMention = (address) => {
    const mention = `@${address.slice(-4)} `;
    setNewMessage((prev) => prev + mention);
    inputRef.current?.focus();
  };

  // Enter para enviar + typing
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    handleTyping();
  };

  // Carregar leaderboard
  const requestLeaderboard = () => {
    if (socketRef.current) {
      socketRef.current.emit('getLeaderboard');
    }
    togglePanel('leaderboard');
  };

  // Carregar social memory
  const requestSocialMemory = () => {
    if (socketRef.current) {
      socketRef.current.emit('getSocialMemory');
    }
    togglePanel('memory');
  };

  // Carregar community highlights
  const requestHighlights = () => {
    if (socketRef.current) {
      socketRef.current.emit('getCommunityHighlights');
    }
    togglePanel('highlights');
  };

  // === ENQUETES ===
  const requestPolls = () => {
    if (socketRef.current) {
      socketRef.current.emit('getPolls', { address: account });
    }
    togglePanel('polls');
  };

  const handleVotePoll = (pollId, optionId) => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    socketRef.current.emit('votePoll', { address: account, pollId, optionId });
  };

  const handleCreatePoll = () => {
    if (!socketRef.current || !account) return;
    const cleanOptions = pollForm.options.filter(o => o.trim().length > 0);
    if (!pollForm.question.trim() || cleanOptions.length < 2) {
      setError('Preencha a pergunta e pelo menos 2 opções');
      return;
    }
    socketRef.current.emit('createPoll', {
      address: account,
      question: pollForm.question,
      options: cleanOptions,
      duration: pollForm.duration,
      allowMultiple: pollForm.allowMultiple
    });
    setPollForm({ question: '', options: ['', ''], duration: 60, allowMultiple: false });
    setShowCreatePoll(false);
  };

  const handleClosePoll = (pollId) => {
    if (!socketRef.current || !account) return;
    if (window.confirm('Encerrar esta enquete?')) {
      socketRef.current.emit('closePoll', { address: account, pollId });
    }
  };

  const handleDeletePoll = (pollId) => {
    if (!socketRef.current || !account) return;
    if (window.confirm('Deletar esta enquete permanentemente?')) {
      socketRef.current.emit('deletePoll', { address: account, pollId });
    }
  };

  const addPollOption = () => {
    if (pollForm.options.length >= 10) return;
    setPollForm(prev => ({ ...prev, options: [...prev.options, ''] }));
  };

  const removePollOption = (index) => {
    if (pollForm.options.length <= 2) return;
    setPollForm(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
  };

  const updatePollOption = (index, value) => {
    setPollForm(prev => ({
      ...prev,
      options: prev.options.map((o, i) => i === index ? value : o)
    }));
  };

  // Tempo restante formatado
  const formatTimeRemaining = (endsAt) => {
    const remaining = endsAt - Date.now();
    if (remaining <= 0) return 'Encerrada';
    const mins = Math.floor(remaining / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}min restantes`;
    return `${mins}min restantes`;
  };

  if (!isOpen) return null;

  // Encontrar mensagem original de reply
  const getReplyMessage = (replyId) => {
    return messages.find(m => m.id === replyId);
  };

  // Calcular total de reações de uma mensagem
  const getTotalReactions = (reactions) => {
    if (!reactions) return 0;
    return Object.values(reactions).reduce((sum, users) => sum + users.length, 0);
  };

  // Modo leitura: pode ver o chat sem wallet, mas não pode interagir
  const isReadOnly = !account || !isAuthenticated;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 p-4">
      {/* CSS Animations */}
      <style>{`
        @keyframes mentionPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(234, 179, 8, 0); }
        }
        @keyframes mentionBorder {
          0%, 100% { border-color: #eab308; }
          50% { border-color: #f97316; }
        }
        @keyframes reactionFloat {
          0% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(2) translateY(-30px); opacity: 0; }
        }
        @keyframes slideIn {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes highlightGlow {
          0%, 100% { background-color: rgba(234, 179, 8, 0.1); }
          50% { background-color: rgba(234, 179, 8, 0.3); }
        }
        .mention-highlight {
          animation: mentionPulse 1.5s ease-in-out 2, mentionBorder 1s ease-in-out 3;
          border: 2px solid #eab308;
          border-radius: 8px;
        }
        .reaction-float {
          animation: reactionFloat 1s ease-out forwards;
          position: absolute;
          top: -10px;
          right: 10px;
          font-size: 24px;
          pointer-events: none;
          z-index: 50;
        }
        .panel-slide {
          animation: slideIn 0.2s ease-out;
        }
        .highlight-glow {
          animation: highlightGlow 1.5s ease-in-out 2;
        }
        .badge-shine {
          display: inline-flex;
          gap: 2px;
        }
      `}</style>

      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg h-[85vh] max-h-[700px] flex flex-col">

        {/* HEADER */}
        <div className="bg-gray-900 text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            {chatMode === 'private' && (
              <button
                onClick={backToGlobal}
                className="text-gray-400 hover:text-white"
                title="Voltar ao chat global"
              >
                ←
              </button>
            )}
            <span className="text-xl">{chatMode === 'private' ? '🔒' : '💬'}</span>
            <div>
              <h3 className="font-bold">
                {chatMode === 'private'
                  ? `Chat com @${privateTarget?.slice(-4)}`
                  : 'Chat Global ZOD'
                }
              </h3>
              <p className="text-xs text-gray-400">
                {isConnected ? (
                  <>
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                    {chatMode === 'private'
                      ? privateTargetData?.status?.label || 'Holder'
                      : `${userCount} online`
                    }
                    {chatMode === 'global' && userData?.status && (
                      <span className="ml-2">
                        {userData.status.emoji} {userData.status.label}
                        {renderBadges(userData.badges)}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1"></span>
                    Desconectado
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Botões de painel social */}
            {chatMode === 'global' && (
              <>
                <button
                  onClick={requestLeaderboard}
                  className={`text-lg ${activePanel === 'leaderboard' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}
                  title="Ranking"
                >
                  🏆
                </button>
                <button
                  onClick={requestHighlights}
                  className={`text-lg ${activePanel === 'highlights' ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}
                  title="Destaques da comunidade"
                >
                  ⭐
                </button>
                <button
                  onClick={requestSocialMemory}
                  className={`text-lg ${activePanel === 'memory' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
                  title="Memória Social"
                >
                  📊
                </button>
                <button
                  onClick={requestPolls}
                  className={`text-lg relative ${activePanel === 'polls' ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
                  title="Enquetes"
                >
                  🗳️
                  {polls.filter(p => p.isActive).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-3.5 h-3.5 flex items-center justify-center" style={{ fontSize: '9px' }}>
                      {polls.filter(p => p.isActive).length}
                    </span>
                  )}
                </button>
              </>
            )}
            {/* Botão de conversas privadas */}
            {isAuthenticated && chatMode === 'global' && (
              <button
                onClick={loadConversations}
                className="relative text-gray-400 hover:text-white text-lg"
                title="Mensagens privadas"
              >
                📬
                {unreadPrivate > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadPrivate > 9 ? '9+' : unreadPrivate}
                  </span>
                )}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
              &times;
            </button>
          </div>
        </div>

        {/* === PANELS (apenas um por vez) === */}

        {/* LEADERBOARD PANEL */}
        {activePanel === 'leaderboard' && leaderboard && (
          <div className="bg-yellow-50 border-b border-yellow-200 max-h-60 overflow-y-auto panel-slide">
            <div className="flex items-center justify-between px-4 py-2 bg-yellow-100 sticky top-0">
              <span className="text-sm font-bold text-yellow-800">🏆 Ranking Social</span>
              <button onClick={() => setActivePanel(null)} className="text-yellow-600 hover:text-yellow-800">✕</button>
            </div>

            {/* Mensagem do dia */}
            {leaderboard.messageOfDay && (
              <div className="px-4 py-2 border-b border-yellow-200">
                <p className="text-xs font-bold text-orange-700">🔥 Mensagem do Dia</p>
                <p className="text-xs text-gray-700 mt-1">
                  <span className="font-mono text-orange-600">@{leaderboard.messageOfDay.address?.slice(-4)}</span>
                  : "{leaderboard.messageOfDay.message?.substring(0, 60)}"
                  <span className="ml-1 text-orange-500">({leaderboard.messageOfDay.totalReactions} reações)</span>
                </p>
              </div>
            )}

            {/* Top reagidos */}
            {leaderboard.topUsersReacted?.length > 0 && (
              <div className="px-4 py-2 border-b border-yellow-200">
                <p className="text-xs font-bold text-yellow-800 mb-1">💎 Mais Reagidos (Semana)</p>
                {leaderboard.topUsersReacted.slice(0, 5).map((u, i) => (
                  <div key={u.address} className="flex items-center justify-between text-xs py-0.5">
                    <span>
                      <span className="text-yellow-700 font-bold">{i + 1}.</span>{' '}
                      <span className="font-mono">{formatAddress(u.address)}</span>
                    </span>
                    <span className="text-yellow-600">{u.reactions} reações</span>
                  </div>
                ))}
              </div>
            )}

            {/* Mais ativos */}
            {leaderboard.topActive?.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-xs font-bold text-yellow-800 mb-1">🗣️ Mais Ativos (Semana)</p>
                {leaderboard.topActive.slice(0, 5).map((u, i) => (
                  <div key={u.address} className="flex items-center justify-between text-xs py-0.5">
                    <span>
                      <span className="text-yellow-700 font-bold">{i + 1}.</span>{' '}
                      <span className="font-mono">{formatAddress(u.address)}</span>
                    </span>
                    <span className="text-yellow-600">{u.messageCount} msgs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COMMUNITY HIGHLIGHTS PANEL */}
        {activePanel === 'highlights' && (
          <div className="bg-purple-50 border-b border-purple-200 max-h-60 overflow-y-auto panel-slide">
            <div className="flex items-center justify-between px-4 py-2 bg-purple-100 sticky top-0">
              <span className="text-sm font-bold text-purple-800">⭐ Destaques da Comunidade</span>
              <button onClick={() => setActivePanel(null)} className="text-purple-600 hover:text-purple-800">✕</button>
            </div>
            {communityHighlights.length === 0 ? (
              <p className="text-center text-purple-500 text-xs py-4">
                Mensagens com 20+ reações ou 10+ 💎 aparecem aqui
              </p>
            ) : (
              communityHighlights.slice().reverse().map((msg) => (
                <div key={msg.id} className="px-4 py-2 border-b border-purple-200 hover:bg-purple-100 cursor-pointer"
                  onClick={() => { scrollToMessage(msg.id); setActivePanel(null); }}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <span>{msg.status?.emoji || '⚪'}</span>
                    <span className="font-mono text-purple-700">@{msg.address?.slice(-4)}</span>
                    <span className="text-purple-400">•</span>
                    <span className="text-purple-500">{getTotalReactions(msg.reactions)} reações</span>
                  </div>
                  <p className="text-xs text-gray-700 truncate mt-0.5">{msg.message}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* SOCIAL MEMORY PANEL */}
        {activePanel === 'memory' && socialMemory && (
          <div className="bg-blue-50 border-b border-blue-200 max-h-60 overflow-y-auto panel-slide">
            <div className="flex items-center justify-between px-4 py-2 bg-blue-100 sticky top-0">
              <span className="text-sm font-bold text-blue-800">📊 Memória Social</span>
              <button onClick={() => setActivePanel(null)} className="text-blue-600 hover:text-blue-800">✕</button>
            </div>

            {/* Mensagem mais reagida da semana */}
            {socialMemory.mostReactedWeek && (
              <div className="px-4 py-2 border-b border-blue-200">
                <p className="text-xs font-bold text-blue-800">🏅 Mensagem da Semana</p>
                <p className="text-xs text-gray-700 mt-1">
                  <span className="font-mono text-blue-600">@{socialMemory.mostReactedWeek.address?.slice(-4)}</span>
                  : "{socialMemory.mostReactedWeek.message?.substring(0, 60)}"
                  <span className="ml-1 text-blue-500">({socialMemory.mostReactedWeek.totalReactions} reações)</span>
                </p>
              </div>
            )}

            {/* Usuários em alta */}
            {socialMemory.trending?.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-xs font-bold text-blue-800 mb-1">📈 Usuários em Alta</p>
                {socialMemory.trending.map((u, i) => (
                  <div key={u.address} className="flex items-center justify-between text-xs py-0.5">
                    <span>
                      <span className="text-blue-700 font-bold">{i + 1}.</span>{' '}
                      <span className="font-mono">{formatAddress(u.address)}</span>
                    </span>
                    <span className="text-blue-500">
                      {u.reactions} reações • {u.messages} msgs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* POLLS PANEL */}
        {activePanel === 'polls' && (
          <div className="bg-green-50 border-b border-green-200 max-h-80 overflow-y-auto panel-slide">
            <div className="flex items-center justify-between px-4 py-2 bg-green-100 sticky top-0 z-10">
              <span className="text-sm font-bold text-green-800">🗳️ Enquetes</span>
              <div className="flex items-center gap-2">
                {userData?.isAdmin && (
                  <button
                    onClick={() => setShowCreatePoll(!showCreatePoll)}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                  >
                    + Nova Enquete
                  </button>
                )}
                <button onClick={() => setActivePanel(null)} className="text-green-600 hover:text-green-800">✕</button>
              </div>
            </div>

            {/* Formulário de criação (admin) */}
            {showCreatePoll && userData?.isAdmin && (
              <div className="px-4 py-3 border-b border-green-200 bg-green-50">
                <input
                  type="text"
                  value={pollForm.question}
                  onChange={(e) => setPollForm(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="Pergunta da enquete..."
                  maxLength={200}
                  className="w-full border border-green-300 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none focus:border-green-500"
                />

                {pollForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-green-600 w-4">{i + 1}.</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updatePollOption(i, e.target.value)}
                      placeholder={`Opção ${i + 1}`}
                      maxLength={100}
                      className="flex-1 border border-green-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-green-500"
                    />
                    {pollForm.options.length > 2 && (
                      <button
                        onClick={() => removePollOption(i)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    {pollForm.options.length < 10 && (
                      <button
                        onClick={addPollOption}
                        className="text-xs text-green-600 hover:text-green-800"
                      >
                        + Opção
                      </button>
                    )}
                    <select
                      value={pollForm.duration}
                      onChange={(e) => setPollForm(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                      className="text-xs border border-green-200 rounded px-1 py-0.5"
                    >
                      <option value={5}>5 min</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>1 hora</option>
                      <option value={180}>3 horas</option>
                      <option value={360}>6 horas</option>
                      <option value={720}>12 horas</option>
                      <option value={1440}>24 horas</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-green-700">
                      <input
                        type="checkbox"
                        checked={pollForm.allowMultiple}
                        onChange={(e) => setPollForm(prev => ({ ...prev, allowMultiple: e.target.checked }))}
                        className="w-3 h-3"
                      />
                      Múltipla escolha
                    </label>
                  </div>
                  <button
                    onClick={handleCreatePoll}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-semibold"
                  >
                    Criar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de enquetes */}
            {polls.length === 0 ? (
              <p className="text-center text-green-500 text-xs py-4">Nenhuma enquete no momento</p>
            ) : (
              polls.slice().reverse().map((poll) => {
                const isExpired = !poll.isActive || Date.now() > poll.endsAt;
                return (
                  <div key={poll.id} className={`px-4 py-3 border-b border-green-200 ${isExpired ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">{poll.question}</p>
                        <p className="text-xs text-green-600">
                          {isExpired ? '⏱️ Encerrada' : `⏳ ${formatTimeRemaining(poll.endsAt)}`}
                          {' • '}{poll.totalVotes} voto{poll.totalVotes !== 1 ? 's' : ''}
                          {poll.allowMultiple && ' • Múltipla escolha'}
                        </p>
                      </div>
                      {userData?.isAdmin && (
                        <div className="flex gap-1 ml-2">
                          {!isExpired && (
                            <button
                              onClick={() => handleClosePoll(poll.id)}
                              className="text-xs text-orange-500 hover:text-orange-700"
                              title="Encerrar"
                            >
                              ⏹️
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePoll(poll.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                            title="Deletar"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Opções com barra de progresso */}
                    <div className="space-y-1.5">
                      {poll.options.map((opt) => {
                        const percentage = poll.totalVotes > 0
                          ? Math.round((opt.voteCount / poll.totalVotes) * 100)
                          : 0;
                        const isMyVote = opt.myVote;
                        const isWinner = isExpired && opt.voteCount === Math.max(...poll.options.map(o => o.voteCount)) && opt.voteCount > 0;

                        return (
                          <button
                            key={opt.id}
                            onClick={() => !isExpired && !isReadOnly && handleVotePoll(poll.id, opt.id)}
                            disabled={isExpired || isReadOnly}
                            className={`w-full text-left relative overflow-hidden rounded-md border transition-all ${
                              isMyVote
                                ? 'border-green-500 bg-green-50'
                                : 'border-gray-200 bg-white hover:border-green-300'
                            } ${isWinner ? 'ring-2 ring-green-400' : ''} ${
                              isExpired || isReadOnly ? 'cursor-default' : 'cursor-pointer'
                            }`}
                          >
                            {/* Barra de progresso */}
                            <div
                              className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                                isMyVote ? 'bg-green-200' : 'bg-gray-100'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                            <div className="relative flex items-center justify-between px-3 py-1.5">
                              <span className="text-xs text-gray-800 flex items-center gap-1">
                                {isMyVote && <span className="text-green-600">✓</span>}
                                {isWinner && <span>🏆</span>}
                                {opt.text}
                              </span>
                              <span className="text-xs font-bold text-gray-600 ml-2">
                                {percentage}% <span className="font-normal text-gray-400">({opt.voteCount})</span>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* LISTA DE CONVERSAS */}
        {activePanel === 'conversations' && (
          <div className="bg-gray-100 border-b border-gray-300 max-h-48 overflow-y-auto panel-slide">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-200 sticky top-0">
              <span className="text-sm font-semibold text-gray-700">💬 Conversas Privadas</span>
              <button
                onClick={() => setActivePanel(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            {conversations.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-4">Nenhuma conversa ainda</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.address}
                  onClick={() => openPrivateChat(conv.address)}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-200 border-b border-gray-200"
                >
                  <span>{conv.status?.emoji || '⚪'}</span>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-mono">{formatAddress(conv.address)}</span>
                    <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* NOTIFICAÇÃO */}
        {notification && (
          <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-800 px-4 py-2 text-sm animate-pulse panel-slide">
            🔔 {notification}
          </div>
        )}

        {/* MENSAGENS FIXADAS (apenas no chat global) */}
        {chatMode === 'global' && pinnedMessages.length > 0 && (
          <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 max-h-24 overflow-y-auto">
            <p className="text-xs font-semibold text-purple-700 mb-1">📌 Mensagens Fixadas</p>
            {pinnedMessages.slice(-2).map((msg) => (
              <div key={msg.id} className="text-xs text-purple-600 truncate cursor-pointer hover:text-purple-800"
                onClick={() => scrollToMessage(msg.id)}
              >
                <span className="font-mono">{formatShortAddress(msg.address)}:</span> {msg.message}
              </div>
            ))}
          </div>
        )}

        {/* MENSAGENS */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {/* Banner de enquete ativa (mostra a mais recente) */}
          {chatMode === 'global' && polls.filter(p => p.isActive && Date.now() < p.endsAt).length > 0 && (
            <div
              className="bg-green-50 border border-green-300 rounded-lg p-2.5 mb-2 cursor-pointer hover:bg-green-100 transition-colors panel-slide"
              onClick={requestPolls}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🗳️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-green-800 truncate">
                    {polls.filter(p => p.isActive && Date.now() < p.endsAt)[0]?.question}
                  </p>
                  <p className="text-xs text-green-600">
                    {polls.filter(p => p.isActive && Date.now() < p.endsAt).length} enquete{polls.filter(p => p.isActive && Date.now() < p.endsAt).length > 1 ? 's' : ''} ativa{polls.filter(p => p.isActive && Date.now() < p.endsAt).length > 1 ? 's' : ''} — Toque para votar
                  </p>
                </div>
                <span className="text-green-500 text-xs">▶</span>
              </div>
            </div>
          )}

          {/* Modo leitura banner */}
          {isReadOnly && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center text-xs text-blue-700 mb-2 panel-slide">
              👀 <strong>Modo Leitura</strong> — Conecte sua carteira com ZOD para participar do chat
            </div>
          )}

          {/* Mensagens do modo atual */}
          {chatMode === 'global' ? (
            <>
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <p className="text-4xl mb-2">💬</p>
                  <p>Nenhuma mensagem ainda</p>
                </div>
              )}
            </>
          ) : (
            <>
              {privateMessages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <p className="text-4xl mb-2">🔒</p>
                  <p>Inicie uma conversa privada</p>
                </div>
              )}
            </>
          )}

          {(chatMode === 'global' ? messages : privateMessages).map((msg) => {
            const isOwn = (msg.address || msg.from)?.toLowerCase() === account?.toLowerCase();
            const replyMsg = msg.replyTo ? getReplyMessage(msg.replyTo) : null;
            const isHighlighted = highlightedMessageId === msg.id;
            const totalReactions = getTotalReactions(msg.reactions);

            return (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el; }}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${
                  isHighlighted ? 'mention-highlight highlight-glow' : ''
                }`}
                onDoubleClick={() => chatMode === 'global' && !isReadOnly && handleDoubleClick(msg.id)}
              >
                <div className="max-w-[85%] relative">
                  {/* Reaction float animations */}
                  {reactionAnimations
                    .filter(a => a.messageId === msg.id)
                    .map(a => (
                      <span key={a.id} className="reaction-float">{a.emoji}</span>
                    ))
                  }

                  {/* Reply Preview */}
                  {replyMsg && (
                    <div
                      className={`text-xs mb-1 px-2 py-1 rounded border-l-2 cursor-pointer ${
                        isOwn ? 'bg-blue-50 border-blue-400' : 'bg-gray-100 border-gray-400'
                      }`}
                      onClick={() => scrollToMessage(replyMsg.id)}
                    >
                      <span className="text-gray-500">↩️ {formatShortAddress(replyMsg.address)}:</span>{' '}
                      <span className="text-gray-600 truncate">{replyMsg.message?.substring(0, 40)}...</span>
                    </div>
                  )}

                  <div
                    className={`rounded-lg px-3 py-2 relative group ${
                      msg.isPinned
                        ? 'bg-purple-100 border-2 border-purple-400'
                        : msg.isAdmin
                        ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                        : isOwn
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}
                  >
                    {/* Status Badge + Address + Badges */}
                    {!isOwn && (
                      <div className="flex items-center gap-1 mb-1 flex-wrap">
                        {msg.status && (
                          <span title={msg.status.label} className="text-sm">
                            {msg.status.emoji}
                          </span>
                        )}
                        <button
                          onClick={() => chatMode === 'global' && !isReadOnly ? insertMention(msg.address) : null}
                          className={`text-xs font-mono ${
                            chatMode === 'global' && !isReadOnly
                              ? 'text-gray-500 hover:text-blue-500 hover:underline cursor-pointer'
                              : 'text-gray-500 cursor-default'
                          }`}
                        >
                          {formatAddress(msg.address || msg.from)}
                        </button>
                        {/* Badges visuais */}
                        {msg.badges && msg.badges.length > 0 && renderBadges(msg.badges)}
                        {/* Botão de mensagem privada */}
                        {chatMode === 'global' && !isReadOnly && (msg.address || msg.from) && (
                          <button
                            onClick={() => openPrivateChat(msg.address)}
                            className="text-xs text-blue-500 hover:text-blue-700 ml-1"
                            title="Mensagem privada"
                          >
                            💬
                          </button>
                        )}
                      </div>
                    )}

                    {/* Imagem */}
                    {msg.image && (
                      <div className="mt-1 mb-2">
                        <img
                          src={msg.image}
                          alt="Imagem"
                          className="max-w-full max-h-48 rounded-lg cursor-pointer hover:opacity-90"
                          onClick={() => setFullscreenImage(msg.image)}
                        />
                      </div>
                    )}

                    {/* Áudio */}
                    {msg.audio && (
                      <div className="mt-1 mb-2">
                        <audio
                          src={msg.audio}
                          controls
                          className="w-full max-w-[200px] h-8"
                        />
                      </div>
                    )}

                    {/* Mensagem */}
                    {msg.message && (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {renderMessageText(msg.message, msg.mentions)}
                      </p>
                    )}

                    {/* Timestamp + reaction count */}
                    <div className={`flex items-center gap-2 mt-1 ${
                      msg.isAdmin ? 'text-red-200' : isOwn ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      <span className="text-xs">{formatTime(msg.timestamp)}</span>
                      {msg.isPinned && <span className="text-xs">📌</span>}
                      {totalReactions >= 5 && (
                        <span className="text-xs font-bold" title={`${totalReactions} reações`}>
                          💎 {totalReactions}
                        </span>
                      )}
                    </div>

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => !isReadOnly && handleReaction(msg.id, emoji)}
                            className={`text-xs px-1.5 py-0.5 rounded-full border transition-all duration-200 ${
                              users.includes(account?.toLowerCase())
                                ? 'bg-blue-100 border-blue-400 scale-110'
                                : 'bg-gray-100 border-gray-300 hover:scale-105'
                            }`}
                            disabled={isReadOnly}
                          >
                            {emoji} {users.length}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Ações hover (apenas se não read-only) */}
                    {!isReadOnly && (
                      <div className="absolute -top-2 right-0 hidden group-hover:flex gap-1 bg-white rounded-full shadow-lg px-1 py-0.5 border z-10">
                        {/* Reagir (apenas no chat global) */}
                        {chatMode === 'global' && (
                          <button
                            onClick={() => setShowReactions(showReactions === msg.id ? null : msg.id)}
                            className="text-xs px-1 hover:bg-gray-100 rounded"
                            title="Reagir"
                          >
                            😀
                          </button>
                        )}

                        {/* Responder (apenas no chat global) */}
                        {chatMode === 'global' && (
                          <button
                            onClick={() => handleReply(msg)}
                            className="text-xs px-1 hover:bg-gray-100 rounded"
                            title="Responder"
                          >
                            ↩️
                          </button>
                        )}

                        {/* Compartilhar */}
                        {chatMode === 'global' && msg.message && (
                          <button
                            onClick={() => setShareMenuId(shareMenuId === msg.id ? null : msg.id)}
                            className="text-xs px-1 hover:bg-gray-100 rounded"
                            title="Compartilhar"
                          >
                            🔗
                          </button>
                        )}

                        {/* Admin actions */}
                        {chatMode === 'global' && userData?.isAdmin && (
                          <>
                            <button
                              onClick={() => handlePin(msg.id)}
                              className="text-xs px-1 hover:bg-gray-100 rounded"
                              title={msg.isPinned ? 'Desfixar' : 'Fixar'}
                            >
                              📌
                            </button>
                            <button
                              onClick={() => handleDelete(msg.id)}
                              className="text-xs px-1 hover:bg-red-100 rounded text-red-600"
                              title="Deletar"
                            >
                              🗑️
                            </button>
                            {!msg.isAdmin && (
                              <button
                                onClick={() => handleBan(msg.address)}
                                className="text-xs px-1 hover:bg-red-100 rounded text-red-600"
                                title="Banir"
                              >
                                🚫
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Share menu */}
                    {shareMenuId === msg.id && (
                      <div className="absolute -top-16 right-0 bg-white rounded-lg shadow-lg border p-2 z-20 panel-slide">
                        <div className="flex gap-1">
                          <button
                            onClick={() => shareAsText(msg)}
                            className="text-xs px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-1"
                            title="Copiar texto"
                          >
                            📋 Copiar
                          </button>
                          <button
                            onClick={() => shareAsImage(msg)}
                            className="text-xs px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-1"
                            title="Gerar imagem"
                          >
                            🖼️ Imagem
                          </button>
                          <button
                            onClick={() => shareOnX(msg)}
                            className="text-xs px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-1"
                            title="Compartilhar no X"
                          >
                            𝕏 Post
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Reaction picker */}
                    {showReactions === msg.id && (
                      <div className="absolute -top-10 right-0 bg-white rounded-full shadow-lg px-2 py-1 border flex gap-1 z-10">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className="text-lg hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* TYPING INDICATOR */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-1 panel-slide">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
              <span>
                {typingUsers.length === 1
                  ? `@${typingUsers[0].slice(-4)} está digitando...`
                  : typingUsers.length <= 3
                  ? `${typingUsers.map(a => '@' + a.slice(-4)).join(', ')} estão digitando...`
                  : `${typingUsers.length} pessoas estão digitando...`
                }
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ERRO */}
        {error && (
          <div className="bg-red-100 border-t border-red-300 text-red-700 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {/* REPLY PREVIEW */}
        {replyTo && (
          <div className="bg-gray-100 border-t border-gray-300 px-4 py-2 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium">↩️ Respondendo a {formatShortAddress(replyTo.address)}:</span>{' '}
              <span className="truncate">{replyTo.message?.substring(0, 30)}...</span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* IMAGE PREVIEW */}
        {imagePreview && (
          <div className="bg-gray-100 border-t border-gray-300 px-4 py-2 flex items-center gap-3">
            <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
            <div className="flex-1 text-sm text-gray-600">
              📷 Imagem selecionada
            </div>
            <button
              onClick={removeImage}
              className="text-red-500 hover:text-red-700 text-lg"
            >
              ✕
            </button>
          </div>
        )}

        {/* AUDIO PREVIEW */}
        {audioPreview && (
          <div className="bg-gray-100 border-t border-gray-300 px-4 py-2 flex items-center gap-3">
            <audio src={audioPreview} controls className="h-8 flex-1" />
            <button
              onClick={cancelRecording}
              className="text-red-500 hover:text-red-700 text-lg"
            >
              ✕
            </button>
          </div>
        )}

        {/* RECORDING INDICATOR */}
        {isRecording && (
          <div className="bg-red-100 border-t border-red-300 px-4 py-2 flex items-center gap-3">
            <span className="animate-pulse text-red-600 text-2xl">🎤</span>
            <div className="flex-1">
              <span className="text-red-700 font-medium">Gravando...</span>
              <span className="ml-2 text-red-600">{formatRecordingTime(recordingTime)}</span>
              <span className="ml-2 text-xs text-red-400">(máx 1 min)</span>
            </div>
            <button
              onClick={stopRecording}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm"
            >
              Parar
            </button>
            <button
              onClick={cancelRecording}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* INPUT */}
        <div className="border-t border-gray-200 p-3 bg-white rounded-b-lg">
          {isReadOnly ? (
            <div className="text-center text-gray-500 text-sm py-2">
              {!account
                ? '👀 Modo leitura — Conecte sua carteira para participar'
                : error || 'Verificando acesso...'
              }
            </div>
          ) : (
            <div className="flex gap-2">
              {/* Botão de imagem */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || isSending || isRecording}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                title="Enviar imagem (máx 500KB)"
              >
                📷
              </button>

              {/* Botão de áudio */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!isConnected || isSending || selectedImage || audioBlob}
                className={`px-3 py-2 border rounded-lg disabled:opacity-50 ${
                  isRecording
                    ? 'bg-red-100 border-red-400 text-red-600'
                    : 'border-gray-300 hover:bg-gray-100'
                }`}
                title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
              >
                🎤
              </button>

              <input
                ref={inputRef}
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={
                  chatMode === 'private'
                    ? 'Mensagem privada...'
                    : 'Digite sua mensagem... (use @1234 para mencionar)'
                }
                maxLength={500}
                disabled={!isConnected || isSending || isRecording}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSend}
                disabled={!isConnected || (!newMessage.trim() && !selectedImage && !audioBlob) || isSending || isRecording}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Enviar
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1 text-center">
            {isReadOnly ? (
              '👀 Conecte carteira com ZOD para interagir'
            ) : (
              <>
                {newMessage.length}/500 caracteres
                {selectedImage && ' • 📷 Imagem anexada'}
                {audioBlob && ' • 🎤 Áudio anexado'}
                {chatMode === 'private' && ' • 🔒 Modo privado'}
                {' • Dê duplo clique para ❤️'}
              </>
            )}
          </p>
        </div>
      </div>

      {/* FULLSCREEN IMAGE MODAL */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[200] bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
            onClick={() => setFullscreenImage(null)}
          >
            ✕
          </button>
          <img
            src={fullscreenImage}
            alt="Imagem em tela cheia"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default GlobalChat;
