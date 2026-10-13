/* Storage check: does this phone keep the app's data after the app is closed?
   Each open records a marker in localStorage, IndexedDB, a cookie and sessionStorage, after first reading what the
   previous open left. Kept = the phone kept it; empty = wiped (or this is the first open). */
var Probe=(function(){
  var KEY='fi-probe', now=new Date().toISOString(), out={rows:[],info:[]}, ready=null;
  function parse(v){ try{ return JSON.parse(v); }catch(e){ return null; } }
  function next(prev){ return {n:((prev&&prev.n)||0)+1,at:now}; }
  function row(name,prev,err){ out.rows.push({name:name,prev:prev,err:err||''}); }
  function idb(){ return new Promise(function(res){
    try{ var r=indexedDB.open('fi-probe',1);
      r.onupgradeneeded=function(){ r.result.createObjectStore('p'); };
      r.onerror=function(){ res({err:String(r.error||'error')}); };
      r.onsuccess=function(){ var db=r.result;
        try{ var t=db.transaction('p','readwrite'), st=t.objectStore('p'), g=st.get(KEY);
          g.onsuccess=function(){ var prev=g.result||null; st.put(next(prev),KEY); t.oncomplete=function(){ res({prev:prev}); }; };
          t.onerror=function(){ res({err:String(t.error||'error')}); };
        }catch(e){ res({err:String(e)}); } };
    }catch(e){ res({err:String(e)}); } }); }
  function start(){
    if(ready) return ready;
    var prev;
    try{ prev=parse(localStorage.getItem(KEY)); localStorage.setItem(KEY,JSON.stringify(next(prev))); row('Local storage',prev); }catch(e){ row('Local storage',null,String(e)); }
    try{ var m=document.cookie.match(/(?:^|; )fi-probe=([^;]*)/); prev=m?parse(decodeURIComponent(m[1])):null;
      document.cookie='fi-probe='+encodeURIComponent(JSON.stringify(next(prev)))+'; max-age=31536000; path=/; SameSite=None; Secure'; row('Cookie',prev); }catch(e){ row('Cookie',null,String(e)); }
    try{ prev=parse(sessionStorage.getItem(KEY)); sessionStorage.setItem(KEY,JSON.stringify(next(prev))); row('Session storage (expected to clear)',prev); }catch(e){ row('Session storage',null,String(e)); }
    var embedded=true; try{ embedded=window.top!==window; }catch(e){}
    var standalone=!!(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));
    out.info.push(['Page address',location.hostname],['Embedded in another page',embedded?'Yes':'No'],['Opened as a home-screen app',standalone?'Yes':'No (or can\u2019t tell from inside a frame)'],
      ['Browser',navigator.userAgent],['Checked at',new Date(now).toLocaleString('en-NZ')]);
    var jobs=[idb().then(function(r){ out.rows.splice(1,0,{name:'IndexedDB (where inspections are kept)',prev:r.prev||null,err:r.err||''}); })];
    if(navigator.storage&&navigator.storage.persisted) jobs.push(navigator.storage.persisted().then(function(p){ out.info.push(['Phone agreed to keep the data',p?'Yes':'No']); }).catch(function(){}));
    if(document.hasStorageAccess) jobs.push(document.hasStorageAccess().then(function(a){ out.info.push(['Full storage access (embedded pages)',a?'Yes':'No']); }).catch(function(){}));
    ready=Promise.all(jobs).then(function(){ return out; });
    return ready;
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function when(iso){ try{ return new Date(iso).toLocaleString('en-NZ',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',second:'2-digit'}); }catch(e){ return iso; } }
  function html(o){
    var kept=o.rows.filter(function(r){ return r.prev; }).length;
    return '<table style="width:100%;border-collapse:collapse;font-size:.9rem">'+o.rows.map(function(r){
      return '<tr><td style="padding:6px 8px 6px 0;vertical-align:top;font-weight:700">'+esc(r.name)+'</td><td style="padding:6px 0;vertical-align:top">'+
        (r.err?'<span style="color:#b91c1c">Not available: '+esc(r.err)+'</span>':r.prev?'<span style="color:#15803d;font-weight:700">\u2713 Kept</span> from open #'+esc(r.prev.n)+' at '+esc(when(r.prev.at)):
          '<span style="color:#b91c1c;font-weight:700">\u2717 Empty</span> (wiped, or this is the first open)')+'</td></tr>'; }).join('')+'</table>'+
      '<div style="font-size:.8rem;opacity:.75;margin-top:10px">'+o.info.map(function(x){ return '<div><b>'+esc(x[0])+':</b> '+esc(x[1])+'</div>'; }).join('')+'</div>'+
      (kept?'':'<div style="font-size:.85rem;margin-top:8px">Nothing was kept. If you have opened this before, the phone cleared the data.</div>');
  }
  return {start:start,html:html};
})();
