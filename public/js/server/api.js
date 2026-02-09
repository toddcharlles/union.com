// js/server/api.js
const base = () => document.getElementById("serverUrl")?.value.trim() || "http://localhost:3001";

export async function fetchStatus(){
  const url = `${base()}/api/blockchain/status`;
  try{
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.contracts) throw new Error("payload sem contracts");
    return data;
  }catch(e){ console.warn("[fetchStatus]", e); return null; }
}

export async function seatRequest(tableIdText, wallet){
  const res = await fetch(`${base()}/api/seat/${encodeURIComponent(tableIdText)}/${wallet}`, { method: 'POST' });
  let data={}; try{ data = await res.json(); }catch(_){}
  if(!res.ok) throw new Error(data?.error || res.statusText);
  return data; // {queued?:boolean}
}

export async function getServerTables(){
  try{
    const res = await fetch(`${base()}/api/tables`);
    const data = await res.json();
    return data.tables || [];
  }catch(e){ console.warn("[getServerTables]", e); return []; }
}
