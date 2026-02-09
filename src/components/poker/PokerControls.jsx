import React, { useState, useEffect, useCallback } from 'react';

const PokerControls = ({ actionRequest, onAction }) => {
  const { toCall = 0, minRaise = 100, maxRaise = 0, pot = 0 } = actionRequest || {};

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

  const handleAction = useCallback((action) => {
    if (action === 'raise') {
      onAction(action, raiseAmount);
    } else {
      onAction(action);
    }
  }, [onAction, raiseAmount]);

  // Quick raise presets
  const presets = [];
  if (canRaise && pot > 0) {
    const half = Math.round(pot * 0.5);
    const threeFourth = Math.round(pot * 0.75);
    const full = pot;
    if (half >= sliderMin && half <= sliderMax) presets.push({ label: '½ Pot', value: half });
    if (threeFourth >= sliderMin && threeFourth <= sliderMax) presets.push({ label: '¾ Pot', value: threeFourth });
    if (full >= sliderMin && full <= sliderMax) presets.push({ label: 'Pot', value: full });
  }

  return (
    <div className="poker-controls">
      {/* Main action buttons */}
      <div className="controls-actions">
        <button
          className="ctrl-btn ctrl-fold"
          onClick={() => handleAction('fold')}
        >
          <span className="ctrl-icon">✕</span>
          <span className="ctrl-label">Fold</span>
        </button>

        <button
          className="ctrl-btn ctrl-check"
          onClick={() => handleAction(isCall ? 'call' : 'check')}
        >
          <span className="ctrl-icon">{isCall ? '📞' : '✓'}</span>
          <span className="ctrl-label">{isCall ? `Call` : 'Check'}</span>
          {isCall && <span className="ctrl-amount">${fmt(toCall)}</span>}
        </button>

        {canRaise && (
          <button
            className="ctrl-btn ctrl-raise"
            onClick={() => handleAction('raise')}
          >
            <span className="ctrl-icon">↑</span>
            <span className="ctrl-label">Raise</span>
            <span className="ctrl-amount">${fmt(raiseAmount)}</span>
          </button>
        )}

        {(isCall || canRaise) && (
          <button
            className="ctrl-btn ctrl-allin"
            onClick={() => handleAction('all-in')}
          >
            <span className="ctrl-icon">🔥</span>
            <span className="ctrl-label">ALL-IN</span>
          </button>
        )}
      </div>

      {/* Raise slider */}
      {canRaise && (
        <div className="controls-raise-section">
          {/* Quick presets */}
          {presets.length > 0 && (
            <div className="raise-presets">
              {presets.map((p, i) => (
                <button
                  key={i}
                  className={`raise-preset-btn ${raiseAmount === p.value ? 'active' : ''}`}
                  onClick={() => setRaiseAmount(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="raise-slider-row">
            <span className="raise-bound">${fmt(sliderMin)}</span>
            <div className="raise-slider-wrap">
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={allowShortAllIn ? 1 : Math.max(1, Math.floor(minRaise / 2))}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="raise-slider"
              />
            </div>
            <span className="raise-bound">${fmt(sliderMax)}</span>
          </div>

          <div className="raise-input-row">
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
          </div>
        </div>
      )}
    </div>
  );
};

export default PokerControls;
