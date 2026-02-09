import React, { useState, useEffect, useRef } from 'react';
import { CONTRACTS, CHAIN_CONFIG } from '../config';

// Global log storage that persists across renders
let globalLogs = [];
let logListeners = [];

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console)
};

// Flag to prevent double initialization
let consoleOverridden = false;

const formatLogArg = (arg) => {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'object') {
    try {
      if (arg instanceof Error) {
        return `Error: ${arg.message}`;
      }
      return JSON.stringify(arg, null, 2);
    } catch (e) {
      return String(arg);
    }
  }
  return String(arg);
};

const addLog = (type, args) => {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const message = args.map(formatLogArg).join(' ');

  const logEntry = { type, message, timestamp, id: Date.now() + Math.random() };
  globalLogs = [...globalLogs.slice(-200), logEntry]; // Keep last 200 logs

  // Notify all listeners
  logListeners.forEach(listener => listener(globalLogs));
};

// Override console methods once
if (!consoleOverridden) {
  console.log = (...args) => {
    originalConsole.log(...args);
    addLog('log', args);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    addLog('error', args);
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    addLog('warn', args);
  };
  console.info = (...args) => {
    originalConsole.info(...args);
    addLog('info', args);
  };

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    addLog('error', [`Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
  });

  consoleOverridden = true;

  // Initial log
  addLog('info', ['Console debugger initialized']);
}

const DebugInfo = ({ contracts, account, provider, chainId, isCorrectNetwork }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState(globalLogs);
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Subscribe to log updates
    const listener = (newLogs) => setLogs([...newLogs]);
    logListeners.push(listener);

    return () => {
      logListeners = logListeners.filter(l => l !== listener);
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const copyLogs = () => {
    const status = `=== UnionZod Debug Info ===
Account: ${account || 'Not connected'}
Chain ID: ${chainId || 'Unknown'}
Expected: ${CHAIN_CONFIG.chainId} (${CHAIN_CONFIG.chainName})
Network OK: ${isCorrectNetwork ? 'Yes' : 'No'}
Contracts: ${contracts ? 'Initialized' : 'Not initialized'}
Timestamp: ${new Date().toLocaleString('pt-BR')}

=== Console Logs ===
`;
    const logText = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');

    navigator.clipboard.writeText(status + logText);
    alert('Logs copiados! Cole no chat para enviar.');
  };

  const clearLogs = () => {
    globalLogs = [];
    setLogs([]);
    addLog('info', ['Logs cleared']);
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📝';
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-700 text-sm flex items-center gap-2 z-50"
      >
        <span>🖥️</span> Console
        {logs.filter(l => l.type === 'error').length > 0 && (
          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
            {logs.filter(l => l.type === 'error').length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white rounded-lg shadow-2xl w-[95vw] sm:w-[500px] max-h-[70vh] z-50 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-3 border-b border-gray-700 bg-gray-800 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-green-400">●</span>
          <h3 className="text-sm font-bold">Console Debug</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLogs}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
            title="Copiar logs"
          >
            📋 Copiar
          </button>
          <button
            onClick={clearLogs}
            className="text-xs bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded"
            title="Limpar logs"
          >
            🗑️
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white text-lg"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 text-xs flex flex-wrap gap-3">
        <span className={account ? 'text-green-400' : 'text-red-400'}>
          {account ? `🔗 ${account.slice(0, 6)}...${account.slice(-4)}` : '🔌 Desconectado'}
        </span>
        <span className={isCorrectNetwork ? 'text-green-400' : 'text-red-400'}>
          {isCorrectNetwork ? '✅ BSC Mainnet' : `❌ Chain ${chainId || '?'}`}
        </span>
        <span className={contracts ? 'text-green-400' : 'text-yellow-400'}>
          {contracts ? '📄 Contratos OK' : '⏳ Aguardando...'}
        </span>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs bg-black bg-opacity-50 min-h-[200px] max-h-[400px]">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Nenhum log ainda...</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`py-1 border-b border-gray-800 ${getLogColor(log.type)}`}>
              <span className="text-gray-500">[{log.timestamp}]</span>{' '}
              <span>{getLogIcon(log.type)}</span>{' '}
              <span className="break-all whitespace-pre-wrap">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400 rounded-b-lg">
        {logs.length} logs | Clique em "Copiar" e envie para suporte
      </div>
    </div>
  );
};

export default DebugInfo;
