// js/core/helpers.js
export const formatAddress = (a)=> a ? `${a.slice(0,6)}...${a.slice(-4)}` : '';
export const escapeHtml = (text)=> { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; };
export const safeNumber = (v, def=0)=> { const n = Number(v); return Number.isFinite(n) ? n : def; };
