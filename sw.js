/* unotfm solo - service worker */
const CACHE='unotfm-v2';
const CORE=['./','./index.html','./css/style.css','./js/mesa/dados.js','./js/mesa/regras.js','./js/mesa/cartas.js','./js/mesa/adversarios.js','./js/mesa/visao.js','./js/turbo.js','./js/data.js','./js/arte.js','./js/effects.js','./js/cards.js','./js/ui.js','./js/rede.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-64.png',
  // teste de rede local (prova de conceito): precisa funcionar sem internet
  './lan-teste.html','./css/lan-teste.css','./js/lan.js','./js/lan-teste.js','./js/vendor/qrcode.js','./js/vendor/jsQR.js',
  // mostruário de cartas
  './mostruario.html','./css/mostruario.css','./js/mostruario.js'];
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
  // páginas: tenta a rede primeiro para pegar atualizações, cai no cache se estiver offline. Cada página fica guardada
  // no próprio endereço (o jogo e o teste de rede local); uma página que não está no cache abre o jogo
  if(req.mode==='navigate'){
    const key=/\/(index\.html)?$/.test(url.pathname)?'./index.html':url.origin+url.pathname;
    // (uma requisição de navegação não aceita opções, por isso o fetch usa só o endereço)
    e.respondWith(fetch(req.url,{cache:'no-cache'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(key,cp))}return r})
      .catch(()=>caches.match(key).then(h=>h||caches.match('./index.html'))));
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
