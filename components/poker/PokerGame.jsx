import React, { useState, useRef, useEffect } from 'react';
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

  const handleAction = (action, amount) => {
    onAction(action, amount);
  };

  return (
    <div className="poker-game">
      {/* Top Bar */}
      <div className="poker-game-topbar">
        <button className="poker-btn poker-btn-ghost poker-btn-sm" onClick={onLeave}>
          &#8592; Sair da Mesa
        </button>
        <div className="topbar-info">
          <span className="phase-badge">{PHASE_NAMES[phase] || phase}</span>
          <span className="pot-display">Pot: <strong>${Number(pot).toLocaleString()}</strong></span>
        </div>
        <button
          className="poker-btn poker-btn-ghost poker-btn-sm"
          onClick={() => setShowChat(prev => !prev)}
        >
          Chat {showChat ? '▼' : '▲'}
        </button>
      </div>

      {/* Notifications */}
      <div className="poker-notifications">
        {notifications.map(n => (
          <div key={n.id} className="poker-notif">{n.msg}</div>
        ))}
      </div>

      {/* Table Area */}
      <div className="poker-table-area">
        <div className="poker-felt">
          {/* Community Cards */}
          <div className="community-cards">
            {board.map((card, i) => (
              <PokerCard key={i} card={card} />
            ))}
            {board.length === 0 && phase === 'waiting' && (
              <div className="waiting-text">Aguardando jogadores...</div>
            )}
          </div>

          {/* Pot indicator on felt */}
          {pot > 0 && (
            <div className="felt-pot">
              <span>${Number(pot).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Seats around the table */}
        <div className="poker-seats-container">
          {players.map((player, i) => (
            <PokerSeat
              key={i}
              player={player}
              index={i}
              isActive={i === activeSeat}
              isDealer={i === dealerSeat}
              isMe={i === mySeat}
              holeCards={i === mySeat ? myHole : []}
              revealedCards={revealedMap[i]}
              isWinner={winnerMap[i] !== undefined}
              winnerHand={winnerMap[i]}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="poker-controls-area">
        {actionRequest ? (
          <PokerControls actionRequest={actionRequest} onAction={handleAction} />
        ) : (
          <div className="controls-waiting">
            {phase === 'waiting'
              ? 'Aguardando mais jogadores...'
              : winners.length > 0
                ? 'Mao encerrada!'
                : 'Aguardando sua vez...'}
          </div>
        )}

        {/* Finalize button when hand ended */}
        {winners.length > 0 && (
          <button
            className="poker-btn poker-btn-accent poker-btn-sm"
            onClick={() => onFinalize(tableId)}
            style={{ marginTop: 8 }}
          >
            Finalizar Mao (Settle)
          </button>
        )}
      </div>

      {/* Chat Panel */}
      {showChat && (
        <div className="poker-chat-panel">
          <div className="poker-chat-messages" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className="chat-msg">
                <strong>{m.name || 'Anon'}:</strong> {m.text || m.message}
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
              className="poker-input"
            />
            <button className="poker-btn poker-btn-primary poker-btn-sm" onClick={handleSendChat}>
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PokerGame;
