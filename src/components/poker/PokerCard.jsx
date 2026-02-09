import React from 'react';

const SUIT_SYMBOLS = { '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' };

const PokerCard = ({ card, faceDown = false, small = false }) => {
  if (!card || faceDown) {
    return (
      <div className={`pcard pcard-back ${small ? 'pcard-sm' : ''}`}>
        <span>?</span>
      </div>
    );
  }

  const isRed = card.s === '♥' || card.s === '♦';
  const suitClass = SUIT_SYMBOLS[card.s] || 'spades';

  return (
    <div className={`pcard ${suitClass} ${isRed ? 'red' : 'black'} ${small ? 'pcard-sm' : ''}`}>
      <div className="pcard-rank">{card.r}</div>
      <div className="pcard-suit">{card.s}</div>
    </div>
  );
};

export default PokerCard;
