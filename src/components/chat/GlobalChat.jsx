import React, { useState, useRef, useCallback, useEffect } from 'react';
import ChatStyles from './ChatStyles.jsx';
import ChatHeader from './ChatHeader.jsx';
import ChatMessage from './ChatMessage.jsx';
import ChatInput from './ChatInput.jsx';
import { LeaderboardPanel, HighlightsPanel, SocialMemoryPanel, PollsPanel, ConversationsPanel } from './ChatPanels.jsx';
import useChatSocket from './useChatSocket.js';
import useChatAudio from './useChatAudio.js';
import { formatAddress, formatShortAddress, formatTime, formatTimeRemaining, getTotalReactions, blobToBase64 } from './chatHelpers.js';

// Generate identicon color from address
const getIdenticonColor = (address) => {
  if (!address) return 'linear-gradient(135deg, #6366f1, #8b5cf6)';
  const colors = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
    'linear-gradient(135deg, #3b82f6, #2563eb)',
    'linear-gradient(135deg, #ec4899, #db2777)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
    'linear-gradient(135deg, #f97316, #ea580c)',
  ];
  const index = parseInt(address.slice(-2), 16) % colors.length;
  return colors[index];
};

const GlobalChat = ({ account, isOpen, onClose }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showReactions, setShowReactions] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [shareMenuId, setShareMenuId] = useState(null);
  const [chatMode, setChatMode] = useState('global');
  const [privateTarget, setPrivateTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('feed'); // feed, chats, rankings, perfil
  const [feedFilter, setFeedFilter] = useState('all'); // all, following

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageRefs = useRef({});

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToMessage = useCallback((messageId) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 3000);
    }
  }, []);

  const triggerReactionAnimation = useCallback(() => {}, []);

  const socket = useChatSocket({
    account,
    isOpen,
    scrollToBottom,
    scrollToMessage,
    triggerReactionAnimation,
  });

  const audio = useChatAudio(socket.setError);

  // Following set derived from socket data
  const followingSet = new Set(socket.following || []);

  const toggleFollow = useCallback((address) => {
    if (!address || !account) return;
    const addr = address.toLowerCase();
    if (followingSet.has(addr)) {
      socket.unfollowUser(addr);
    } else {
      socket.followUser(addr);
    }
  }, [account, followingSet, socket]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Load data when tab changes
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'feed') {
      socket.requestPolls();
    } else if (activeTab === 'rankings') {
      socket.requestLeaderboard();
      socket.requestHighlights();
      socket.requestSocialMemory();
      socket.requestPolls();
    } else if (activeTab === 'chats') {
      socket.getConversations();
    } else if (activeTab === 'perfil') {
      socket.getFollowing();
      socket.getFollowers();
      socket.getFollowCounts();
    }
  }, [activeTab, isOpen]);

  const renderBadges = useCallback((badges) => {
    if (!badges || badges.length === 0) return null;
    return (
      <span className="inline-flex gap-1 ml-1">
        {badges.map((badge) => (
          <span
            key={badge.id}
            title={badge.label}
            className="badge-pill"
            style={{
              background: `${badge.color}22`,
              color: badge.color,
              border: `1px solid ${badge.color}44`
            }}
          >
            {badge.emoji}
          </span>
        ))}
      </span>
    );
  }, []);

  const renderMessageText = useCallback((text, mentions = []) => {
    if (!mentions || mentions.length === 0) return <span>{text}</span>;
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
                  ? 'bg-amber-400/30 text-amber-200 animate-pulse'
                  : 'bg-amber-400/20 text-amber-300'
              }`}
            >
              {part}
            </span>
          );
        }
      }
      return <span key={idx}>{part}</span>;
    });
  }, [account]);

  // Share functions
  const shareAsText = useCallback((msg) => {
    const addr = formatAddress(msg.address);
    const text = `"${msg.message}" — ${addr} no ZOD Social\n\nhttps://unionzod.com`;
    navigator.clipboard.writeText(text).then(() => {
      socket.setNotification('Mensagem copiada!');
      setTimeout(() => socket.setNotification(null), 2000);
    });
    setShareMenuId(null);
  }, [socket]);

  const shareOnX = useCallback((msg) => {
    const addr = formatAddress(msg.address);
    const text = encodeURIComponent(
      `"${msg.message?.substring(0, 200)}" — ${addr} no ZOD Social 🔥\n\nhttps://unionzod.com`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
    setShareMenuId(null);
  }, []);

  const shareAsImage = useCallback((msg) => {
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 600, 300);
    gradient.addColorStop(0, '#0d1117'); gradient.addColorStop(1, '#1a2435');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 600, 300);
    ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.strokeRect(10, 10, 580, 280);
    ctx.font = '24px serif'; ctx.fillText(msg.status?.emoji || '⚪', 30, 60);
    ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#a5b4fc'; ctx.fillText(formatAddress(msg.address), 60, 58);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#e0e7ff';
    const words = (msg.message || '').split(' ');
    let line = ''; let y = 100;
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > 540) { ctx.fillText(line, 30, y); line = word + ' '; y += 28; if (y > 220) { ctx.fillText(line + '...', 30, y); break; } } else { line = testLine; }
    }
    if (y <= 220) ctx.fillText(line, 30, y);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#6366f1';
    ctx.fillText('ZOD Social — unionzod.com', 30, 280);
    ctx.fillText(formatTime(msg.timestamp), 500, 280);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `zod-social-${msg.id}.png`; a.click(); URL.revokeObjectURL(url);
    });
    setShareMenuId(null);
    socket.setNotification('Imagem gerada!');
    setTimeout(() => socket.setNotification(null), 2000);
  }, [socket]);

  // Image handling
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { socket.setError('Apenas imagens são permitidas'); return; }
    if (file.size > 500000) { socket.setError('Imagem muito grande (máx 500KB)'); return; }
    const reader = new FileReader();
    reader.onload = (event) => { setSelectedImage(event.target.result); setImagePreview(event.target.result); };
    reader.readAsDataURL(file);
  };

  const removeImage = () => { setSelectedImage(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const openPrivateChat = useCallback((targetAddress) => {
    if (!account) return;
    if (targetAddress.toLowerCase() === account.toLowerCase()) return;
    setPrivateTarget(targetAddress.toLowerCase());
    setChatMode('private');
    setActiveTab('chats');
    socket.loadPrivateChat(targetAddress);
  }, [account, socket]);

  const backToGlobal = useCallback(() => {
    setChatMode('global');
    setPrivateTarget(null);
    setActiveTab('feed');
    socket.setPrivateMessages([]);
  }, [socket]);

  const handleSend = async () => {
    const hasContent = newMessage.trim() || selectedImage || audio.audioBlob;
    if (!hasContent || !account || isSending || !socket.isAuthenticated) return;
    setIsSending(true);
    socket.setError('');
    try {
      let audioData = null;
      if (audio.audioBlob) {
        audioData = await blobToBase64(audio.audioBlob);
        if (audioData.length > 1000000) { socket.setError('Áudio muito grande (máx 1MB)'); setIsSending(false); return; }
      }
      if (chatMode === 'private' && privateTarget) {
        socket.sendPrivateMessage({ targetAddress: privateTarget, message: newMessage.trim(), image: selectedImage || null, audio: audioData });
      } else {
        socket.sendMessage({ message: newMessage.trim(), replyTo: replyTo?.id || null, image: selectedImage || null, audio: audioData });
      }
      setNewMessage(''); setReplyTo(null); setSelectedImage(null); setImagePreview(null);
      audio.clearAudio();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) { console.error('Erro ao enviar:', err); socket.setError('Erro ao enviar mensagem'); }
    setIsSending(false);
  };

  const handleInputChange = (e) => { setNewMessage(e.target.value); socket.handleTyping(); };
  const handleKeyPress = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const insertMention = useCallback((address) => { setNewMessage((prev) => prev + `@${address.slice(-4)} `); inputRef.current?.focus(); }, []);
  const handleDoubleClick = useCallback((messageId) => { socket.addReaction(messageId, '❤️'); }, [socket]);

  const getReplyMessage = (replyId) => socket.messages.find(m => m.id === replyId);
  const isReadOnly = !account || !socket.isAuthenticated;
  const allMessages = chatMode === 'global' ? socket.messages : socket.privateMessages;
  const currentMessages = feedFilter === 'following' && chatMode === 'global'
    ? allMessages.filter(msg => followingSet.has((msg.address || msg.from || '').toLowerCase()))
    : allMessages;
  const activePolls = socket.polls.filter(p => p.isActive && Date.now() < p.endsAt);

  if (!isOpen) return null;

  // NAV ITEMS
  const navItems = [
    { id: 'feed', icon: '🏠', label: 'Feed', onClick: () => { setActiveTab('feed'); if (chatMode === 'private') backToGlobal(); } },
    { id: 'chats', icon: '💬', label: 'Chats', badge: socket.unreadPrivate, onClick: () => { setActiveTab('chats'); } },
    { id: 'rankings', icon: '🏆', label: 'Rankings', onClick: () => { setActiveTab('rankings'); } },
    { id: 'perfil', icon: '👤', label: 'Perfil', onClick: () => { setActiveTab('perfil'); } },
  ];

  // ===========================
  // RENDER FEED TAB
  // ===========================
  const renderFeedInput = () => (
    <div className="sticky top-0 z-20 max-w-xl mx-auto px-4 pt-4 pb-1"
      style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0d1117 85%, transparent 100%)' }}
    >
      <ChatInput
        chatMode={chatMode}
        isReadOnly={isReadOnly}
        isConnected={socket.isConnected}
        isSending={isSending}
        newMessage={newMessage}
        error={socket.error}
        account={account}
        selectedImage={selectedImage}
        imagePreview={imagePreview}
        audioBlob={audio.audioBlob}
        audioPreview={audio.audioPreview}
        isRecording={audio.isRecording}
        recordingTime={audio.recordingTime}
        replyTo={replyTo}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        onMessageChange={handleInputChange}
        onKeyPress={handleKeyPress}
        onSend={handleSend}
        onImageSelect={handleImageSelect}
        onRemoveImage={removeImage}
        onStartRecording={audio.startRecording}
        onStopRecording={audio.stopRecording}
        onCancelRecording={audio.cancelRecording}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );

  const renderFeedTab = () => (
    <>
      {/* Feed filter tabs */}
      {account && (
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 mb-2">
          <button
            onClick={() => setFeedFilter('all')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              feedFilter === 'all'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFeedFilter('following')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              feedFilter === 'following'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Seguindo
            {followingSet.size > 0 && (
              <span className="text-[10px] bg-indigo-500/30 px-1.5 rounded-full">{followingSet.size}</span>
            )}
          </button>
        </div>
      )}

      {/* Pinned messages */}
      {socket.pinnedMessages.length > 0 && (
        <div className="post-card p-3">
          <p className="text-xs font-bold text-amber-400 mb-2">📌 Fixadas</p>
          {socket.pinnedMessages.slice(-2).map((msg) => (
            <div key={msg.id}
              className="text-xs text-gray-400 truncate cursor-pointer hover:text-amber-300 transition-colors py-1"
              onClick={() => scrollToMessage(msg.id)}
            >
              <span className="font-mono text-amber-400/60">@{formatShortAddress(msg.address)}:</span> {msg.message}
            </div>
          ))}
        </div>
      )}

      {/* Active polls pinned in feed */}
      {activePolls.length > 0 && activePolls.map((poll) => {
        const isExpired = !poll.isActive || Date.now() > poll.endsAt;
        if (isExpired) return null;
        return (
          <div key={poll.id} className="post-card p-4 border-emerald-500/20 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)' }}
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-300"></div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">📌 🗳️ Enquete Ativa</span>
              <span className="text-[10px] text-emerald-400/60 ml-auto">⏳ {formatTimeRemaining(poll.endsAt)}</span>
            </div>
            <p className="text-sm font-semibold text-gray-200 mb-1">{poll.question}</p>
            <p className="text-[10px] text-emerald-400/60 mb-3">
              {poll.totalVotes} voto{poll.totalVotes !== 1 ? 's' : ''}
              {poll.allowMultiple && ' • Múltipla escolha'}
            </p>
            <div className="space-y-1.5">
              {poll.options.map((opt) => {
                const percentage = poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;
                const isMyVote = opt.myVote;
                return (
                  <button
                    key={opt.id}
                    onClick={() => !isReadOnly && socket.votePoll(poll.id, opt.id)}
                    disabled={isReadOnly}
                    className={`w-full text-left relative overflow-hidden rounded-lg border transition-all ${
                      isMyVote
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-gray-700/50 bg-white/5 hover:border-emerald-500/30'
                    } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                        isMyVote ? 'bg-emerald-500/20' : 'bg-white/5'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                    <div className="relative flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-gray-300 flex items-center gap-1">
                        {isMyVote && <span className="text-emerald-400">✓</span>}
                        {opt.text}
                      </span>
                      <span className="text-xs font-bold text-gray-400 ml-2">
                        {percentage}% <span className="font-normal text-gray-500">({opt.voteCount})</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="post-card p-4 text-center">
          <p className="text-indigo-300 text-sm">👀 <strong>Modo Leitura</strong> — Conecte sua carteira com ZOD para participar</p>
        </div>
      )}

      {/* Empty state */}
      {currentMessages.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          <p className="text-5xl mb-3">{feedFilter === 'following' ? '👥' : '💬'}</p>
          <p className="text-sm">
            {feedFilter === 'following'
              ? followingSet.size === 0
                ? 'Você ainda não segue ninguém'
                : 'Nenhuma publicação de quem você segue'
              : 'Nenhuma publicação ainda'
            }
          </p>
          {feedFilter === 'following' && followingSet.size === 0 && (
            <p className="text-xs text-gray-600 mt-2">Toque em "Seguir" nos posts para acompanhar outros usuários</p>
          )}
        </div>
      )}

      {/* Posts */}
      {currentMessages.map((msg) => {
        const replyMsg = msg.replyTo ? getReplyMessage(msg.replyTo) : null;
        return (
          <ChatMessage
            key={msg.id}
            msg={{ ...msg, replyData: replyMsg }}
            account={account}
            isReadOnly={isReadOnly}
            chatMode={chatMode}
            highlightedMessageId={highlightedMessageId}
            reactionAnimations={socket.reactionAnimations}
            showReactions={showReactions}
            shareMenuId={shareMenuId}
            userData={socket.userData}
            messageRefs={messageRefs}
            isFollowing={followingSet.has((msg.address || msg.from || '').toLowerCase())}
            onToggleFollow={toggleFollow}
            onReaction={socket.addReaction}
            onSetShowReactions={setShowReactions}
            onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
            onInsertMention={insertMention}
            onOpenPrivateChat={openPrivateChat}
            onPin={socket.pinMessage}
            onDelete={socket.deleteMessage}
            onBan={socket.banUser}
            onDoubleClick={handleDoubleClick}
            onShareAsText={shareAsText}
            onShareAsImage={shareAsImage}
            onShareOnX={shareOnX}
            onSetShareMenuId={setShareMenuId}
            onSetFullscreenImage={setFullscreenImage}
            onScrollToMessage={scrollToMessage}
            renderMessageText={renderMessageText}
            renderBadges={renderBadges}
          />
        );
      })}

      {/* Typing indicator */}
      {socket.typingUsers.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2 panel-slide">
          <span className="flex gap-0.5">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </span>
          <span>
            {socket.typingUsers.length === 1
              ? `@${socket.typingUsers[0].slice(-4)} está digitando...`
              : socket.typingUsers.length <= 3
              ? `${socket.typingUsers.map(a => '@' + a.slice(-4)).join(', ')} estão digitando...`
              : `${socket.typingUsers.length} pessoas estão digitando...`
            }
          </span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );

  // ===========================
  // RENDER CHATS TAB
  // ===========================
  const renderChatsTab = () => (
    <>
      {chatMode === 'private' ? (
        <>
          {/* Private chat header */}
          <div className="post-card p-3 flex items-center gap-3">
            <button onClick={backToGlobal} className="text-gray-400 hover:text-white transition-colors text-lg">←</button>
            <div className="identicon" style={{ background: getIdenticonColor(privateTarget), width: 36, height: 36, fontSize: 13 }}>
              {privateTarget ? privateTarget.slice(-2).toUpperCase() : '??'}
            </div>
            <div>
              <p className="text-white text-sm font-bold">@{privateTarget?.slice(0, 6)}...{privateTarget?.slice(-4)}</p>
              <p className="text-gray-500 text-[10px]">{socket.privateTargetData?.status?.label || 'Holder'}</p>
            </div>
          </div>

          {/* Private messages */}
          {socket.privateMessages.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-5xl mb-3">🔒</p>
              <p className="text-sm">Inicie uma conversa privada</p>
            </div>
          )}

          {socket.privateMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              account={account}
              isReadOnly={isReadOnly}
              chatMode={chatMode}
              highlightedMessageId={highlightedMessageId}
              reactionAnimations={socket.reactionAnimations}
              showReactions={showReactions}
              shareMenuId={shareMenuId}
              userData={socket.userData}
              messageRefs={messageRefs}
              onReaction={socket.addReaction}
              onSetShowReactions={setShowReactions}
              onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
              onInsertMention={insertMention}
              onOpenPrivateChat={openPrivateChat}
              onPin={socket.pinMessage}
              onDelete={socket.deleteMessage}
              onBan={socket.banUser}
              onDoubleClick={handleDoubleClick}
              onShareAsText={shareAsText}
              onShareAsImage={shareAsImage}
              onShareOnX={shareOnX}
              onSetShareMenuId={setShareMenuId}
              onSetFullscreenImage={setFullscreenImage}
              onScrollToMessage={scrollToMessage}
              renderMessageText={renderMessageText}
              renderBadges={renderBadges}
            />
          ))}

          {/* Private input */}
          <ChatInput
            chatMode="private"
            isReadOnly={isReadOnly}
            isConnected={socket.isConnected}
            isSending={isSending}
            newMessage={newMessage}
            error={socket.error}
            account={account}
            selectedImage={selectedImage}
            imagePreview={imagePreview}
            audioBlob={audio.audioBlob}
            audioPreview={audio.audioPreview}
            isRecording={audio.isRecording}
            recordingTime={audio.recordingTime}
            replyTo={replyTo}
            fileInputRef={fileInputRef}
            inputRef={inputRef}
            onMessageChange={handleInputChange}
            onKeyPress={handleKeyPress}
            onSend={handleSend}
            onImageSelect={handleImageSelect}
            onRemoveImage={removeImage}
            onStartRecording={audio.startRecording}
            onStopRecording={audio.stopRecording}
            onCancelRecording={audio.cancelRecording}
            onCancelReply={() => setReplyTo(null)}
          />

          <div ref={messagesEndRef} />
        </>
      ) : (
        <>
          {/* Conversations list */}
          <div className="post-card p-4">
            <h2 className="text-white font-bold text-base mb-4 flex items-center gap-2">
              💬 Conversas Privadas
              {socket.unreadPrivate > 0 && (
                <span className="bg-red-500 text-white text-[10px] rounded-full px-2 py-0.5 font-bold">{socket.unreadPrivate}</span>
              )}
            </h2>

            {socket.conversations.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">Nenhuma conversa ainda</p>
                <p className="text-xs text-gray-600 mt-1">Toque no menu ⋯ de um post para enviar uma mensagem privada</p>
              </div>
            ) : (
              <div className="space-y-1">
                {socket.conversations.map((conv) => (
                  <button
                    key={conv.address}
                    onClick={() => openPrivateChat(conv.address)}
                    className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <div className="identicon relative" style={{ background: getIdenticonColor(conv.address) }}>
                      {conv.address.slice(-2).toUpperCase()}
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#141c28]"></span>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white font-medium">@{formatAddress(conv.address)}</span>
                        {conv.status && <span className="text-[10px]">{conv.status.emoji}</span>}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  // ===========================
  // RENDER RANKINGS TAB
  // ===========================
  const renderRankingsTab = () => (
    <>
      <h2 className="text-white font-bold text-base mb-4 flex items-center gap-2">🏆 Rankings & Comunidade</h2>

      {/* Leaderboard */}
      <div className="post-card overflow-hidden mb-4">
        <LeaderboardPanel leaderboard={socket.leaderboard} onClose={() => {}} />
      </div>

      {/* Highlights */}
      <div className="post-card overflow-hidden mb-4">
        <HighlightsPanel
          communityHighlights={socket.communityHighlights}
          onClose={() => {}}
          onScrollToMessage={(id) => { setActiveTab('feed'); setTimeout(() => scrollToMessage(id), 300); }}
          getTotalReactions={getTotalReactions}
        />
      </div>

      {/* Social Memory */}
      <div className="post-card overflow-hidden mb-4">
        <SocialMemoryPanel socialMemory={socket.socialMemory} onClose={() => {}} />
      </div>

      {/* Polls */}
      <div className="post-card overflow-hidden">
        <PollsPanel
          polls={socket.polls}
          userData={socket.userData}
          isReadOnly={isReadOnly}
          onClose={() => {}}
          onVote={socket.votePoll}
          onCreate={socket.createPoll}
          onClosePoll={socket.closePoll}
          onDeletePoll={socket.deletePoll}
        />
      </div>
    </>
  );

  // ===========================
  // RENDER PERFIL TAB
  // ===========================
  const renderPerfilTab = () => (
    <>
      {account ? (
        <>
          {/* Profile card */}
          <div className="post-card p-6 text-center">
            <div
              className="identicon mx-auto mb-4"
              style={{ background: getIdenticonColor(account), width: 80, height: 80, fontSize: 28 }}
            >
              {account.slice(-2).toUpperCase()}
            </div>

            <p className="text-white font-bold text-lg">@{account.slice(0, 6)}...{account.slice(-4)}</p>
            <p className="text-gray-500 text-xs font-mono mt-1">{account}</p>

            {/* Status & Badges */}
            {socket.userData?.status && (
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                <span
                  className="badge-pill text-xs"
                  style={{
                    background: `${socket.userData.status.color || '#6366f1'}22`,
                    color: socket.userData.status.color || '#818cf8',
                    border: `1px solid ${socket.userData.status.color || '#6366f1'}44`
                  }}
                >
                  {socket.userData.status.emoji} {socket.userData.status.label}
                </span>
                {renderBadges(socket.userData.badges)}
              </div>
            )}

            {/* Following stats */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="text-center">
                <p className="text-white font-bold text-lg">{socket.followCounts?.followers || 0}</p>
                <p className="text-gray-500 text-[10px]">Seguidores</p>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">{socket.followCounts?.following || 0}</p>
                <p className="text-gray-500 text-[10px]">Seguindo</p>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">{socket.messages.filter(m => (m.address || '').toLowerCase() === account?.toLowerCase()).length}</p>
                <p className="text-gray-500 text-[10px]">Posts</p>
              </div>
            </div>

            {/* Connection status */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className={`w-2 h-2 rounded-full ${socket.isConnected ? 'bg-emerald-400' : 'bg-red-500'}`}></span>
              <span className="text-xs text-gray-400">{socket.isConnected ? 'Conectado' : 'Desconectado'}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="post-card p-4">
            <h3 className="text-white font-bold text-sm mb-3">Informações</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Status</span>
                <span className="text-white">{socket.userData?.status?.label || 'Carregando...'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Usuários online</span>
                <span className="text-emerald-400">{socket.userCount}</span>
              </div>
              {socket.userData?.isAdmin && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Role</span>
                  <span className="text-amber-400 font-bold">Admin</span>
                </div>
              )}
            </div>
          </div>

          {/* Following list */}
          {(socket.following || []).length > 0 && (
            <div className="post-card p-4">
              <h3 className="text-white font-bold text-sm mb-3">Seguindo ({socket.following.length})</h3>
              <div className="space-y-2">
                {socket.following.map((addr) => (
                  <div key={addr} className="flex items-center gap-2.5">
                    <div className="identicon" style={{ background: getIdenticonColor(addr), width: 32, height: 32, fontSize: 11 }}>
                      {addr.slice(-2).toUpperCase()}
                    </div>
                    <span className="text-xs text-gray-300 font-mono flex-1">@{addr.slice(0, 6)}...{addr.slice(-4)}</span>
                    <button
                      onClick={() => socket.unfollowUser(addr)}
                      className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                    >
                      Deixar de seguir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Followers list */}
          {(socket.followers || []).length > 0 && (
            <div className="post-card p-4">
              <h3 className="text-white font-bold text-sm mb-3">Seguidores ({socket.followers.length})</h3>
              <div className="space-y-2">
                {socket.followers.map((addr) => (
                  <div key={addr} className="flex items-center gap-2.5">
                    <div className="identicon" style={{ background: getIdenticonColor(addr), width: 32, height: 32, fontSize: 11 }}>
                      {addr.slice(-2).toUpperCase()}
                    </div>
                    <span className="text-xs text-gray-300 font-mono flex-1">@{addr.slice(0, 6)}...{addr.slice(-4)}</span>
                    {!followingSet.has(addr) && (
                      <button
                        onClick={() => socket.followUser(addr)}
                        className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                      >
                        Seguir de volta
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="post-card p-8 text-center">
          <p className="text-5xl mb-4">👤</p>
          <p className="text-gray-400 text-sm">Conecte sua carteira para ver seu perfil</p>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#0b0f17' }}>
      <ChatStyles />

      {/* TOP BAR */}
      <ChatHeader
        chatMode={chatMode}
        privateTarget={privateTarget}
        isConnected={socket.isConnected}
        userCount={socket.userCount}
        isAuthenticated={socket.isAuthenticated}
        unreadPrivate={socket.unreadPrivate}
        onClose={onClose}
        onLoadConversations={() => setActiveTab('chats')}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT SIDEBAR (desktop) */}
        <aside className="hidden md:flex flex-col w-56 p-4 border-r border-white/5 social-scrollbar overflow-y-auto"
          style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0b0f17 100%)' }}
        >
          <nav className="space-y-1 mb-6">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`nav-item w-full flex items-center gap-3 text-left ${
                  activeTab === item.id ? 'active' : 'text-gray-400'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Hot topic */}
          {activePolls.length > 0 && (
            <div className="sidebar-card p-3 mb-4 cursor-pointer hover:border-emerald-500/30 transition-all"
              onClick={() => setActiveTab('rankings')}
            >
              <p className="text-amber-400 text-xs font-bold mb-1">🔥 Enquete Ativa | Participe!</p>
              <p className="text-gray-400 text-xs truncate">{activePolls[0]?.question}</p>
            </div>
          )}

          {/* Top da Semana (mini) */}
          {socket.leaderboard?.topUsersReacted?.length > 0 && (
            <div className="sidebar-card p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white text-xs font-bold">Top da Semana</p>
                <button onClick={() => setActiveTab('rankings')} className="text-gray-500 text-[10px] hover:text-indigo-400">Ver mais</button>
              </div>
              {socket.leaderboard.topUsersReacted.slice(0, 3).map((u) => (
                <div key={u.address} className="flex items-center gap-2 py-1">
                  <div className="identicon" style={{ background: getIdenticonColor(u.address), width: 24, height: 24, fontSize: 9 }}>
                    {u.address.slice(-2).toUpperCase()}
                  </div>
                  <span className="text-xs text-gray-300 font-mono flex-1">{formatAddress(u.address)}</span>
                  <span className="text-[10px] text-amber-400">❤️</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* CENTER CONTENT */}
        <main className="flex-1 overflow-y-auto social-scrollbar relative"
          style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0f1520 100%)' }}
        >
          {activeTab === 'feed' && renderFeedInput()}
          <div className="max-w-xl mx-auto p-4 space-y-4">
            {activeTab === 'feed' && renderFeedTab()}
            {activeTab === 'chats' && renderChatsTab()}
            {activeTab === 'rankings' && renderRankingsTab()}
            {activeTab === 'perfil' && renderPerfilTab()}
          </div>
        </main>

        {/* RIGHT SIDEBAR (desktop) */}
        <aside className="hidden lg:flex flex-col w-72 p-4 border-l border-white/5 social-scrollbar overflow-y-auto gap-4"
          style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0b0f17 100%)' }}
        >
          {/* Profile card */}
          {account && (
            <div className="sidebar-card p-4 text-center">
              <div className="identicon mx-auto mb-3" style={{ background: getIdenticonColor(account), width: 64, height: 64, fontSize: 22 }}>
                {account.slice(-2).toUpperCase()}
              </div>
              <p className="text-white font-bold text-sm">@{account.slice(0, 6)}...{account.slice(-4)}</p>
              {socket.userData?.status && (
                <div className="flex items-center justify-center gap-1 mt-2 flex-wrap">
                  <span className="badge-pill" style={{
                    background: `${socket.userData.status.color || '#6366f1'}22`,
                    color: socket.userData.status.color || '#818cf8',
                    border: `1px solid ${socket.userData.status.color || '#6366f1'}44`
                  }}>
                    {socket.userData.status.emoji} {socket.userData.status.label}
                  </span>
                  {renderBadges(socket.userData.badges)}
                </div>
              )}
              <p className="text-gray-500 text-[10px] mt-2 font-mono">@{account.slice(0, 6)}...{account.slice(-4)}</p>
            </div>
          )}

          {/* Rankings da Semana */}
          <div className="sidebar-card p-4">
            <h3 className="text-white font-bold text-sm mb-3">Rankings da Semana</h3>
            <div className="space-y-2">
              <button onClick={() => setActiveTab('rankings')} className="w-full flex items-center gap-2 text-left text-gray-400 hover:text-amber-400 transition-colors text-xs py-1">
                <span>🏆</span> Mais Curtidas
              </button>
              <button onClick={() => setActiveTab('rankings')} className="w-full flex items-center gap-2 text-left text-gray-400 hover:text-purple-400 transition-colors text-xs py-1">
                <span>⭐</span> Top Mensagens
              </button>
              <button onClick={() => setActiveTab('rankings')} className="w-full flex items-center gap-2 text-left text-gray-400 hover:text-blue-400 transition-colors text-xs py-1">
                <span>📊</span> Mais Mencionados
              </button>
            </div>
            {socket.leaderboard?.topUsersReacted?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                {socket.leaderboard.topUsersReacted.slice(0, 3).map((u) => (
                  <div key={u.address} className="flex items-center gap-2">
                    <div className="identicon" style={{ background: getIdenticonColor(u.address), width: 28, height: 28, fontSize: 10 }}>
                      {u.address.slice(-2).toUpperCase()}
                    </div>
                    <span className="text-xs text-gray-300 font-mono flex-1">@{formatAddress(u.address)}</span>
                    <span className="text-[10px] text-gray-500">❤️</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* NOTIFICATION BANNER */}
      {socket.notification && (
        <div className="absolute bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 max-w-md w-[90%] notif-slide z-50">
          <div className="px-4 py-3 rounded-xl text-sm border border-amber-500/30 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #1a1500, #2a2000)' }}
          >
            <span className="text-amber-300">🔔 {socket.notification}</span>
          </div>
        </div>
      )}

      {/* BOTTOM NAV BAR (mobile) */}
      <nav className="md:hidden flex items-center justify-around py-2 border-t border-white/5"
        style={{ background: '#0d1117' }}
      >
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all ${
              activeTab === item.id ? 'text-indigo-400' : 'text-gray-500'
            }`}
          >
            <span className="text-lg relative">
              {item.icon}
              {item.badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* FULLSCREEN IMAGE */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFullscreenImage(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl transition-colors" onClick={() => setFullscreenImage(null)}>✕</button>
          <img src={fullscreenImage} alt="Imagem em tela cheia" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default GlobalChat;