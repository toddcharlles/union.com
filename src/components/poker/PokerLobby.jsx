import React, { useState, useEffect } from 'react';

const PokerLobby = ({ tables, onJoinTable, onRefresh, connected, onConnect, mode, isAdmin, onCreateTable, onDeleteTable }) => {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('poker_name') || '');
  const [buyin, setBuyin] = useState(10000);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create table form state
  const [newTableName, setNewTableName] = useState('');
  const [newTableSeats, setNewTableSeats] = useState(6);
  const [newTableSB, setNewTableSB] = useState(50);
  const [newTableBB, setNewTableBB] = useState(100);

  useEffect(() => {
    if (playerName) localStorage.setItem('poker_name', playerName);
  }, [playerName]);

  const handleJoin = (tableId) => {
    if (!playerName || playerName.length < 3) return;
    if (buyin < 5000 || buyin > 100000) return;
    onJoinTable(tableId || 'default', playerName, buyin);
  };

  const handleCreateTable = () => {
    if (!newTableName.trim()) return;
    onCreateTable({
      name: newTableName.trim(),
      seats: newTableSeats,
      smallBlind: newTableSB,
      bigBlind: newTableBB,
    });
    setNewTableName('');
    setNewTableSeats(6);
    setNewTableSB(50);
    setNewTableBB(100);
    setShowCreateForm(false);
  };

  return (
    <div className="poker-lobby">
      {/* Header */}
      <div className="poker-lobby-header">
        <div className="poker-lobby-title">
          <span className="poker-icon">&#9824;</span>
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
          {/* Admin: Create Table */}
          {isAdmin && (
            <div className="poker-admin-section">
              {!showCreateForm ? (
                <button
                  className="poker-btn poker-btn-accent"
                  onClick={() => setShowCreateForm(true)}
                >
                  + Criar Mesa
                </button>
              ) : (
                <div className="poker-create-form">
                  <h3>Criar Nova Mesa (Off-Chain)</h3>
                  <div className="create-form-grid">
                    <div className="setup-field">
                      <label>Nome da Mesa</label>
                      <input
                        type="text"
                        value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        placeholder="Ex: Mesa VIP"
                        maxLength={30}
                        className="poker-input"
                      />
                    </div>
                    <div className="setup-field">
                      <label>Assentos</label>
                      <select
                        value={newTableSeats}
                        onChange={(e) => setNewTableSeats(Number(e.target.value))}
                        className="poker-input"
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n}>{n} jogadores</option>
                        ))}
                      </select>
                    </div>
                    <div className="setup-field">
                      <label>Small Blind</label>
                      <select
                        value={newTableSB}
                        onChange={(e) => {
                          const sb = Number(e.target.value);
                          setNewTableSB(sb);
                          setNewTableBB(sb * 2);
                        }}
                        className="poker-input"
                      >
                        {[10, 25, 50, 100, 250, 500, 1000].map(v => (
                          <option key={v} value={v}>${v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="setup-field">
                      <label>Big Blind</label>
                      <input
                        type="number"
                        value={newTableBB}
                        className="poker-input"
                        disabled
                      />
                    </div>
                  </div>
                  <div className="create-form-actions">
                    <button
                      className="poker-btn poker-btn-accent"
                      onClick={handleCreateTable}
                      disabled={!newTableName.trim()}
                    >
                      Criar Mesa
                    </button>
                    <button
                      className="poker-btn poker-btn-ghost"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Join */}
          <div className="poker-lobby-quick">
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
                <span className="empty-icon">&#9827;</span>
                <p>{isAdmin ? 'Nenhuma mesa criada. Use "+ Criar Mesa" acima.' : 'Nenhuma mesa disponivel no momento.'}</p>
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
                        <span className="stat-icon">&#128101;</span>
                        <span>{table.players || 0}/{table.maxPlayers || 6}</span>
                      </div>
                      <div className="table-stat">
                        <span className="stat-icon">&#127920;</span>
                        <span>Blinds: {table.blinds || '50/100'}</span>
                      </div>
                    </div>
                    <div className="table-card-actions">
                      <button
                        className="poker-btn poker-btn-primary poker-btn-sm"
                        onClick={(e) => { e.stopPropagation(); handleJoin(table.id); }}
                        disabled={!playerName || playerName.length < 3}
                      >
                        Entrar
                      </button>
                      {isAdmin && (
                        <button
                          className="poker-btn poker-btn-danger poker-btn-sm"
                          onClick={(e) => { e.stopPropagation(); onDeleteTable(table.id); }}
                          title="Deletar mesa"
                        >
                          &#128465;
                        </button>
                      )}
                    </div>
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
