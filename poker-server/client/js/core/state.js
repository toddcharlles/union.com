// js/core/state.js
const listeners = new Map();
export function on(event, cb){ (listeners.get(event) ?? listeners.set(event,[]).get(event)).push(cb); }
export function off(event, cb){ const arr=listeners.get(event)||[]; const i=arr.indexOf(cb); if(i>=0)arr.splice(i,1); }
export function emit(event, payload){ (listeners.get(event)||[]).forEach(cb=>{ try{cb(payload);}catch(e){console.warn(e);} }); }

export const state = {
  provider: null,
  signer: null,
  wallet: null,
  isConnected: false,
  contracts: { chips:null, table:null, cashier:null, factory:null },
  selectedTable: { idText:null, address:null, name:null },
  knownTables: JSON.parse(localStorage.getItem('poker_known_tables') || '[]')
};

export function setSelectedTable({ idText, address, name }){
  state.selectedTable = { idText, address, name };
  localStorage.setItem('poker_last_table', JSON.stringify({ id:idText||name||'', address }));
  emit('table:changed', state.selectedTable);
}
export function saveKnownTables(){
  localStorage.setItem('poker_known_tables', JSON.stringify(state.knownTables));
  emit('tables:known:update', state.knownTables);
}
