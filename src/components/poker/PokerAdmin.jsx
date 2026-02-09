import React, { useState } from 'react';
import {
  getPokerConfig,
  setPokerPublic,
  setPokerMode,
  setPokerServerUrl,
  setPokerContracts,
} from '../../config/pokerAccess';

const PokerAdmin = ({ onClose }) => {
  const [config, setConfig] = useState(getPokerConfig);
  const [serverInput, setServerInput] = useState(config.serverUrl);
  const [chipsInput, setChipsInput] = useState(config.contracts.chipsAddress);
  const [factoryInput, setFactoryInput] = useState(config.contracts.factoryAddress);
  const [saved, setSaved] = useState(false);

  const handleTogglePublic = () => {
    const next = !config.publicAccess;
    setPokerPublic(next);
    setConfig(prev => ({ ...prev, publicAccess: next }));
  };

  const handleToggleMode = () => {
    const next = config.mode === 'onchain' ? 'offchain' : 'onchain';
    setPokerMode(next);
    setConfig(prev => ({ ...prev, mode: next }));
  };

  const handleSave = () => {
    setPokerServerUrl(serverInput.trim());
    setPokerContracts({
      chipsAddress: chipsInput.trim(),
      factoryAddress: factoryInput.trim(),
    });
    setConfig(getPokerConfig());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isOnChain = config.mode === 'onchain';

  return (
    <div className="poker-admin-overlay" onClick={onClose}>
      <div className="poker-admin-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="admin-header">
          <div className="admin-header-title">
            <span className="admin-icon">&#9881;</span>
            <h2>Admin Panel — Poker</h2>
          </div>
          <button className="admin-close" onClick={onClose}>&#10005;</button>
        </div>

        {/* Modo do jogo */}
        <div className="admin-section">
          <h3>Game Mode</h3>
          <div className="admin-mode-toggle">
            <button
              className={`mode-btn ${!isOnChain ? 'active' : ''}`}
              onClick={() => { if (isOnChain) handleToggleMode(); }}
            >
              <span className="mode-icon">&#9889;</span>
              <div>
                <strong>Off-chain</strong>
                <p>Fast server-side game, no gas, no transactions. Ideal for testing and casual games.</p>
              </div>
            </button>
            <button
              className={`mode-btn ${isOnChain ? 'active' : ''}`}
              onClick={() => { if (!isOnChain) handleToggleMode(); }}
            >
              <span className="mode-icon">&#9939;</span>
              <div>
                <strong>On-chain</strong>
                <p>Tokenized chips on BSC. Deposit, withdraw and settlement verifiable on the blockchain.</p>
              </div>
            </button>
          </div>
          <div className="admin-mode-status">
            Modo atual: <strong>{isOnChain ? 'ON-CHAIN (BSC Mainnet)' : 'OFF-CHAIN (Servidor)'}</strong>
          </div>
        </div>

        {/* Acesso */}
        <div className="admin-section">
          <h3>Access Control</h3>
          <div className="admin-row">
            <div>
              <strong>Public access</strong>
              <p className="admin-hint">When active, all connected users see poker.</p>
            </div>
            <button
              className={`admin-toggle ${config.publicAccess ? 'on' : 'off'}`}
              onClick={handleTogglePublic}
            >
              <span className="toggle-knob" />
              <span className="toggle-label">{config.publicAccess ? 'ATIVO' : 'RESTRITO'}</span>
            </button>
          </div>
        </div>

        {/* Servidor */}
        <div className="admin-section">
          <h3>Poker Server</h3>
          <label className="admin-label">URL do Servidor (Socket.io)</label>
          <input
            type="text"
            className="poker-input"
            value={serverInput}
            onChange={e => setServerInput(e.target.value)}
            placeholder="https://unionzod.com/poker-socket"
          />
        </div>

        {/* Contratos — so mostra se on-chain */}
        {isOnChain && (
          <div className="admin-section">
            <h3>On-Chain Contracts (BSC Mainnet)</h3>
            <label className="admin-label">Casino Chips (ERC20)</label>
            <input
              type="text"
              className="poker-input mono"
              value={chipsInput}
              onChange={e => setChipsInput(e.target.value)}
              placeholder="0x..."
            />
            <label className="admin-label" style={{ marginTop: '0.5rem' }}>Table Factory</label>
            <input
              type="text"
              className="poker-input mono"
              value={factoryInput}
              onChange={e => setFactoryInput(e.target.value)}
              placeholder="0x..."
            />
          </div>
        )}

        {/* Salvar */}
        <div className="admin-footer">
          <button className="poker-btn poker-btn-primary" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
          <button className="poker-btn poker-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PokerAdmin;
