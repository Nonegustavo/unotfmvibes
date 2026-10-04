/* unotfm solo - service worker */
const CACHE='unotfm-v2';
const CORE=['./','./index.html','./css/style.css','./js/data.js','./js/effects.js','./js/engine.js','./js/cards.js','./js/bots.js','./js/ui.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-64.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  // página e código do jogo vêm sempre na versão mais nova do servidor ({cache:'no-cache'} confere com ele em vez de
  // usar o cache do navegador), para não misturar arquivos novos com antigos logo depois de uma atualização
  // página do jogo: tenta a rede primeiro para pegar atualizações, cai no cache se estiver offline
  if(req.mode==='navigate'){
    // (uma requisição de navegação não aceita opções, por isso o fetch usa só o endereço)
    e.respondWith(fetch(req.url,{cache:'no-cache'}).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));return r}).catch(()=>caches.match('./index.html')));
    return;
  }
  // código do jogo (html, css, js do próprio site): rede primeiro para receber atualizações, cache se estiver offline
  if(url.origin===location.origin&&/\.(html|css|js)$/.test(url.pathname)){
    e.respondWith(fetch(req,{cache:'no-cache'}).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));return r}).catch(()=>caches.match(req)));
    return;
  }
  // demais arquivos (ícones, three.js, fontes): cache primeiro, atualiza em segundo plano
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp))}return r}).catch(()=>hit);
    return hit||net;
  }));
});
