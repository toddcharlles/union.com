import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { CHAT_SERVER_URL, formatShortAddress, getTotalReactions } from './chatHelpers.js';

const useChatSocket = ({ account, isOpen, scrollToBottom, scrollToMessage, triggerReactionAnimation }) => {
  const [messages, setMessages] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [error, setError] = useState('');
  const [userData, setUserData] = useState(null);
  const [notification, setNotification] = useState(null);

  // Typing indicators
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Reaction animations
  const [reactionAnimations, setReactionAnimations] = useState([]);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState(null);

  // Community highlights
  const [communityHighlights, setCommunityHighlights] = useState([]);

  // Social memory
  const [socialMemory, setSocialMemory] = useState(null);

  // Polls
  const [polls, setPolls] = useState([]);

  // Private messaging
  const [privateTargetData, setPrivateTargetData] = useState(null);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [unreadPrivate, setUnreadPrivate] = useState(0);

  // Following system
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [followCounts, setFollowCounts] = useState({ following: 0, followers: 0 });

  const socketRef = useRef(null);

  // Conexão com Socket.IO
  useEffect(() => {
    if (!isOpen) return;

    const socket = io(CHAT_SERVER_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError('');
      console.log('✅ Chat connected');
      if (account) {
        socket.emit('authenticate', { address: account });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsAuthenticated(false);
      console.log('❌ Chat disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Error connecting to chat');
      setIsConnected(false);
    });

    socket.on('authResult', (result) => {
      if (result.success) {
        setIsAuthenticated(true);
        setUserData(result.userData);
        setError('');
      } else {
        setIsAuthenticated(false);
        setError(result.error);
      }
    });

    socket.on('messageHistory', (history) => {
      setMessages(history);
      const pinned = history.filter(m => m.isPinned);
      setPinnedMessages(pinned);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('newMessage', (message) => {
      setMessages((prev) => [...prev, message]);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('reactionUpdate', ({ messageId, reactions, reactedBy, reactionAdded }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions } : msg
        )
      );
      if (reactionAdded && reactions) {
        const lastReaction = Object.entries(reactions).find(([, users]) =>
          users.includes(reactedBy)
        );
        if (lastReaction) {
          triggerReactionAnimation(lastReaction[0], messageId);
        }
      }
    });

    socket.on('reactionNotification', ({ reaction, by, totalReactions, messagePreview }) => {
      setNotification(
        `${reaction} @${by.slice(-4)} reagiu à sua mensagem${messagePreview ? ': "' + messagePreview + '"' : ''} (${totalReactions} total)`
      );
      setTimeout(() => setNotification(null), 4000);
    });

    socket.on('messageDeleted', (messageId) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setPinnedMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    });

    socket.on('messagePinned', ({ messageId, message }) => {
      setPinnedMessages((prev) => [...prev, { ...message, isPinned: true }]);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: true } : msg
        )
      );
    });

    socket.on('messageUnpinned', (messageId) => {
      setPinnedMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: false } : msg
        )
      );
    });

    socket.on('mentioned', ({ by, message, messageId }) => {
      setNotification(`🔥 @${formatShortAddress(by)} mencionou você: "${message}..."`);
      setTimeout(() => setNotification(null), 5000);
      if (messageId) {
        setTimeout(() => scrollToMessage(messageId), 300);
      }
    });

    socket.on('banned', () => {
      setError('You were banned from the chat');
      setIsAuthenticated(false);
    });

    socket.on('userCount', (count) => {
      setUserCount(count);
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    // Typing indicators
    socket.on('userTyping', ({ address }) => {
      setTypingUsers(prev => {
        if (prev.includes(address)) return prev;
        return [...prev, address];
      });
    });

    socket.on('userStoppedTyping', ({ address }) => {
      setTypingUsers(prev => prev.filter(a => a !== address));
    });

    // Community highlights
    socket.on('communityHighlight', ({ message, totalReactions }) => {
      setCommunityHighlights(prev => [...prev, { ...message, totalReactions, highlightedAt: Date.now() }]);
      setNotification(`🏆 Mensagem de @${message.address?.slice(-4)} virou destaque! (${totalReactions} reações)`);
      setTimeout(() => setNotification(null), 5000);
    });

    socket.on('communityHighlightsList', (highlights) => {
      setCommunityHighlights(highlights);
    });

    // Leaderboard
    socket.on('leaderboard', (data) => {
      setLeaderboard(data);
    });

    // Social memory
    socket.on('socialMemory', (data) => {
      setSocialMemory(data);
    });

    // Polls
    socket.on('pollsList', (pollsData) => {
      setPolls(pollsData);
    });

    socket.on('newPoll', (poll) => {
      setPolls(prev => [...prev.filter(p => p.id !== poll.id), poll]);
      setNotification(`📊 Nova enquete: "${poll.question}"`);
      setTimeout(() => setNotification(null), 5000);
    });

    socket.on('pollUpdate', (updatedPoll) => {
      setPolls(prev => prev.map(p => p.id === updatedPoll.id ? updatedPoll : p));
    });

    socket.on('pollClosed', (closedPoll) => {
      setPolls(prev => prev.map(p => p.id === closedPoll.id ? { ...closedPoll, isActive: false } : p));
      setNotification(`📊 Enquete encerrada: "${closedPoll.question}"`);
      setTimeout(() => setNotification(null), 4000);
    });

    socket.on('pollDeleted', (pollId) => {
      setPolls(prev => prev.filter(p => p.id !== pollId));
    });

    // Private messaging
    socket.on('privateChatHistory', ({ targetAddress, targetData, messages: history }) => {
      setPrivateTargetData(targetData);
      setPrivateMessages(history);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('newPrivateMessage', (msg) => {
      setPrivateMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('privateMessageNotification', ({ from, preview }) => {
      setUnreadPrivate(prev => prev + 1);
      setNotification(`💬 Mensagem de @${from.slice(-4)}: "${preview}"`);
      setTimeout(() => setNotification(null), 5000);
    });

    socket.on('privateConversations', (convs) => {
      setConversations(convs);
      const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      setUnreadPrivate(totalUnread);
    });

    // Following system
    socket.on('followingList', (list) => {
      setFollowing(list || []);
    });

    socket.on('followersList', (list) => {
      setFollowers(list || []);
    });

    socket.on('followCounts', (counts) => {
      setFollowCounts(counts || { following: 0, followers: 0 });
    });

    socket.on('followUpdate', ({ following: followingList, followers: followersList, counts }) => {
      if (followingList) setFollowing(followingList);
      if (followersList) setFollowers(followersList);
      if (counts) setFollowCounts(counts);
    });

    socket.on('newFollower', ({ address: followerAddr }) => {
      setNotification(`👥 @${followerAddr.slice(-4)} começou a te seguir!`);
      setTimeout(() => setNotification(null), 4000);
    });

    return () => {
      socket.disconnect();
    };
  }, [isOpen, account, scrollToBottom, scrollToMessage, triggerReactionAnimation]);

  // Re-autenticar quando conta mudar
  useEffect(() => {
    if (isConnected && account && socketRef.current) {
      socketRef.current.emit('authenticate', { address: account });
    }
  }, [account, isConnected]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    socketRef.current.emit('typing', { address: account });
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && account) {
        socketRef.current.emit('stopTyping', { address: account });
      }
    }, 2000);
  }, [account, isAuthenticated]);

  // Actions
  const sendMessage = useCallback(async (messageData) => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    if (socketRef.current && account) {
      socketRef.current.emit('stopTyping', { address: account });
    }
    socketRef.current.emit('sendMessage', { address: account, ...messageData });
  }, [account, isAuthenticated]);

  const sendPrivateMessage = useCallback(async (messageData) => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    if (socketRef.current && account) {
      socketRef.current.emit('stopTyping', { address: account });
    }
    socketRef.current.emit('sendPrivateMessage', { address: account, ...messageData });
  }, [account, isAuthenticated]);

  const addReaction = useCallback((messageId, reaction) => {
    if (!account || !socketRef.current || !isAuthenticated) return;
    socketRef.current.emit('addReaction', { address: account, messageId, reaction });
  }, [account, isAuthenticated]);

  const deleteMessage = useCallback((messageId) => {
    if (!account || !socketRef.current || !userData?.isAdmin) return;
    if (window.confirm('Delete this message?')) {
      socketRef.current.emit('deleteMessage', { address: account, messageId });
    }
  }, [account, userData]);

  const banUser = useCallback((targetAddress) => {
    if (!account || !socketRef.current || !userData?.isAdmin) return;
    if (window.confirm(`Ban ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)} from chat?`)) {
      socketRef.current.emit('banUser', { address: account, targetAddress });
    }
  }, [account, userData]);

  const pinMessage = useCallback((messageId) => {
    if (!account || !socketRef.current || !userData?.isAdmin) return;
    socketRef.current.emit('pinMessage', { address: account, messageId });
  }, [account, userData]);

  const loadPrivateChat = useCallback((targetAddress) => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('loadPrivateChat', { address: account, targetAddress });
  }, [account]);

  const getConversations = useCallback(() => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('getPrivateConversations', { address: account });
  }, [account]);

  const requestLeaderboard = useCallback(() => {
    if (socketRef.current) socketRef.current.emit('getLeaderboard');
  }, []);

  const requestHighlights = useCallback(() => {
    if (socketRef.current) socketRef.current.emit('getCommunityHighlights');
  }, []);

  const requestSocialMemory = useCallback(() => {
    if (socketRef.current) socketRef.current.emit('getSocialMemory');
  }, []);

  const requestPolls = useCallback(() => {
    if (socketRef.current) socketRef.current.emit('getPolls', { address: account });
  }, [account]);

  const votePoll = useCallback((pollId, optionId) => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    socketRef.current.emit('votePoll', { address: account, pollId, optionId });
  }, [account, isAuthenticated]);

  const createPoll = useCallback((pollData) => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('createPoll', { address: account, ...pollData });
  }, [account]);

  const closePoll = useCallback((pollId) => {
    if (!socketRef.current || !account) return;
    if (window.confirm('Close this poll?')) {
      socketRef.current.emit('closePoll', { address: account, pollId });
    }
  }, [account]);

  const deletePoll = useCallback((pollId) => {
    if (!socketRef.current || !account) return;
    if (window.confirm('Delete this poll permanently?')) {
      socketRef.current.emit('deletePoll', { address: account, pollId });
    }
  }, [account]);

  // Follow system
  const followUser = useCallback((targetAddress) => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    socketRef.current.emit('followUser', { address: account, targetAddress });
  }, [account, isAuthenticated]);

  const unfollowUser = useCallback((targetAddress) => {
    if (!socketRef.current || !account || !isAuthenticated) return;
    socketRef.current.emit('unfollowUser', { address: account, targetAddress });
  }, [account, isAuthenticated]);

  const getFollowing = useCallback(() => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('getFollowing', { address: account });
  }, [account]);

  const getFollowers = useCallback(() => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('getFollowers', { address: account });
  }, [account]);

  const getFollowCounts = useCallback(() => {
    if (!socketRef.current || !account) return;
    socketRef.current.emit('getFollowCounts', { address: account });
  }, [account]);

  return {
    // State
    messages,
    pinnedMessages,
    isConnected,
    isAuthenticated,
    userCount,
    error,
    setError,
    userData,
    notification,
    setNotification,
    typingUsers,
    reactionAnimations,
    leaderboard,
    communityHighlights,
    socialMemory,
    polls,
    privateTargetData,
    privateMessages,
    setPrivateMessages,
    conversations,
    unreadPrivate,
    setUnreadPrivate,
    following,
    followers,
    followCounts,

    // Actions
    handleTyping,
    sendMessage,
    sendPrivateMessage,
    addReaction,
    deleteMessage,
    banUser,
    pinMessage,
    loadPrivateChat,
    getConversations,
    requestLeaderboard,
    requestHighlights,
    requestSocialMemory,
    requestPolls,
    votePoll,
    createPoll,
    closePoll,
    deletePoll,
    followUser,
    unfollowUser,
    getFollowing,
    getFollowers,
    getFollowCounts,
  };
};

export default useChatSocket;