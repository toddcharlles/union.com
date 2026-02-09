import React, { useState, useEffect } from 'react';

const PokerControls = ({ actionRequest, onAction }) => {
  const { toCall = 0, minRaise = 100, maxRaise = 0 } = actionRequest || {};

  const allowShortAllIn = maxRaise > 0 && maxRaise < minRaise;
  const sliderMin = allowShortAllIn ? 1 : Math.max(1, minRaise);
  const sliderMax = Math.max(0, maxRaise);
  const canRaise = sliderMax > 0;
  const isCall = toCall > 0;

  const [raiseAmount, setRaiseAmount] = useState(Math.min(sliderMax, Math.max(sliderMin, sliderMin)));

  useEffect(() => {
    setRaiseAmount(Math.min(sliderMax, Math.max(sliderMin, sliderMin)));
  }, [sliderMin, sliderMax]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const handleAction = (action) => {
    if (action === 'raise') {
      onAction(action, raiseAmount);
    } else {
      onAction(action);
    }
  };

  return (
    <div className="poker-controls">
      <div className="controls-buttons">
        <button className="ctrl-btn ctrl-fold" onClick={() => handleAction('fold')}>
          Fold
        </button>
        <button className="ctrl-btn ctrl-check" onClick={() => handleAction(isCall ? 'call' : 'check')}>
          {isCall ? `Call $${fmt(toCall)}` : 'Check'}
        </button>
        {canRaise && (
          <button className="ctrl-btn ctrl-raise" onClick={() => handleAction('raise')}>
            Raise $${fmt(raiseAmount)}
          </button>
        )}
        {(isCall || canRaise) && (
          <button className="ctrl-btn ctrl-allin" onClick={() => handleAction('all-in')}>
            ALL-IN
          </button>
        )}
      </div>

      {canRaise && (
        <div className="controls-slider">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={allowShortAllIn ? 1 : minRaise}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            className="raise-slider"
          />
          <div className="slider-labels">
            <span>Min: ${fmt(sliderMin)}</span>
            <input
              type="number"
              value={raiseAmount}
              onChange={(e) => {
                const v = Math.max(sliderMin, Math.min(sliderMax, Number(e.target.value) || 0));
                setRaiseAmount(v);
              }}
              className="raise-input"
              min={sliderMin}
              max={sliderMax}
            />
            <span>Max: ${fmt(sliderMax)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PokerControls;
