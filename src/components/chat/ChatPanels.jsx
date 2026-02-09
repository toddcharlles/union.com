import React, { useState } from 'react';
import { formatAddress, formatTimeRemaining } from './chatHelpers.js';

// ==================== LEADERBOARD ====================
export const LeaderboardPanel = ({ leaderboard, onClose }) => {
  if (!leaderboard) return null;
  return (
    <div className="border-b border-amber-500/20 max-h-60 overflow-y-auto panel-slide chat-scrollbar"
      style={{ background: 'linear-gradient(180deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 sticky top-0 backdrop-blur-sm">
        <span className="text-sm font-bold text-amber-400">🏆 Social Ranking</span>
        <button onClick={onClose} className="text-amber-500/60 hover:text-amber-400 transition-colors">✕</button>
      </div>

      {leaderboard.messageOfDay && (
        <div className="px-4 py-2 border-b border-amber-500/10">
          <p className="text-xs font-bold text-amber-400">🔥 Message of the Day</p>
          <p className="text-xs text-gray-400 mt-1">
            <span className="font-mono text-amber-300">@{leaderboard.messageOfDay.address?.slice(-4)}</span>
            : "{leaderboard.messageOfDay.message?.substring(0, 60)}"
            <span className="ml-1 text-amber-500">({leaderboard.messageOfDay.totalReactions} reactions)</span>
          </p>
        </div>
      )}

      {leaderboard.topUsersReacted?.length > 0 && (
        <div className="px-4 py-2 border-b border-amber-500/10">
          <p className="text-xs font-bold text-amber-400 mb-1">💎 Most Reacted (Week)</p>
          {leaderboard.topUsersReacted.slice(0, 5).map((u, i) => (
            <div key={u.address} className="flex items-center justify-between text-xs py-0.5">
              <span>
                <span className="text-amber-500 font-bold">{i + 1}.</span>{' '}
                <span className="font-mono text-gray-300">{formatAddress(u.address)}</span>
              </span>
              <span className="text-amber-400/70">{u.reactions} reactions</span>
            </div>
          ))}
        </div>
      )}

      {leaderboard.topActive?.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-xs font-bold text-amber-400 mb-1">🗣️ Most Active (Week)</p>
          {leaderboard.topActive.slice(0, 5).map((u, i) => (
            <div key={u.address} className="flex items-center justify-between text-xs py-0.5">
              <span>
                <span className="text-amber-500 font-bold">{i + 1}.</span>{' '}
                <span className="font-mono text-gray-300">{formatAddress(u.address)}</span>
              </span>
              <span className="text-amber-400/70">{u.messageCount} msgs</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== COMMUNITY HIGHLIGHTS ====================
export const HighlightsPanel = ({ communityHighlights, onClose, onScrollToMessage, getTotalReactions }) => (
  <div className="border-b border-purple-500/20 max-h-60 overflow-y-auto panel-slide chat-scrollbar"
    style={{ background: 'linear-gradient(180deg, rgba(168,85,247,0.08) 0%, rgba(168,85,247,0.02) 100%)' }}
  >
    <div className="flex items-center justify-between px-4 py-2 bg-purple-500/10 sticky top-0 backdrop-blur-sm">
      <span className="text-sm font-bold text-purple-400">⭐ Community Highlights</span>
      <button onClick={onClose} className="text-purple-500/60 hover:text-purple-400 transition-colors">✕</button>
    </div>
    {communityHighlights.length === 0 ? (
      <p className="text-center text-purple-400/60 text-xs py-4">
        Messages with 20+ reactions or 10+ 💎 appear here
      </p>
    ) : (
      communityHighlights.slice().reverse().map((msg) => (
        <div key={msg.id}
          className="px-4 py-2 border-b border-purple-500/10 hover:bg-purple-500/10 cursor-pointer transition-colors"
          onClick={() => { onScrollToMessage(msg.id); onClose(); }}
        >
          <div className="flex items-center gap-1 text-xs">
            <span>{msg.status?.emoji || '⚪'}</span>
            <span className="font-mono text-purple-300">@{msg.address?.slice(-4)}</span>
            <span className="text-purple-500/40">•</span>
            <span className="text-purple-400/70">{getTotalReactions(msg.reactions)} reactions</span>
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">{msg.message}</p>
        </div>
      ))
    )}
  </div>
);

// ==================== SOCIAL MEMORY ====================
export const SocialMemoryPanel = ({ socialMemory, onClose }) => {
  if (!socialMemory) return null;
  return (
    <div className="border-b border-blue-500/20 max-h-60 overflow-y-auto panel-slide chat-scrollbar"
      style={{ background: 'linear-gradient(180deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 100%)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-blue-500/10 sticky top-0 backdrop-blur-sm">
        <span className="text-sm font-bold text-blue-400">📊 Social Memory</span>
        <button onClick={onClose} className="text-blue-500/60 hover:text-blue-400 transition-colors">✕</button>
      </div>

      {socialMemory.mostReactedWeek && (
        <div className="px-4 py-2 border-b border-blue-500/10">
          <p className="text-xs font-bold text-blue-400">🏅 Message of the Week</p>
          <p className="text-xs text-gray-400 mt-1">
            <span className="font-mono text-blue-300">@{socialMemory.mostReactedWeek.address?.slice(-4)}</span>
            : "{socialMemory.mostReactedWeek.message?.substring(0, 60)}"
            <span className="ml-1 text-blue-400/70">({socialMemory.mostReactedWeek.totalReactions} reactions)</span>
          </p>
        </div>
      )}

      {socialMemory.trending?.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-xs font-bold text-blue-400 mb-1">📈 Trending Users</p>
          {socialMemory.trending.map((u, i) => (
            <div key={u.address} className="flex items-center justify-between text-xs py-0.5">
              <span>
                <span className="text-blue-500 font-bold">{i + 1}.</span>{' '}
                <span className="font-mono text-gray-300">{formatAddress(u.address)}</span>
              </span>
              <span className="text-blue-400/70">
                {u.reactions} reactions • {u.messages} msgs
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== POLLS ====================
export const PollsPanel = ({ polls, userData, isReadOnly, onClose, onVote, onCreate, onClosePoll, onDeletePoll }) => {
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollForm, setPollForm] = useState({ question: '', options: ['', ''], duration: 60, allowMultiple: false });

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

  const handleCreate = () => {
    const cleanOptions = pollForm.options.filter(o => o.trim().length > 0);
    if (!pollForm.question.trim() || cleanOptions.length < 2) return;
    onCreate({
      question: pollForm.question,
      options: cleanOptions,
      duration: pollForm.duration,
      allowMultiple: pollForm.allowMultiple
    });
    setPollForm({ question: '', options: ['', ''], duration: 60, allowMultiple: false });
    setShowCreatePoll(false);
  };

  return (
    <div className="border-b border-emerald-500/20 max-h-80 overflow-y-auto panel-slide chat-scrollbar"
      style={{ background: 'linear-gradient(180deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-emerald-500/10 sticky top-0 z-10 backdrop-blur-sm">
        <span className="text-sm font-bold text-emerald-400">🗳️ Polls</span>
        <div className="flex items-center gap-2">
          {userData?.isAdmin && (
            <button
              onClick={() => setShowCreatePoll(!showCreatePoll)}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg transition-colors"
            >
              + New
            </button>
          )}
          <button onClick={onClose} className="text-emerald-500/60 hover:text-emerald-400 transition-colors">✕</button>
        </div>
      </div>

      {/* Create form */}
      {showCreatePoll && userData?.isAdmin && (
        <div className="px-4 py-3 border-b border-emerald-500/10 bg-emerald-500/5">
          <input
            type="text"
            value={pollForm.question}
            onChange={(e) => setPollForm(prev => ({ ...prev, question: e.target.value }))}
            placeholder="Poll question..."
            maxLength={200}
            className="w-full bg-white/5 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm mb-2 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400"
          />
          {pollForm.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <span className="text-xs text-emerald-500 w-4">{i + 1}.</span>
              <input
                type="text"
                value={opt}
                onChange={(e) => updatePollOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={100}
                className="flex-1 bg-white/5 border border-emerald-500/20 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400"
              />
              {pollForm.options.length > 2 && (
                <button onClick={() => removePollOption(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {pollForm.options.length < 10 && (
                <button onClick={addPollOption} className="text-xs text-emerald-400 hover:text-emerald-300">+ Option</button>
              )}
              <select
                value={pollForm.duration}
                onChange={(e) => setPollForm(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                className="text-xs bg-white/5 border border-emerald-500/20 rounded px-1 py-0.5 text-gray-300"
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
              <label className="flex items-center gap-1 text-xs text-emerald-400">
                <input
                  type="checkbox"
                  checked={pollForm.allowMultiple}
                  onChange={(e) => setPollForm(prev => ({ ...prev, allowMultiple: e.target.checked }))}
                  className="w-3 h-3"
                />
                Múltipla
              </label>
            </div>
            <button
              onClick={handleCreate}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg font-semibold transition-colors"
            >
              Criar
            </button>
          </div>
        </div>
      )}

      {/* Polls list */}
      {polls.length === 0 ? (
        <p className="text-center text-emerald-400/60 text-xs py-4">Nenhuma enquete no momento</p>
      ) : (
        polls.slice().reverse().map((poll) => {
          const isExpired = !poll.isActive || Date.now() > poll.endsAt;
          return (
            <div key={poll.id} className={`px-4 py-3 border-b border-emerald-500/10 ${isExpired ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-200">{poll.question}</p>
                  <p className="text-xs text-emerald-400/70">
                    {isExpired ? '⏱️ Encerrada' : `⏳ ${formatTimeRemaining(poll.endsAt)}`}
                    {' • '}{poll.totalVotes} voto{poll.totalVotes !== 1 ? 's' : ''}
                    {poll.allowMultiple && ' • Múltipla escolha'}
                  </p>
                </div>
                {userData?.isAdmin && (
                  <div className="flex gap-1 ml-2">
                    {!isExpired && (
                      <button onClick={() => onClosePoll(poll.id)} className="text-xs text-amber-400 hover:text-amber-300" title="Encerrar">⏹️</button>
                    )}
                    <button onClick={() => onDeletePoll(poll.id)} className="text-xs text-red-400 hover:text-red-300" title="Deletar">🗑️</button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {poll.options.map((opt) => {
                  const percentage = poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;
                  const isMyVote = opt.myVote;
                  const isWinner = isExpired && opt.voteCount === Math.max(...poll.options.map(o => o.voteCount)) && opt.voteCount > 0;

                  return (
                    <button
                      key={opt.id}
                      onClick={() => !isExpired && !isReadOnly && onVote(poll.id, opt.id)}
                      disabled={isExpired || isReadOnly}
                      className={`w-full text-left relative overflow-hidden rounded-lg border transition-all ${
                        isMyVote
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-gray-700/50 bg-white/5 hover:border-emerald-500/30'
                      } ${isWinner ? 'ring-1 ring-emerald-400' : ''} ${
                        isExpired || isReadOnly ? 'cursor-default' : 'cursor-pointer'
                      }`}
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
                          {isWinner && <span>🏆</span>}
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
        })
      )}
    </div>
  );
};

// ==================== CONVERSATIONS ====================
export const ConversationsPanel = ({ conversations, onClose, onOpenChat }) => (
  <div className="border-b border-gray-700/50 max-h-48 overflow-y-auto panel-slide chat-scrollbar"
    style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.02) 100%)' }}
  >
    <div className="flex items-center justify-between px-4 py-2 bg-indigo-500/10 sticky top-0 backdrop-blur-sm">
      <span className="text-sm font-bold text-indigo-400">💬 Conversas Privadas</span>
      <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">✕</button>
    </div>
    {conversations.length === 0 ? (
      <p className="text-center text-gray-500 text-sm py-4">Nenhuma conversa ainda</p>
    ) : (
      conversations.map((conv) => (
        <button
          key={conv.address}
          onClick={() => onOpenChat(conv.address)}
          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 border-b border-gray-700/30 transition-colors"
        >
          <span>{conv.status?.emoji || '⚪'}</span>
          <div className="flex-1 text-left">
            <span className="text-sm font-mono text-gray-300">{formatAddress(conv.address)}</span>
            <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
          </div>
          {conv.unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">
              {conv.unreadCount}
            </span>
          )}
        </button>
      ))
    )}
  </div>
);