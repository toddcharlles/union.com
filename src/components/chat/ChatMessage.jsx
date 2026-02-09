import React, { useState } from 'react';
import { REACTIONS, formatAddress, formatShortAddress, formatTime, getTotalReactions } from './chatHelpers.js';

// Generate a deterministic color from wallet address
const getIdenticonColor = (address) => {
  if (!address) return '#6366f1';
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

const ChatMessage = ({
  msg,
  account,
  isReadOnly,
  chatMode,
  highlightedMessageId,
  reactionAnimations,
  showReactions,
  shareMenuId,
  userData,
  messageRefs,
  onReaction,
  onSetShowReactions,
  onReply,
  onInsertMention,
  onOpenPrivateChat,
  onPin,
  onDelete,
  onBan,
  onDoubleClick,
  onShareAsText,
  onShareAsImage,
  onShareOnX,
  onSetShareMenuId,
  isFollowing,
  onToggleFollow,
  onSetFullscreenImage,
  onScrollToMessage,
  renderMessageText,
  renderBadges,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const isOwn = (msg.address || msg.from)?.toLowerCase() === account?.toLowerCase();
  const isHighlighted = highlightedMessageId === msg.id;
  const totalReactions = getTotalReactions(msg.reactions);
  const replyMsg = msg.replyData || null;
  const address = msg.address || msg.from;
  const shortAddr = address ? `@${address.slice(0, 6)}...${address.slice(-4)}` : '';

  return (
    <div
      ref={(el) => { messageRefs.current[msg.id] = el; }}
      className={`post-card p-4 ${isHighlighted ? 'mention-highlight highlight-glow' : ''}`}
      onDoubleClick={() => chatMode === 'global' && !isReadOnly && onDoubleClick(msg.id)}
    >
      {/* Reaction float animations */}
      <div className="relative">
        {reactionAnimations
          .filter(a => a.messageId === msg.id)
          .map(a => (
            <span key={a.id} className="reaction-float">{a.emoji}</span>
          ))
        }
      </div>

      {/* Post Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          {/* Identicon */}
          <div
            className="identicon relative"
            style={{ background: getIdenticonColor(address) }}
          >
            {address ? address.slice(-2).toUpperCase() : '??'}
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#141c28]"></span>
          </div>

          <div>
            {/* Address */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => chatMode === 'global' && !isReadOnly ? onInsertMention(address) : null}
                className={`font-bold text-sm ${
                  isOwn ? 'text-indigo-300' : 'text-white'
                } ${chatMode === 'global' && !isReadOnly ? 'hover:text-indigo-400 cursor-pointer' : 'cursor-default'}`}
              >
                {shortAddr}
              </button>

              {/* Status badge */}
              {msg.status && (
                <span
                  className="badge-pill"
                  style={{
                    background: `${msg.status.color || '#6366f1'}22`,
                    color: msg.status.color || '#818cf8',
                    border: `1px solid ${msg.status.color || '#6366f1'}44`
                  }}
                >
                  {msg.status.emoji} {msg.status.label}
                </span>
              )}

              {/* Badges */}
              {msg.badges && msg.badges.length > 0 && (
                <span className="inline-flex gap-1">
                  {msg.badges.map((badge) => (
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
              )}

              {isOwn && (
                <span className="text-[10px] text-indigo-400/60 font-medium">• you</span>
              )}
              {!isOwn && !isReadOnly && onToggleFollow && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFollow(address); }}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all ${
                    isFollowing
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-indigo-500/20 hover:text-indigo-300 hover:border-indigo-500/30'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-gray-500">{formatTime(msg.timestamp)}</span>
          </div>
        </div>

        {/* Three dot menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all text-sm"
          >
            ⋯
          </button>

          {showMenu && (
            <div className="absolute right-0 top-8 bg-[#1a2435] rounded-xl shadow-2xl border border-white/10 py-1 z-30 min-w-[140px] panel-slide">
              {chatMode === 'global' && !isReadOnly && (
                <>
                  <button
                    onClick={() => { onReply(msg); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                  >
                    ↩️ Reply
                  </button>
                  <button
                    onClick={() => { onSetShowReactions(showReactions === msg.id ? null : msg.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                  >
                    😀 React
                  </button>
                  {!isOwn && (
                    <>
                      <button
                        onClick={() => { onToggleFollow && onToggleFollow(address); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                      >
                        {isFollowing ? '➖ Unfollow' : '➕ Follow'}
                      </button>
                      <button
                        onClick={() => { onOpenPrivateChat(address); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                      >
                        💬 Mensagem Privada
                      </button>
                    </>
                  )}
                  {msg.message && (
                    <>
                      <div className="border-t border-white/5 my-1"></div>
                      <button
                        onClick={() => { onShareAsText(msg); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                      >
                        📋 Copiar
                      </button>
                      <button
                        onClick={() => { onShareAsImage(msg); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                      >
                        🖼️ Salvar Imagem
                      </button>
                      <button
                        onClick={() => { onShareOnX(msg); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                      >
                        𝕏 Compartilhar
                      </button>
                    </>
                  )}
                </>
              )}
              {chatMode === 'global' && userData?.isAdmin && (
                <>
                  <div className="border-t border-white/5 my-1"></div>
                  <button
                    onClick={() => { onPin(msg.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                  >
                    📌 {msg.isPinned ? 'Desfixar' : 'Fixar'}
                  </button>
                  <button
                    onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    🗑️ Deletar
                  </button>
                  {!msg.isAdmin && (
                    <button
                      onClick={() => { onBan(address); setShowMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                    >
                      🚫 Banir
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pinned indicator */}
      {msg.isPinned && (
        <div className="flex items-center gap-1 mb-2 text-[10px] text-amber-400/70">
          📌 Mensagem fixada
        </div>
      )}

      {/* Reply Preview */}
      {replyMsg && (
        <div
          className="mb-2 px-3 py-2 rounded-xl bg-white/5 border-l-2 border-indigo-500/50 cursor-pointer hover:bg-white/8 transition-colors"
          onClick={() => onScrollToMessage(replyMsg.id)}
        >
          <span className="text-[10px] text-indigo-400">↩️ Respondendo @{formatShortAddress(replyMsg.address)}</span>
          <p className="text-xs text-gray-400 truncate mt-0.5">{replyMsg.message?.substring(0, 60)}</p>
        </div>
      )}

      {/* Message content */}
      {msg.message && (
        <p className="text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-2">
          {renderMessageText(msg.message, msg.mentions)}
        </p>
      )}

      {/* Image */}
      {msg.image && (
        <div className="mb-2 rounded-xl overflow-hidden">
          <img
            src={msg.image}
            alt="Imagem"
            className="max-w-full max-h-72 rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onSetFullscreenImage(msg.image)}
          />
        </div>
      )}

      {/* Audio */}
      {msg.audio && (
        <div className="mb-2">
          <audio
            src={msg.audio}
            controls
            className="w-full max-w-[280px] h-8"
            style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.8)' }}
          />
        </div>
      )}

      {/* Action bar - always visible like a social network */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
        <div className="flex items-center gap-4">
          {/* Like button */}
          <button
            onClick={() => !isReadOnly && onReaction(msg.id, '👍')}
            disabled={isReadOnly}
            className={`flex items-center gap-1.5 text-xs transition-all ${
              msg.reactions?.['👍']?.includes(account?.toLowerCase())
                ? 'text-indigo-400'
                : 'text-gray-500 hover:text-indigo-400'
            } disabled:opacity-30`}
          >
            <span className="text-base">👍</span>
            <span>{msg.reactions?.['👍']?.length || 0}</span>
          </button>

          {/* Heart button */}
          <button
            onClick={() => !isReadOnly && onReaction(msg.id, '❤️')}
            disabled={isReadOnly}
            className={`flex items-center gap-1.5 text-xs transition-all ${
              msg.reactions?.['❤️']?.includes(account?.toLowerCase())
                ? 'text-red-400'
                : 'text-gray-500 hover:text-red-400'
            } disabled:opacity-30`}
          >
            <span className="text-base">❤️</span>
            <span>{msg.reactions?.['❤️']?.length || 0}</span>
          </button>

          {/* Reply button */}
          {chatMode === 'global' && (
            <button
              onClick={() => !isReadOnly && onReply(msg)}
              disabled={isReadOnly}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-400 transition-all disabled:opacity-30"
            >
              <span className="text-base">💬</span>
            </button>
          )}

          {/* Fire reaction */}
          <button
            onClick={() => !isReadOnly && onReaction(msg.id, '🔥')}
            disabled={isReadOnly}
            className={`flex items-center gap-1.5 text-xs transition-all ${
              msg.reactions?.['🔥']?.includes(account?.toLowerCase())
                ? 'text-orange-400'
                : 'text-gray-500 hover:text-orange-400'
            } disabled:opacity-30`}
          >
            <span className="text-base">🔥</span>
            <span>{msg.reactions?.['🔥']?.length || 0}</span>
          </button>
        </div>

        {/* Total reactions + diamond indicator */}
        {totalReactions >= 5 && (
          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
            💎 {totalReactions}
          </span>
        )}
      </div>

      {/* Extra reactions display (rocket, diamond, laugh) */}
      {msg.reactions && (
        <div className="flex flex-wrap gap-1 mt-2">
          {Object.entries(msg.reactions)
            .filter(([emoji]) => !['👍', '❤️', '🔥'].includes(emoji))
            .map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => !isReadOnly && onReaction(msg.id, emoji)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                  users.includes(account?.toLowerCase())
                    ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                }`}
                disabled={isReadOnly}
              >
                {emoji} {users.length}
              </button>
            ))
          }
        </div>
      )}

      {/* Reaction picker (floating) */}
      {showReactions === msg.id && (
        <div className="flex gap-1 mt-2 p-2 bg-[#1a2435] rounded-xl border border-white/10 panel-slide">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReaction(msg.id, emoji)}
              className="text-xl hover:scale-125 transition-transform p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(ChatMessage);