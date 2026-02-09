import React from 'react';

const ChatHeader = ({
  chatMode,
  privateTarget,
  isConnected,
  userCount,
  isAuthenticated,
  unreadPrivate,
  onClose,
  onLoadConversations,
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5"
      style={{ background: 'linear-gradient(135deg, #0d1117 0%, #141c28 100%)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <span className="text-white text-sm font-bold">Z</span>
        </div>
        <div>
          <h1 className="text-white font-bold text-sm leading-tight">ZOD Social</h1>
          <p className="text-gray-500 text-[10px]">Sua carteira é sua identidade</p>
        </div>
      </div>

      {/* Search (desktop) */}
      <div className="hidden md:flex flex-1 max-w-xs mx-6">
        <div className="w-full relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>

      {/* Right icons */}
      <div className="flex items-center gap-2">
        {isConnected && (
          <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_4px_rgba(52,211,153,0.6)]"></span>
            <span className="text-emerald-400 text-[10px] font-medium">{userCount}</span>
          </div>
        )}

        {/* Notifications */}
        <button className="relative w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-all">
          🔔
          {unreadPrivate > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: '10px' }}>
              {unreadPrivate > 9 ? '9+' : unreadPrivate}
            </span>
          )}
        </button>

        {/* Settings / Close */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-all"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;