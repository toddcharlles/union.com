import React from 'react';

const ChatStyles = () => (
  <style>{`
    @keyframes mentionPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
      50% { box-shadow: 0 0 0 8px rgba(234, 179, 8, 0); }
    }
    @keyframes mentionBorder {
      0%, 100% { border-color: #eab308; }
      50% { border-color: #f97316; }
    }
    @keyframes reactionFloat {
      0% { transform: scale(1) translateY(0); opacity: 1; }
      100% { transform: scale(2) translateY(-30px); opacity: 0; }
    }
    @keyframes slideIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes highlightGlow {
      0%, 100% { background-color: rgba(234, 179, 8, 0.05); }
      50% { background-color: rgba(234, 179, 8, 0.15); }
    }
    @keyframes gradientShine {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes notifSlide {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .mention-highlight {
      animation: mentionPulse 1.5s ease-in-out 2, mentionBorder 1s ease-in-out 3;
      border: 2px solid #eab308;
      border-radius: 12px;
    }
    .reaction-float {
      animation: reactionFloat 1s ease-out forwards;
      position: absolute;
      top: -10px;
      right: 10px;
      font-size: 24px;
      pointer-events: none;
      z-index: 50;
    }
    .panel-slide {
      animation: slideIn 0.2s ease-out;
    }
    .highlight-glow {
      animation: highlightGlow 1.5s ease-in-out 2;
    }
    .notif-slide {
      animation: notifSlide 0.3s ease-out;
    }
    .social-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .social-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .social-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
    }
    .social-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .gold-shine {
      background: linear-gradient(90deg, #b8860b, #ffd700, #b8860b);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: gradientShine 3s linear infinite;
    }
    .post-card {
      background: linear-gradient(135deg, #141c28 0%, #1a2435 100%);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      transition: all 0.2s ease;
    }
    .post-card:hover {
      border-color: rgba(255, 255, 255, 0.12);
      background: linear-gradient(135deg, #172030 0%, #1e2a3d 100%);
    }
    .nav-item {
      transition: all 0.2s ease;
      border-radius: 12px;
      padding: 10px 14px;
      cursor: pointer;
    }
    .nav-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .nav-item.active {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
    }
    .sidebar-card {
      background: linear-gradient(135deg, #141c28 0%, #1a2435 100%);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
    }
    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }
    .identicon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: bold;
      color: white;
      flex-shrink: 0;
    }
  `}</style>
);

export default ChatStyles;