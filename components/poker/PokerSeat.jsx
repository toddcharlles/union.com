import React from 'react';
import PokerCard from './PokerCard';

const PokerSeat = ({ player, index, isActive, isDealer, isMe, holeCards, revealedCards, isWinner, winnerHand }) => {
  if (!player) {
    return (
      <div className={`poker-seat poker-seat-${index} empty`}>
        <div className="seat-avatar">
          <span>?</span>
        </div>
        <div className="seat-info">
          <span className="seat-name">Vago</span>
        </div>
      </div>
    );
  }

  const statusParts = [];
  if (player.folded) statusParts.push('Fold');
  if (player.allIn) statusParts.push('All-in');
  if (player.lastAction && !player.folded && !player.allIn) statusParts.push(player.lastAction);

  const cardsToShow = isMe ? (holeCards || []) : (revealedCards || []);

  return (
    <div
      className={[
        'poker-seat',
        `poker-seat-${index}`,
        isActive ? 'active' : '',
        player.folded ? 'folded' : '',
        player.disconnected ? 'disconnected' : '',
        player.allIn ? 'all-in' : '',
        isMe ? 'is-me' : '',
        isWinner ? 'is-winner' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Dealer chip */}
      {isDealer && <div className="dealer-chip">D</div>}

      {/* Avatar */}
      <div className="seat-avatar">
        <span>{player.name?.charAt(0)?.toUpperCase() || '?'}</span>
      </div>

      {/* Info */}
      <div className="seat-info">
        <span className="seat-name">{player.name}{isMe ? ' (eu)' : ''}</span>
        <span className="seat-stack">${Number(player.stack).toLocaleString()}</span>
        {statusParts.length > 0 && (
          <span className="seat-status">{statusParts.join(' | ')}</span>
        )}
      </div>

      {/* Cards */}
      {cardsToShow.length > 0 && (
        <div className="seat-cards">
          {cardsToShow.map((c, i) => (
            <PokerCard key={i} card={c} small />
          ))}
        </div>
      )}

      {/* Face-down cards for opponents */}
      {!isMe && cardsToShow.length === 0 && !player.folded && (
        <div className="seat-cards">
          <PokerCard faceDown small />
          <PokerCard faceDown small />
        </div>
      )}

      {/* Winner overlay */}
      {isWinner && winnerHand && (
        <div className="winner-badge">
          <span className="winner-trophy">&#127942;</span>
          <span>{winnerHand}</span>
        </div>
      )}
    </div>
  );
};

export default PokerSeat;
