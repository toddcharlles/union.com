import React, { useState, useEffect } from 'react';

const PokerLobby = ({ tables, onJoinTable, onRefresh, connected, onConnect, mode }) => {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('poker_name') || '');
  const [buyin, setBuyin] = useState(10000);
  const [selectedTable, setSelectedTable] = useState(null);

  useEffect(() => {
    if (playerName) localStorage.setItem('poker_name', playerName);
  }, [playerName]);

  const handleJoin = (tableId) => {
    if (!playerName || playerName.length < 3) return;
    if (buyin < 5000 || buyin > 100000) return;
    onJoinTable(tableId || 'default', playerName, buyin);
  };

  return (
    <div className="poker-lobby">
      {/* Header */}
      <div className="poker-lobby-header">
        <div className="poker-lobby-title">
          <span className="poker-icon">♠</span>
          <div>
            <h2>ZOD Poker</h2>
            <p>Poker multiplayer {mode === 'onchain' ? 'on-chain na BNB Smart Chain' : 'off-chain — modo servidor'}</p>
          </div>
        </div>
        <div className="poker-lobby-status">
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
          <span>{connected ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* Player Setup */}
      <div className="poker-lobby-setup">
        <div className="setup-field">
          <label>Seu Nome</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Min. 3 caracteres"
            maxLength={20}
            className="poker-input"
          />
        </div>
        <div className="setup-field">
          <label>Buy-in ($)</label>
          <input
            type="number"
            value={buyin}
            onChange={(e) => setBuyin(Number(e.target.value))}
            min={5000}
            max={100000}
            step={1000}
            className="poker-input"
          />
        </div>
        <div className="setup-field buyin-presets">
          {[5000, 10000, 25000, 50000, 100000].map(val => (
            <button
              key={val}
              className={`preset-btn ${buyin === val ? 'active' : ''}`}
              onClick={() => setBuyin(val)}
            >
              ${(val / 1000)}k
            </button>
          ))}
        </div>
      </div>

      {!connected ? (
        <div className="poker-lobby-connect">
          <p>Conecte ao servidor de poker para ver as mesas disponiveis.</p>
          <button className="poker-btn poker-btn-primary" onClick={onConnect}>
            Conectar ao Servidor
          </button>
        </div>
      ) : (
        <>
          {/* Quick Join */}
          <div className="poker-lobby-quick">
            <button
              className="poker-btn poker-btn-accent poker-btn-lg"
              onClick={() => handleJoin('default')}
              disabled={!playerName || playerName.length < 3}
            >
              <span className="btn-icon">&#9824;</span>
              Jogo Rapido
            </button>
            <button
              className="poker-btn poker-btn-ghost"
              onClick={onRefresh}
            >
              Atualizar Mesas
            </button>
          </div>

          {/* Tables List */}
          <div className="poker-tables-list">
            <h3>Mesas Disponiveis</h3>
            {tables.length === 0 ? (
              <div className="poker-empty-state">
                <span className="empty-icon">♣</span>
                <p>Nenhuma mesa encontrada. Use "Jogo Rapido" para criar uma!</p>
              </div>
            ) : (
              <div className="poker-tables-grid">
                {tables.map((table) => (
                  <div
                    key={table.id}
                    className={`poker-table-card ${selectedTable === table.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTable(table.id)}
                  >
                    <div className="table-card-header">
                      <span className="table-name">{table.name || table.id}</span>
                      <span className={`table-status ${table.phase === 'waiting' ? 'waiting' : 'playing'}`}>
                        {table.phase === 'waiting' ? 'Aguardando' : 'Em Jogo'}
                      </span>
                    </div>
                    <div className="table-card-info">
                      <div className="table-stat">
                        <span className="stat-icon">👥</span>
                        <span>{table.playerCount || 0}/{table.maxPlayers || 6}</span>
                      </div>
                      <div className="table-stat">
                        <span className="stat-icon">💰</span>
                        <span>Pot: ${(table.pot || 0).toLocaleString()}</span>
                      </div>
                      <div className="table-stat">
                        <span className="stat-icon">🎯</span>
                        <span>Blinds: {table.blinds || '50/100'}</span>
                      </div>
                    </div>
                    <button
                      className="poker-btn poker-btn-primary poker-btn-sm"
                      onClick={(e) => { e.stopPropagation(); handleJoin(table.id); }}
                      disabled={!playerName || playerName.length < 3}
                    >
                      Entrar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PokerLobby;
