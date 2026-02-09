import React from 'react';
import PokerCard from './PokerCard';

const AVATAR_COLORS = [
  ['#6366f1', '#4f46e5'], // indigo
  ['#ec4899', '#db2777'], // pink
  ['#f59e0b', '#d97706'], // amber
  ['#10b981', '#059669'], // emerald
  ['#8b5cf6', '#7c3aed'], // violet
  ['#ef4444', '#dc2626'], // red
  ['#06b6d4', '#0891b2'], // cyan
  ['#f97316', '#ea580c'], // orange
  ['#14b8a6', '#0d9488'], // teal
  ['#84cc16', '#65a30d'], // lime
];

const PokerSeat = ({ player, index, totalSeats, isActive, isDealer, isMe, holeCards, revealedCards, isWinner, winnerHand, currentBet, seatStyle }) => {
  const colors = AVATAR_COLORS[index % AVATAR_COLORS.length];

  // Dynamic positioning via inline style from parent
  const posStyle = seatStyle ? {
    position: 'absolute',
    left: seatStyle.left,
    top: seatStyle.top,
    transform: 'translate(-50%, -50%)',
  } : {};

  if (!player) {
    return (
      <div className="poker-seat poker-seat-empty" style={posStyle}>
        <div className="seat-box">
          <div className="seat-avatar seat-avatar-empty">
            <span className="seat-empty-icon">+</span>
          </div>
          <div className="seat-info-bar seat-info-empty">
            <span className="seat-label">Assento {index + 1}</span>
          </div>
        </div>
      </div>
    );
  }

  const statusParts = [];
  if (player.folded) statusParts.push('FOLD');
  if (player.allIn) statusParts.push('ALL-IN');
  if (player.lastAction && !player.folded && !player.allIn) statusParts.push(player.lastAction.toUpperCase());

  const cardsToShow = isMe ? (holeCards || []) : (revealedCards || []);
  const hasCards = !player.folded && (cardsToShow.length > 0 || !isMe);
  const bet = currentBet || player.currentBet || 0;

  return (
    <div
      className={[
        'poker-seat',
        isActive ? 'seat-active' : '',
        player.folded ? 'seat-folded' : '',
        player.disconnected ? 'seat-disconnected' : '',
        player.allIn ? 'seat-allin' : '',
        isMe ? 'seat-me' : '',
        isWinner ? 'seat-winner' : '',
      ].filter(Boolean).join(' ')}
      style={posStyle}
    >
      {/* Bet chips */}
      {bet > 0 && (
        <div className="seat-bet">
          <div className="bet-chips">
            <div className="chip-stack-visual">
              <div className="chip-icon" />
              <div className="chip-icon chip-offset-1" />
            </div>
            <span className="bet-value">${Number(bet).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="seat-box">
        {/* Timer ring for active player */}
        {isActive && (
          <div className={`seat-timer-ring ${isMe ? 'timer-ring-me' : ''}`} key={`timer-${index}-${isActive}`}>
            <svg viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="29" className="timer-track" />
              <circle cx="32" cy="32" r="29" className="timer-fill" />
            </svg>
          </div>
        )}

        {/* Dealer button */}
        {isDealer && (
          <div className="dealer-btn">
            <span>D</span>
          </div>
        )}

        {/* Avatar */}
        <div
          className="seat-avatar"
          style={{
            background: `linear-gradient(145deg, ${colors[0]}, ${colors[1]})`,
          }}
        >
          <span className="seat-avatar-letter">
            {player.name?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>

        {/* Info bar */}
        <div className={`seat-info-bar ${isMe ? 'seat-info-me' : ''}`}>
          <span className="seat-name" title={player.name}>
            {player.name}{isMe ? ' (eu)' : ''}
          </span>
          <span className="seat-stack">
            <span className="stack-icon">$</span>
            {Number(player.stack).toLocaleString()}
          </span>
        </div>

        {/* Status tag */}
        {statusParts.length > 0 && (
          <div className={`seat-status-tag ${player.allIn ? 'status-allin' : player.folded ? 'status-fold' : 'status-action'}`}>
            {statusParts.join(' | ')}
          </div>
        )}
      </div>

      {/* Player cards */}
      {hasCards && (
        <div className={`seat-cards ${isMe ? 'seat-cards-me' : ''}`}>
          {cardsToShow.length > 0 ? (
            cardsToShow.map((c, i) => (
              <PokerCard key={i} card={c} small />
            ))
          ) : (
            <>
              <PokerCard faceDown small />
              <PokerCard faceDown small />
            </>
          )}
        </div>
      )}

      {/* Winner overlay */}
      {isWinner && winnerHand && (
        <div className="winner-badge">
          <span className="winner-hand-name">{winnerHand}</span>
        </div>
      )}
    </div>
  );
};

export default PokerSeat;
