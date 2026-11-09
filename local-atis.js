/* Local ATIS panel: airport temperature + field elevation.
   Temperature is sourced from the latest official NWS airport observation,
   NOT a captured ATIS broadcast. Never mislabel observation timestamps as ATIS timestamps.
   NWS station elevation is from the station metadata, not the weather observation.
   If the browser cannot fetch current data, the panel explicitly reports unavailable.
*/
(() => {
  'use strict';
  const KEY='mx-local-airport-v2';
  const CACHE='mx-local-airport-last-observation-v2';
  let airport='KMEM', last=null, busy=false;
  try {const v=localStorage.getItem(KEY);if(v&&/^[A-Z]{4}$/.test(v))airport=v;}catch(e){}
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  const tempF=c=>(c*9/5+32);
  const stamp=iso=>{
    if(!iso||Number.isNaN(Date.parse(iso)))return 'Unavailable';
    return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago',timeZoneName:'short'}).format(new Date(iso));
  };
  const fmt=(v,suffix)=>v==null?'—':`${Math.round(v)}${suffix}`;
  const distance=iso=>!iso?Infinity:Date.now()-Date.parse(iso);
  const status=()=>last?.airport===airport&&n(last.c)!=null&&distance(last.time)<90*60*1000?'Current observation':'Unavailable or stale';
  function panelMarkup(){
    const good=last?.airport===airport&&n(last.c)!=null&&distance(last.time)<90*60*1000;
    const elevation=last?.airport===airport?n(last.elev):null;
    const station=last?.airport===airport?last.name:null;
    return `<section class="local-atis-panel" aria-label="Local ATIS airport reference and temperature">
      <div class="local-atis-head"><div><h2>LOCAL ATIS</h2><p>${esc(airport)}${station?' · '+esc(station):' · Airport reference'}</p></div>
        <button type="button" class="atis-pencil" data-atis-toggle>✎ Change airport</button></div>
      <div class="local-atis-grid atis-3">
        <div class="local-atis-item"><small>Temperature °F</small><b>${good?fmt(tempF(last.c),'°F'):'—'}</b></div>
        <div class="local-atis-item"><small>Temperature °C</small><b>${good?fmt(last.c,'°C'):'—'}</b></div>
        <div class="local-atis-item"><small>Field elevation</small><b>${fmt(elevation,' ft MSL')}</b></div>
      </div>
      <div class="atis-actions"><div class="atis-observation"><b>${good?'Latest reported temperature':'Temperature unavailable'}</b><small>Observation: ${last?.airport===airport?esc(stamp(last.time)):'Not received'} · Central time</small><small>${good?'Source: NWS station observation · not ATIS broadcast':'No current observation verified — do not rely on a stale report'}</small></div>
        <button type="button" data-atis-refresh class="atis-refresh" ${busy?'disabled':''}>${busy?'Refreshing…':'↻ Refresh'}</button></div>
      <form class="atis-config" data-atis-form hidden><label>Airport ICAO code</label><input name="airport" maxlength="4" minlength="4" pattern="[A-Za-z]{4}" required autocomplete="off" autocapitalize="characters" value="${esc(airport)}" placeholder="KMEM"><button type="submit">Save airport</button></form>
      <p class="local-atis-foot">Weather is from an official airport observation, not the ATIS broadcast. Elevation comes from airport station metadata. Verify operational information through approved sources.</p>
    </section>`;
  }
  function render(){
    for(const id of ['local-atis-home','local-atis-detail']){
      const host=document.getElementById(id);
      if(host)host.innerHTML=panelMarkup();
    }
  }
  // Get the airport station record and latest observations. NWS serves US airports.
  // Requests are same-origin to NWS endpoints and use only public information.
  async function request(url){
    const response=await fetch(url,{headers:{'Accept':'application/geo+json'},cache:'no-store'});
    if(!response.ok)throw new Error(`NWS status ${response.status}`);
    return response.json();
  }
  async function refresh(){
    if(busy)return;busy=true;render();const target=airport;
    try{
      const [meta,obs]=await Promise.all([
        request(`https://api.weather.gov/stations/${encodeURIComponent(target)}`),
        request(`https://api.weather.gov/stations/${encodeURIComponent(target)}/observations/latest`)
      ]);
      if(target!==airport)return;
      const mp=meta?.properties||{},op=obs?.properties||{};
      const c=n(op?.temperature?.value);
      const measured=op.timestamp;
      const meters=n(mp?.elevation?.value);
      const elev=meters==null?null:Math.round(meters*3.280839895);
      last={airport:target,c,elev,time:measured||null,name:mp.name||''};
      try{localStorage.setItem(CACHE,JSON.stringify(last));}catch(e){}
    }catch(e){
      if(target===airport){last=null;}
    }finally{busy=false;render();}
  }
  document.addEventListener('click',e=>{
    const r=e.target.closest('[data-atis-refresh]');if(r){refresh();return;}
    const t=e.target.closest('[data-atis-toggle]');if(t){
      const host=t.closest('.local-atis-panel');const form=host?.querySelector('[data-atis-form]');if(form){form.hidden=!form.hidden;if(!form.hidden)form.querySelector('input')?.focus();}
    }
  });
  document.addEventListener('submit',e=>{
    if(!e.target.matches('[data-atis-form]'))return;
    e.preventDefault();const v=String(new FormData(e.target).get('airport')||'').toUpperCase().trim();
    if(!/^[A-Z]{4}$/.test(v))return;
    airport=v;last=null;try{localStorage.setItem(KEY,airport);}catch(e){}
    render();refresh();
  });
  // Details are re-rendered on fleet navigation by app.js. Observe changes and
  // populate the identical airport card without re-fetching on each page.
  const details=document.getElementById('detail');
  if(details)new MutationObserver(()=>{
    const host=document.getElementById('local-atis-detail');
    if(host&&!host.querySelector('.local-atis-panel'))host.innerHTML=panelMarkup();
  }).observe(details,{childList:true});
  render();refresh();
})();
