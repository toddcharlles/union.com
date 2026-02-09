import React from 'react';
import { formatRecordingTime } from './chatHelpers.js';

// Generate a deterministic color from wallet address
const getIdenticonColor = (address) => {
  if (!address) return '#6366f1';
  const colors = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
    'linear-gradient(135deg, #3b82f6, #2563eb)',
    'linear-gradient(135deg, #ec4899, #db2777)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
    'linear-gradient(135deg, #f97316, #ea580c)',
  ];
  const index = parseInt(address?.slice(-2) || '0', 16) % colors.length;
  return colors[index];
};

const ChatInput = ({
  chatMode,
  isReadOnly,
  isConnected,
  isSending,
  newMessage,
  error,
  account,
  selectedImage,
  imagePreview,
  audioBlob,
  audioPreview,
  isRecording,
  recordingTime,
  replyTo,
  fileInputRef,
  inputRef,
  onMessageChange,
  onKeyPress,
  onSend,
  onImageSelect,
  onRemoveImage,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onCancelReply,
}) => {
  if (isReadOnly) {
    return (
      <div className="post-card p-4 text-center">
        <p className="text-gray-500 text-sm">
          {!account
            ? '👀 Conecte sua carteira para participar da comunidade'
            : error || 'Verificando acesso...'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="post-card p-4">
      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 bg-white/5 rounded-xl border-l-2 border-indigo-500/50">
          <div className="text-xs text-gray-400">
            <span className="text-indigo-400 font-medium">↩️ Respondendo @{replyTo.address?.slice(-4)}</span>
            <span className="ml-1 text-gray-500">{replyTo.message?.substring(0, 40)}...</span>
          </div>
          <button onClick={onCancelReply} className="text-gray-500 hover:text-white transition-colors text-sm">✕</button>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-red-500/10 rounded-xl border border-red-500/20">
          <span className="animate-pulse text-red-400 text-lg">🎤</span>
          <div className="flex-1">
            <span className="text-red-300 font-medium text-sm">Gravando...</span>
            <span className="ml-2 text-red-400 text-sm">{formatRecordingTime(recordingTime)}</span>
            <span className="ml-2 text-[10px] text-red-500/60">(máx 1 min)</span>
          </div>
          <button onClick={onStopRecording} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg text-xs transition-colors">Parar</button>
          <button onClick={onCancelRecording} className="text-red-400 hover:text-red-300 text-sm">✕</button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="flex items-center gap-3 mb-3">
          <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-xl border border-white/10" />
          <span className="text-xs text-gray-400 flex-1">📷 Imagem selecionada</span>
          <button onClick={onRemoveImage} className="text-red-400 hover:text-red-300 transition-colors text-sm">✕</button>
        </div>
      )}

      {/* Audio preview */}
      {audioPreview && (
        <div className="flex items-center gap-3 mb-3">
          <audio src={audioPreview} controls className="h-8 flex-1" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.8)' }} />
          <button onClick={onCancelRecording} className="text-red-400 hover:text-red-300 transition-colors text-sm">✕</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 rounded-xl text-xs text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-start gap-3">
        {/* User identicon */}
        <div
          className="identicon flex-shrink-0 mt-0.5"
          style={{ background: getIdenticonColor(account), width: 36, height: 36, fontSize: 13 }}
        >
          {account ? account.slice(-2).toUpperCase() : '??'}
        </div>

        <div className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={onMessageChange}
            onKeyPress={onKeyPress}
            placeholder={chatMode === 'private' ? 'Mensagem privada...' : 'O que está acontecendo?'}
            maxLength={500}
            disabled={!isConnected || isSending || isRecording}
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none disabled:opacity-30 py-1"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={onImageSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || isSending || isRecording}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-indigo-400 hover:bg-white/5 disabled:opacity-30 transition-all text-sm"
                title="Enviar imagem"
              >
                📷
              </button>
              <button
                onClick={isRecording ? onStopRecording : onStartRecording}
                disabled={!isConnected || isSending || selectedImage || audioBlob}
                className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all text-sm ${
                  isRecording ? 'text-red-400 bg-red-500/10' : 'text-gray-500 hover:text-indigo-400 hover:bg-white/5'
                }`}
                title="Gravar áudio"
              >
                🎤
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600">{newMessage.length}/500</span>
              <button
                onClick={onSend}
                disabled={!isConnected || (!newMessage.trim() && !selectedImage && !audioBlob) || isSending || isRecording}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-full text-xs font-bold transition-all"
              >
                Publicar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;