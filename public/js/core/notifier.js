// js/core/notifier.js
export const notify = (() => {
  let booted = false;
  function boot(){
    if (booted || document.getElementById('pkr-toast-wrap')) return (booted = true);
    const css = `
    .pkr-toast-wrap{position:fixed;left:0;right:0;bottom:20px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:2147483647;pointer-events:none}
    .pkr-toast{pointer-events:auto;min-width:260px;max-width:92vw;padding:12px 14px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,.18);background:#0b1020;color:#fff;font:14px/1.35 system-ui,Segoe UI,Roboto,Ubuntu,sans-serif;display:flex;align-items:center;gap:10px;transform:translateY(6px);opacity:.98}
    .pkr-toast.success{background:#064e3b}.pkr-toast.error{background:#7f1d1d}.pkr-toast.info{background:#1f2937}
    .pkr-toast .pkr-close{margin-left:auto;opacity:.8;cursor:pointer}
    .pkr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:saturate(180%) blur(2px);display:flex;align-items:center;justify-content:center;z-index:2147483646}
    .pkr-dialog{background:#0b1020;color:#fff;padding:18px;width:min(92vw,380px);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.25)}
    .pkr-dialog h3{margin:0 0 8px;font-size:18px}.pkr-dialog p{margin:0 0 14px;color:#cbd5e1}
    .pkr-actions{display:flex;gap:8px;justify-content:flex-end}
    .pkr-btn{padding:8px 12px;border-radius:10px;border:none;cursor:pointer}
    .pkr-btn.primary{background:#2563eb;color:#fff}.pkr-btn.ghost{background:#111827;color:#e5e7eb}
    .pkr-loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);z-index:2147483645}
    .pkr-spin{width:44px;height:44px;border-radius:50%;border:4px solid #fff3;border-top-color:#fff;animation:pkr-spin 1s linear infinite}
    @keyframes pkr-spin{to{transform:rotate(360deg)}}`;
    const st = document.createElement('style'); st.textContent = css; st.id='pkr-notifier-style';
    (document.head||document.documentElement).appendChild(st);
    const wrap = document.createElement('div'); wrap.id='pkr-toast-wrap'; wrap.className='pkr-toast-wrap';
    (document.body||document.documentElement).appendChild(wrap);
  }
  function toast(message, opts = {}) {
    boot();
    const wrap = document.getElementById('pkr-toast-wrap');
    const t = document.createElement('div');
    t.className = 'pkr-toast ' + (opts.type || 'info');
    t.innerHTML = `<span>${message}</span><span class="pkr-close">✕</span>`;
    wrap.appendChild(t);
    const close = () => { t.style.opacity='0'; t.style.transform='translateY(10px)'; setTimeout(()=>t.remove(),180); };
    t.querySelector('.pkr-close').onclick = close;
    const ms = (opts.duration ?? 4500);
    if (ms > 0) setTimeout(close, ms);
    return close;
  }
  function loading(message = 'Processando...') {
    boot();
    const ov = document.createElement('div'); ov.className='pkr-loading';
    ov.innerHTML = `<div class="pkr-dialog" style="display:flex;gap:12px;align-items:center">
      <div class="pkr-spin"></div><div class="pkr-msg">${message}</div></div>`;
    (document.body||document.documentElement).appendChild(ov);
    return (nextMsg) => { if (typeof nextMsg === 'string') ov.querySelector('.pkr-msg').textContent = nextMsg; else ov.remove(); };
  }
  function confirm({ title='Confirmar', message='', okText='Confirmar', cancelText='Cancelar' } = {}) {
    boot();
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className='pkr-overlay';
      ov.innerHTML = `<div class="pkr-dialog"><h3>${title}</h3><p>${message}</p>
        <div class="pkr-actions"><button class="pkr-btn ghost">${cancelText}</button>
        <button class="pkr-btn primary">${okText}</button></div></div>`;
      (document.body||document.documentElement).appendChild(ov);
      const [btnCancel, btnOk] = ov.querySelectorAll('button');
      btnCancel.onclick = () => { ov.remove(); resolve(false); };
      btnOk.onclick = () => { ov.remove(); resolve(true); };
      ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); resolve(false); } });
    });
  }
  return { toast, loading, confirm };
})();
export const showMessage = (msg, isError=false) => notify.toast(msg, { type: isError ? 'error' : 'success' });
