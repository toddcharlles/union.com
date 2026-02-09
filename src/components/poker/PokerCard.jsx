import React from 'react';

const SUIT_MAP = {
  '♥': { symbol: '♥', cls: 'hearts', color: 'red' },
  '♦': { symbol: '♦', cls: 'diamonds', color: 'red' },
  '♣': { symbol: '♣', cls: 'clubs', color: 'black' },
  '♠': { symbol: '♠', cls: 'spades', color: 'black' },
};

const PokerCard = ({ card, faceDown = false, small = false, community = false }) => {
  if (!card || faceDown) {
    return (
      <div className={`pcard pcard-back ${small ? 'pcard-sm' : ''} ${community ? 'pcard-community' : ''}`}>
        <div className="pcard-back-pattern">
          <div className="pcard-back-inner" />
        </div>
      </div>
    );
  }

  const suit = SUIT_MAP[card.s] || SUIT_MAP['♠'];

  return (
    <div className={`pcard ${suit.cls} ${suit.color} ${small ? 'pcard-sm' : ''} ${community ? 'pcard-community' : ''}`}>
      <div className="pcard-corner pcard-corner-tl">
        <span className="pcard-rank">{card.r}</span>
        <span className="pcard-suit-mini">{suit.symbol}</span>
      </div>
      <div className="pcard-center-suit">{suit.symbol}</div>
      <div className="pcard-corner pcard-corner-br">
        <span className="pcard-rank">{card.r}</span>
        <span className="pcard-suit-mini">{suit.symbol}</span>
      </div>
    </div>
  );
};

export default PokerCard;
