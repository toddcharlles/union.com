import React, { useState, useCallback } from 'react';
import { usePokerSocket } from '../../hooks/usePokerSocket';
import { isPokerAdmin, getPokerMode } from '../../config/pokerAccess';
import PokerLobby from './PokerLobby';
import PokerGame from './PokerGame';
import PokerAdmin from './PokerAdmin';

const PokerPage = ({ account, onBack }) => {
  const [currentTableId, setCurrentTableId] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const isAdmin = isPokerAdmin(account);
  const mode = getPokerMode();

  const {
    connected,
    connect,
    disconnect,
    tables,
    gameState,
    myHole,
    actionRequest,
    seated,
    mySeat,
    messages,
    lastEvent,
    winners,
    allHands,
    error,
    joinTable,
    leaveTable,
    sendAction,
    sendChat,
    refreshTables,
    finalizeHand,
    createTable,
    deleteTable,
  } = usePokerSocket(account);

  const handleJoinTable = useCallback((tableId, name, buyin) => {
    setCurrentTableId(tableId);
    joinTable(tableId, name, buyin);
  }, [joinTable]);

  const handleLeaveTable = useCallback(() => {
    if (currentTableId) {
      leaveTable(currentTableId);
    }
    setCurrentTableId(null);
  }, [currentTableId, leaveTable]);

  const handleAction = useCallback((action, amount) => {
    if (currentTableId) {
      sendAction(currentTableId, action, amount);
    }
  }, [currentTableId, sendAction]);

  const handleChat = useCallback((message) => {
    if (currentTableId) {
      sendChat(currentTableId, message);
    }
  }, [currentTableId, sendChat]);

  const handleFinalize = useCallback((tableId) => {
    finalizeHand(tableId);
  }, [finalizeHand]);

  const handleBack = useCallback(() => {
    if (seated) {
      handleLeaveTable();
    }
    if (connected) {
      disconnect();
    }
    onBack();
  }, [seated, connected, handleLeaveTable, disconnect, onBack]);

  return (
    <div className="poker-page">
      {/* Top navigation */}
      <div className="poker-page-nav">
        <button className="poker-btn poker-btn-ghost" onClick={handleBack}>
          &#8592; Voltar ao DApp
        </button>

        <div className="poker-page-nav-right">
          {/* Mode badge */}
          <span className={`poker-mode-badge ${mode}`}>
            {mode === 'onchain' ? '⛓ On-Chain' : '⚡ Off-Chain'}
          </span>

          {/* Admin button */}
          {isAdmin && (
            <button
              className="poker-btn poker-btn-ghost poker-btn-sm"
              onClick={() => setShowAdmin(true)}
              title="Painel Admin"
            >
              ⚙ Admin
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="poker-error-banner">
          <span>{error}</span>
        </div>
      )}

      {/* Admin Panel Modal */}
      {showAdmin && (
        <PokerAdmin onClose={() => setShowAdmin(false)} />
      )}

      {/* Lobby or Game */}
      {!seated ? (
        <PokerLobby
          tables={tables}
          onJoinTable={handleJoinTable}
          onRefresh={refreshTables}
          connected={connected}
          onConnect={connect}
          mode={mode}
          isAdmin={isAdmin}
          onCreateTable={createTable}
          onDeleteTable={deleteTable}
        />
      ) : (
        <PokerGame
          gameState={gameState}
          myHole={myHole}
          mySeat={mySeat}
          actionRequest={actionRequest}
          winners={winners}
          allHands={allHands}
          messages={messages}
          lastEvent={lastEvent}
          onAction={handleAction}
          onLeave={handleLeaveTable}
          onChat={handleChat}
          onFinalize={handleFinalize}
          tableId={currentTableId}
        />
      )}
    </div>
  );
};

export default PokerPage;
