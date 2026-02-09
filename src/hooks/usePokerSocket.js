import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getPokerServerUrl } from '../config/pokerAccess';

export function usePokerSocket(account) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [tables, setTables] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [myHole, setMyHole] = useState([]);
  const [actionRequest, setActionRequest] = useState(null);
  const [seated, setSeated] = useState(false);
  const [mySeat, setMySeat] = useState(-1);
  const [messages, setMessages] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [winners, setWinners] = useState([]);
  const [allHands, setAllHands] = useState([]);
  const [error, setError] = useState(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const serverUrl = getPokerServerUrl();

    const socket = io(serverUrl, {
      path: '/poker-socket/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      if (account) {
        socket.emit('linkWallet', { walletAddress: account });
      }
      socket.emit('listTables');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      setError(`Falha na conexao: ${err.message}`);
    });

    socket.on('tableList', (list) => {
      setTables(Array.isArray(list) ? list : []);
    });

    socket.on('tableUpdated', (table) => {
      setTables(prev => {
        const idx = prev.findIndex(t => t.id === table.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = table;
          return updated;
        }
        return [...prev, table];
      });
    });

    socket.on('seated', (data) => {
      setSeated(true);
      setMySeat(data.seat);
      setMyHole([]);
      setWinners([]);
      setAllHands([]);
      setActionRequest(null);
      setLastEvent({ type: 'seated', data });
    });

    socket.on('state', (state) => {
      setGameState(state);
    });

    socket.on('hole', ({ cards }) => {
      setMyHole(cards || []);
    });

    socket.on('actionRequest', (data) => {
      setActionRequest(data);
    });

    socket.on('reveal', (data) => {
      setLastEvent({ type: 'reveal', data });
    });

    socket.on('handEnded', ({ winners: w, allHands: ah, reason, board }) => {
      setWinners(w || []);
      setAllHands(ah || []);
      setActionRequest(null);
      setLastEvent({ type: 'handEnded', data: { winners: w, allHands: ah, reason, board } });
    });

    socket.on('playerJoined', (data) => {
      setLastEvent({ type: 'playerJoined', data });
    });

    socket.on('playerLeft', (data) => {
      setLastEvent({ type: 'playerLeft', data });
    });

    socket.on('playerDisconnected', (data) => {
      setLastEvent({ type: 'playerDisconnected', data });
    });

    socket.on('chatMessage', (data) => {
      setMessages(prev => [...prev.slice(-99), data]);
    });

    socket.on('errorMsg', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    });

    socket.on('systemMessage', (msg) => {
      setLastEvent({ type: 'system', data: { message: msg } });
    });

    socket.on('blockchainRoundSettled', () => {
      setLastEvent({ type: 'settled' });
      setWinners([]);
      setAllHands([]);
    });

    socketRef.current = socket;
  }, [account]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
    setSeated(false);
    setGameState(null);
    setMyHole([]);
    setActionRequest(null);
    setWinners([]);
    setAllHands([]);
  }, []);

  const joinTable = useCallback((tableId, playerName, buyin) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('joinTable', {
      tableIdText: tableId,
      name: playerName,
      buyin: buyin,
    });
  }, []);

  const leaveTable = useCallback((tableId) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('leaveTable', { tableId });
    setSeated(false);
    setMySeat(-1);
    setGameState(null);
    setMyHole([]);
    setActionRequest(null);
    setWinners([]);
    setAllHands([]);
  }, []);

  const sendAction = useCallback((tableId, action, amount) => {
    if (!socketRef.current?.connected) return;
    const payload = { tableId, action };
    if (action === 'raise' && amount != null) payload.amount = amount;
    socketRef.current.emit('playerAction', payload);
    setActionRequest(null);
  }, []);

  const sendChat = useCallback((tableId, message) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('sendMessage', { tableId, message });
  }, []);

  const refreshTables = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('listTables');
  }, []);

  const finalizeHand = useCallback((tableId) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('finalizeHand', { tableId });
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return {
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
  };
}
