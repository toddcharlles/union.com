import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import PokerSeat from './PokerSeat';
import PokerCard from './PokerCard';
import PokerControls from './PokerControls';

const PHASE_NAMES = {
  waiting: 'Aguardando',
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

const PHASE_COLORS = {
  waiting: '#6b7280',
  preflop: '#3b82f6',
  flop: '#10b981',
  turn: '#f59e0b',
  river: '#ef4444',
  showdown: '#a855f7',
};

/**
 * Calculate seat positions around an ellipse.
 * Seat 0 (the player) is always at the bottom center.
 * On mobile (portrait), the ellipse is vertical (taller than wide).
 * On desktop, the ellipse is horizontal (wider than tall).
 * Seats are pulled closer to the table for better use of space.
 */
function calcSeatPositions(totalSeats, isMobile) {
  const positions = [];
  // On mobile: vertical ellipse (rx < ry) / On desktop: horizontal (rx > ry)
  const rx = isMobile ? 38 : 46;
  const ry = isMobile ? 44 : 42;

  for (let i = 0; i < totalSeats; i++) {
    // Start from bottom (6 o'clock = 90deg) and go clockwise
    const angle = (Math.PI / 2) + (2 * Math.PI * i) / totalSeats;
    const x = 50 - rx * Math.cos(angle);
    const y = 50 + ry * Math.sin(angle);
    positions.push({ left: `${x}%`, top: `${y}%` });
  }
  return positions;
}

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

const PokerGame = ({
  gameState,
  myHole,
  mySeat,
  actionRequest,
  winners,
  allHands,
  messages,
  lastEvent,
  onAction,
  onLeave,
  onChat,
  onFinalize,
  tableId,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const chatRef = useRef(null);
  const notifId = useRef(0);

  const players = gameState?.players || [];
  const phase = gameState?.phase || 'waiting';
  const pot = gameState?.pot || 0;
  const board = gameState?.board || [];
  const activeSeat = gameState?.activeSeat ?? -1;
  const dealerSeat = gameState?.dealerSeat ?? -1;
  const totalSeats = players.length || 6;
  const isMobile = useIsMobile(640);

  // Calculate seat positions dynamically based on screen orientation
  const seatPositions = useMemo(() => calcSeatPositions(totalSeats, isMobile), [totalSeats, isMobile]);

  // Build revealed cards map from allHands
  const revealedMap = {};
  (allHands || []).forEach(h => {
    if (h.cards && h.cards.length > 0) {
      const idx = h.seat ?? players.findIndex(p => p && p.id === h.id);
      if (idx >= 0) revealedMap[idx] = h.cards;
    }
  });

  // Winner seats
  const winnerMap = {};
  (winners || []).forEach(w => {
    const idx = w.seat ?? players.findIndex(p => p && p.id === w.id);
    if (idx >= 0) winnerMap[idx] = w.handName || w.hand || '';
  });

  // Notifications from events
  useEffect(() => {
    if (!lastEvent) return;
    let msg = '';
    switch (lastEvent.type) {
      case 'playerJoined':
        msg = `${lastEvent.data.name} entrou (assento ${(lastEvent.data.seat ?? 0) + 1})`;
        break;
      case 'playerLeft':
        msg = `${lastEvent.data.name} saiu`;
        break;
      case 'playerDisconnected':
        msg = `${lastEvent.data.name} desconectou`;
        break;
      case 'system':
        msg = lastEvent.data.message;
        break;
      case 'handEnded':
        if (lastEvent.data.reason) msg = lastEvent.data.reason;
        break;
      default:
        break;
    }
    if (msg) {
      const id = ++notifId.current;
      setNotifications(prev => [...prev.slice(-4), { id, msg }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 4000);
    }
  }, [lastEvent]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    onChat(chatInput.trim());
    setChatInput('');
  };

  const phaseColor = PHASE_COLORS[phase] || '#6b7280';

  return (
    <div className="poker-game">
      {/* === Top Bar === */}
      <div className="poker-game-topbar">
        <button className="topbar-btn topbar-btn-leave" onClick={onLeave}>
          <span>&#8592;</span> Sair
        </button>

        <div className="topbar-center">
          <div className="phase-badge" style={{ borderColor: phaseColor, color: phaseColor }}>
            <span className="phase-dot" style={{ background: phaseColor }} />
            {PHASE_NAMES[phase] || phase}
          </div>
          {pot > 0 && (
            <div className="pot-display">
              <span className="pot-label">POT</span>
              <span className="pot-value">${Number(pot).toLocaleString()}</span>
            </div>
          )}
        </div>

        <button
          className="topbar-btn topbar-btn-chat"
          onClick={() => setShowChat(prev => !prev)}
        >
          Chat {messages.length > 0 && <span className="chat-badge">{messages.length}</span>}
        </button>
      </div>

      {/* === Notifications === */}
      <div className="poker-notifications">
        {notifications.map(n => (
          <div key={n.id} className="poker-notif">{n.msg}</div>
        ))}
      </div>

      {/* === Table Area === */}
      <div className="poker-table-wrapper">
        <div className="poker-table-area">
          {/* Outer rail (wood) */}
          <div className="poker-rail">
            {/* Inner felt */}
            <div className="poker-felt">
              {/* Felt decorative line */}
              <div className="felt-border-line" />

              {/* Center logo / branding */}
              <div className="felt-logo">ZOD</div>

              {/* Community Cards */}
              <div className="community-section">
                <div className="community-cards">
                  {board.map((card, i) => (
                    <div key={i} className="community-card-slot" style={{ animationDelay: `${i * 0.1}s` }}>
                      <PokerCard card={card} community />
                    </div>
                  ))}
                  {board.length === 0 && phase === 'waiting' && (
                    <div className="waiting-text">Aguardando jogadores...</div>
                  )}
                </div>

                {/* Pot on felt */}
                {pot > 0 && (
                  <div className="felt-pot">
                    <div className="felt-pot-chips">
                      <div className="mini-chip mc-1" />
                      <div className="mini-chip mc-2" />
                      <div className="mini-chip mc-3" />
                    </div>
                    <span className="felt-pot-value">${Number(pot).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* === Seats around the table (dynamically positioned) === */}
          <div className="poker-seats-container">
            {players.map((player, i) => (
              <PokerSeat
                key={i}
                player={player}
                index={i}
                totalSeats={totalSeats}
                isActive={i === activeSeat}
                isDealer={i === dealerSeat}
                isMe={i === mySeat}
                holeCards={i === mySeat ? myHole : []}
                revealedCards={revealedMap[i]}
                isWinner={winnerMap[i] !== undefined}
                winnerHand={winnerMap[i]}
                currentBet={player?.currentBet || 0}
                seatStyle={seatPositions[i]}
              />
            ))}
          </div>
        </div>
      </div>

      {/* === Controls === */}
      <div className="poker-controls-area">
        {actionRequest ? (
          <PokerControls actionRequest={actionRequest} onAction={onAction} />
        ) : (
          <div className="controls-waiting">
            {phase === 'waiting'
              ? 'Aguardando mais jogadores...'
              : winners.length > 0
                ? 'Mao encerrada!'
                : 'Aguardando sua vez...'}
          </div>
        )}

        {winners.length > 0 && (
          <button
            className="finalize-btn"
            onClick={() => onFinalize(tableId)}
          >
            Finalizar Mao (Settle)
          </button>
        )}
      </div>

      {/* === Chat Panel === */}
      {showChat && (
        <div className="poker-chat-panel">
          <div className="poker-chat-header">
            <span>Chat da Mesa</span>
            <button className="chat-close-btn" onClick={() => setShowChat(false)}>X</button>
          </div>
          <div className="poker-chat-messages" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className="chat-msg">
                <span className="chat-sender">{m.name || 'Anon'}</span>
                <span className="chat-text">{m.text || m.message}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="chat-empty">Nenhuma mensagem ainda...</div>
            )}
          </div>
          <div className="poker-chat-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder="Mensagem..."
              className="chat-input-field"
            />
            <button className="chat-send-btn" onClick={handleSendChat}>
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PokerGame;
