(function(){
  const c = document.getElementById('stars-bg'); if(!c) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctx = c.getContext('2d'); let w=0,h=0, stars=[]; const N=180;
  function resize(){ w=c.width=Math.floor(innerWidth*dpr); h=c.height=Math.floor(innerHeight*dpr); c.style.width=innerWidth+'px'; c.style.height=innerHeight+'px'; }
  function init(){ stars=Array.from({length:N},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.8+.4,a:Math.random(),v:(Math.random()*.6+.2)*dpr})); }
  function frame(){ ctx.clearRect(0,0,w,h); for(const s of stars){ s.a+= (Math.random()-.5)*.06; s.a=Math.max(.2, Math.min(1,s.a)); s.y += s.v*0.1; if(s.y>h){ s.y=-10; s.x=Math.random()*w; } ctx.beginPath(); ctx.fillStyle=`rgba(255,255,255,${s.a})`; ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); } requestAnimationFrame(frame); }
  addEventListener('resize', ()=>{ resize(); init(); }); resize(); init(); frame();
})();