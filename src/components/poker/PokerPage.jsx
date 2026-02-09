import React, { useState, useCallback } from 'react';
import { usePokerSocket } from '../../hooks/usePokerSocket';
import PokerLobby from './PokerLobby';
import PokerGame from './PokerGame';

const PokerPage = ({ account, onBack }) => {
  const [currentTableId, setCurrentTableId] = useState(null);

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
      {/* Back button */}
      <div className="poker-page-nav">
        <button className="poker-btn poker-btn-ghost" onClick={handleBack}>
          &#8592; Voltar ao DApp
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="poker-error-banner">
          <span>{error}</span>
        </div>
      )}

      {/* Lobby or Game */}
      {!seated ? (
        <PokerLobby
          tables={tables}
          onJoinTable={handleJoinTable}
          onRefresh={refreshTables}
          connected={connected}
          onConnect={connect}
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
