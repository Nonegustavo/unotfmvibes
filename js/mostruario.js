/* unotfm: mostruário de cartas. Mostra todas as cartas com o desenho de verdade do jogo (js/arte.js) e deixa
   experimentar desenhos: você escolhe imagens de símbolos e camadas do baralho e vê na hora, em todas as cores,
   tamanhos e nos dois lados do Portal. As imagens ficam só neste aparelho (IndexedDB), não vão para a internet. */
'use strict';
const CAMADAS=[
  {slot:'textura',nome:'Textura do fundo',arquivo:'textura',dica:'em tons de cinza; o jogo põe cada cor por cima'},
  {slot:'moldura',nome:'Moldura',arquivo:'moldura',dica:'por cima do fundo, com transparência no meio'},
  {slot:'verso',nome:'Verso',arquivo:'verso',dica:'as costas das cartas, proporção 2 × 3'},
];
const CORES=[['r','Vermelho'],['y','Amarelo'],['g','Verde'],['b','Azul'],['w','Coringa'],['borda','Borda'],['simbolo','Símbolos']];
const IMG={}; // slot → {url, nome, avisos}
let CONF={},PADRAO={},alvoUnico=null;
const SOLTOS=[]; // arquivos com nome que não corresponde a nenhuma carta

/* ---------- utilidades ---------- */
let avisoT=null;
function aviso(txt,ms=2800){const a=$('aviso');a.textContent=txt;a.hidden=false;clearTimeout(avisoT);avisoT=setTimeout(()=>a.hidden=true,ms)}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const semAcento=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'');
const normNome=n=>semAcento(n).toLowerCase().replace(/\.[a-z0-9]+$/,'').trim().replace(/[\s_]+/g,'-');
const ARQ={};
SIMBOLOS.forEach(s=>{ARQ[s.arquivo]='sim:'+s.k;ARQ[s.arquivo.replace(/-/g,'')]='sim:'+s.k});
CAMADAS.forEach(c=>ARQ[c.arquivo]=c.slot);ARQ.fundo='textura';
const slotDoNome=n=>{const k=normNome(n);return ARQ[k]||ARQ[k.replace(/-/g,'')]||null};
const nomeDoSlot=slot=>slot.startsWith('sim:')?(SIMBOLOS.find(s=>'sim:'+s.k===slot)||{}).nome:(CAMADAS.find(c=>c.slot===slot)||{}).nome;
function guardarConf(){try{localStorage.setItem('unotfm-mostruario',JSON.stringify(CONF))}catch(e){}}

/* ---------- imagens guardadas no aparelho (IndexedDB) ---------- */
const DB={
  db:null,
  abrir(){
    if(this.db)return Promise.resolve(this.db);
    return new Promise((res,rej)=>{
      const r=indexedDB.open('unotfm-mostruario',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('imagens');
      r.onsuccess=()=>{this.db=r.result;res(this.db)};r.onerror=()=>rej(r.error);
    });
  },
  async fazer(modo,fn){
    const db=await this.abrir();
    return new Promise((res,rej)=>{const tx=db.transaction('imagens',modo),r=fn(tx.objectStore('imagens'));tx.oncomplete=()=>res(r&&r.result);tx.onerror=()=>rej(tx.error)});
  },
  guardar(slot,v){return this.fazer('readwrite',st=>st.put(v,slot))},
  tirar(slot){return this.fazer('readwrite',st=>st.delete(slot))},
  limpar(){return this.fazer('readwrite',st=>st.clear())},
  async tudo(){const ks=await this.fazer('readonly',st=>st.getAllKeys()),vs=await this.fazer('readonly',st=>st.getAll());return ks.map((k,i)=>[k,vs[i]])},
};

/* ---------- preparo das imagens ---------- */
function abrirImagem(blob){
  return new Promise((res,rej)=>{
    const u=URL.createObjectURL(blob),i=new Image();
    i.onload=()=>{URL.revokeObjectURL(u);res(i)};
    i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('não deu para abrir a imagem'))};
    i.src=u;
  });
}
const paraBlob=cv=>new Promise(r=>cv.toBlob(r,'image/png'));
// símbolo: vira um molde (só o formato). Sem transparência, o claro vira transparente e o escuro vira traço
async function prepararSimbolo(arq){
  const img=await abrirImagem(arq),L=512,cv=document.createElement('canvas');cv.width=cv.height=L;
  const g=cv.getContext('2d',{willReadFrequently:true}),k=Math.min(L/img.naturalWidth,L/img.naturalHeight);
  g.drawImage(img,(L-img.naturalWidth*k)/2,(L-img.naturalHeight*k)/2,img.naturalWidth*k,img.naturalHeight*k);
  const d=g.getImageData(0,0,L,L),p=d.data;
  let transp=0;for(let i=3;i<p.length;i+=4)if(p[i]<250)transp++;
  const fundoBranco=transp<L*L*0.01;
  let tinta=0,cor=0,x0=L,y0=L,x1=-1,y1=-1;
  for(let i=0;i<p.length;i+=4){
    const r=p[i],gg=p[i+1],b=p[i+2];let a=p[i+3];
    if(fundoBranco){const lum=0.299*r+0.587*gg+0.114*b;a=lum>235?0:Math.round(255-lum*255/235)}
    if(a>128){tinta++;if(Math.max(r,gg,b)-Math.min(r,gg,b)>70)cor++}
    if(a>40){const x=(i>>2)%L,y=(i>>2)/L|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
    p[i]=p[i+1]=p[i+2]=0;p[i+3]=a;
  }
  g.putImageData(d,0,0);
  const avisos=[];
  if(!tinta)avisos.push('parece vazio');
  else{
    if(cor>tinta*0.1)avisos.push('tem cores: só o formato aparece');
    if(Math.min(x0,y0,L-1-x1,L-1-y1)<L*0.03)avisos.push('encostado na borda: deixe margem');
  }
  if(Math.max(img.naturalWidth,img.naturalHeight)<256)avisos.push(`pequeno (${img.naturalWidth} × ${img.naturalHeight})`);
  if(fundoBranco)avisos.push('fundo branco tirado');
  return {blob:await paraBlob(cv),avisos};
}
// camada do baralho: fica como está, só diminui se for muito grande
async function prepararCamada(arq,slot){
  const img=await abrirImagem(arq),M=1024,k=Math.min(1,M/Math.max(img.naturalWidth,img.naturalHeight));
  const cv=document.createElement('canvas');cv.width=Math.round(img.naturalWidth*k);cv.height=Math.round(img.naturalHeight*k);
  cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  const avisos=[],prop=img.naturalWidth/img.naturalHeight;
  if(slot!=='textura'&&Math.abs(prop-2/3)>0.06)avisos.push(`proporção ${img.naturalWidth} × ${img.naturalHeight}: o ideal é 2 × 3`);
  return {blob:await paraBlob(cv),avisos};
}

/* ---------- usar, tirar e aplicar ---------- */
function colocar(slot,blob,nome,avisos){
  if(IMG[slot])URL.revokeObjectURL(IMG[slot].url);
  IMG[slot]={url:URL.createObjectURL(blob),nome,avisos:avisos||[]};
}
async function usarArquivo(arq,slot){
  try{
    const r=slot.startsWith('sim:')?await prepararSimbolo(arq):await prepararCamada(arq,slot);
    colocar(slot,r.blob,arq.name,r.avisos);
    try{await DB.guardar(slot,{buf:await r.blob.arrayBuffer(),tipo:'image/png',nome:arq.name,avisos:r.avisos})}catch(e){}
    return true;
  }catch(e){aviso(`${arq.name}: ${e.message}`,4000);return false}
}
async function tirar(slot){
  if(IMG[slot]){URL.revokeObjectURL(IMG[slot].url);delete IMG[slot]}
  try{await DB.tirar(slot)}catch(e){}
  aplicar();desenhar();
}
async function receberArquivos(lista){
  let n=0;
  for(const arq of lista){
    if(!/^image\//.test(arq.type)&&!/\.(png|jpe?g|webp|gif)$/i.test(arq.name)){aviso(`${arq.name} não é uma imagem.`);continue}
    const slot=alvoUnico||slotDoNome(arq.name);
    if(!slot){SOLTOS.push(arq);continue}
    if(await usarArquivo(arq,slot))n++;
  }
  alvoUnico=null;
  aplicar();desenhar();
  if(n)aviso(n===1?'Imagem aplicada.':`${n} imagens aplicadas.`);
  if(SOLTOS.length)aviso(`${SOLTOS.length} arquivo${SOLTOS.length>1?'s':''} com nome desconhecido: escolha onde ${SOLTOS.length>1?'entram':'entra'} no painel.`,4000);
}
function aplicar(){
  ARTE.simbolos={};
  Object.entries(IMG).forEach(([slot,v])=>{if(slot.startsWith('sim:'))ARTE.simbolos[slot.slice(4)]=v.url});
  ARTE.baralho={
    textura:IMG.textura&&IMG.textura.url,moldura:IMG.moldura&&IMG.moldura.url,verso:IMG.verso&&IMG.verso.url,
    mistura:CONF.mistura||'multiply',cores:CONF.cores||{},borda:CONF.borda,simbolo:CONF.simbolo,raio:CONF.raio,filete:CONF.filete,
  };
  aplicarArte();
}

/* ---------- painel ---------- */
const cartaHTML=(c,cor,attrs='')=>`<div class="card c-${cor||c.color}" ${attrs}>${faceHTML(c)}</div>`;
const corEsp=k=>((SP[k].deck||[])[0])||(k==='chest'?'y':'w');
function exemplo(k){
  if(/^\d$/.test(k))return mk('r','num',+k);
  if(k==='wild'||k==='d4')return mk('w',k);
  if(RESERVA[k])return mk('r',k);
  return mk(corEsp(k),k);
}
function estadoItem(slot){
  const v=IMG[slot];
  if(!v)return '<div class="m-est">ainda sem desenho</div>';
  const av=v.avisos.filter(a=>a!=='fundo branco tirado');
  return `<div class="m-est ${av.length?'av':'ok'}">${av.length?'⚠️ '+esc(av.join('; ')):'✅ '+esc(v.nome)}</div>`;
}
function itemHTML(slot,miniatura,nome,arquivo){
  return `<div class="m-item" data-slot="${slot}">${miniatura}<div><div class="m-nome">${esc(nome)}</div><div class="m-arq">${esc(arquivo)}.png</div>${estadoItem(slot)}</div>
    <div class="m-acoes"><button class="m-btn m-mini" data-escolher="${slot}">Escolher</button>${IMG[slot]?`<button class="m-btn m-mini" data-tirar="${slot}">Tirar</button>`:''}</div></div>`;
}
function desenharPainel(){
  $('camadas').innerHTML=CAMADAS.map(c=>itemHTML(c.slot,`<div class="m-mini" style="${IMG[c.slot]?`background-image:url('${IMG[c.slot].url}')`:''}"></div>`,c.nome,c.arquivo)).join('');
  // um grupo por vez (Números, Ações…), lembrando quais estavam abertos
  const abertos=new Set([...document.querySelectorAll('#simbolos details[open]')].map(d=>d.dataset.grupo));
  const grupos=[...new Set(SIMBOLOS.map(s=>s.grupo))];
  $('simbolos').innerHTML=grupos.map(g=>{
    const l=SIMBOLOS.filter(s=>s.grupo===g),feitos=l.filter(s=>IMG['sim:'+s.k]).length;
    return `<details class="m-grupo" data-grupo="${esc(g)}"${abertos.has(g)?' open':''}><summary>${esc(g)} <span class="m-cont">(${feitos} de ${l.length})</span></summary>${l.map(s=>itemHTML('sim:'+s.k,cartaHTML(exemplo(s.k)),s.nome,s.arquivo)).join('')}</details>`;
  }).join('');
  $('contSimbolos').textContent=`(${SIMBOLOS.filter(s=>IMG['sim:'+s.k]).length} de ${SIMBOLOS.length} desenhados)`;
  // arquivos com nome desconhecido: escolher onde entram
  const opcoes=`<option value="">Onde entra?</option>${CAMADAS.map(c=>`<option value="${c.slot}">${esc(c.nome)}</option>`).join('')}${SIMBOLOS.map(s=>`<option value="sim:${s.k}">${esc(s.nome)}</option>`).join('')}`;
  $('soltos').innerHTML=SOLTOS.map((a,i)=>`<li><b>${esc(a.name)}</b><select data-solto="${i}">${opcoes}</select></li>`).join('');
  $('mistura').value=CONF.mistura||'multiply';
  $('raio').value=CONF.raio!=null?CONF.raio:0.14;
  $('filete').checked=CONF.filete!==false;
  CORES.forEach(([k])=>{const el=$('cor-'+k);if(el)el.value=valorCor(k)});
}
function valorCor(k){return (k==='borda'||k==='simbolo'?CONF[k]:(CONF.cores||{})[k])||PADRAO[k]}

/* ---------- galeria ---------- */
function filas(lista,ladoB){
  const cw=+$('tamanho').value,lado=$('lado').value;
  const fila=b=>`<div class="m-fila${b?' side-b':''}" style="--cw:${cw}px">${lista.map(([cor,t,v,pinta],i)=>cartaHTML(mk(cor,t,v),pinta,`data-i="${i}" tabindex="0" role="button" aria-label="${esc(cardName(mk(cor,t,v)))}"`)).join('')}</div>`;
  let h='';
  if(lado!=='b')h+=(lado==='ambos'?'<div class="m-lado">Lado normal</div>':'')+fila(false);
  if(lado!=='a'&&ladoB!==false)h+=(lado==='ambos'?'<div class="m-lado">Outro lado do Portal</div>':'')+fila(true);
  return h;
}
let LISTAS=[];
function desenharGaleria(){
  const grupo=$('grupo').value,todas=$('todasCores').checked,sec=[];
  const quer=g=>grupo==='tudo'||grupo===g;
  const cores=k=>todas?[...new Set(SP[k].deck||[])]:[corEsp(k)];
  if(quer('num'))sec.push(['Números',COLORS.flatMap(c=>[0,1,2,3,4,5,6,7,8,9].map(v=>[c,'num',v]))]);
  if(quer('acao'))sec.push(['Ações e coringas',[...COLORS.flatMap(c=>['skip','rev','d2'].map(t=>[c,t])),['w','wild'],['w','d4'],...COLORS.map(c=>['w','wild',null,c])]]);
  if(quer('esp'))sec.push(['Cartas especiais',Object.keys(SP).filter(k=>!WEATHER[k]).flatMap(k=>(cores(k).length?cores(k):['w']).map(c=>[c,k]))]);
  if(quer('clima'))sec.push(['Climas',Object.keys(WEATHER).flatMap(k=>cores(k).map(c=>[c,k]))]);
  LISTAS=sec.map(s=>s[1]);
  let h=sec.map(([t,l],i)=>`<section class="m-sec" data-sec="${i}"><h2>${t}</h2>${filas(l)}</section>`).join('');
  if(quer('verso')){
    const cw=+$('tamanho').value,lado=$('lado').value;
    const monte=b=>`<div class="m-fila m-monte${b?' side-b':''}" style="--cw:${cw}px"><div class="card back">${versoHTML()}</div>
      <div class="seat"><div class="nm">Adversário</div><div class="fan" style="--n:5">${[0,1,2,3,4].map(k=>`<i style="--k:${k}"></i>`).join('')}</div></div></div>`;
    h+=`<section class="m-sec"><h2>Verso</h2>${lado!=='b'?(lado==='ambos'?'<div class="m-lado">Lado normal</div>':'')+monte(false):''}${lado!=='a'?(lado==='ambos'?'<div class="m-lado">Outro lado do Portal</div>':'')+monte(true):''}</section>`;
  }
  $('galeria').innerHTML=h;
}
function desenhar(){desenharPainel();desenharGaleria()}
// uma carta em vários tamanhos, nos dois lados
function detalhe(spec){
  const [cor,t,v,pinta]=spec,c=mk(cor,t,v);
  $('detTitulo').textContent=cardName(c);
  const fila=b=>`<div class="m-det${b?' side-b':''}">${[44,60,104,200].map(w=>`<figure><div style="--cw:${w}px">${cartaHTML(c,pinta)}</div><figcaption>${w} px</figcaption></figure>`).join('')}</div>`;
  $('detCartas').innerHTML=fila(false)+fila(true);
  $('detalhe').hidden=false;
}

/* ---------- início ---------- */
async function iniciar(){
  const cs=getComputedStyle(document.documentElement);
  PADRAO={r:cs.getPropertyValue('--cr').trim(),y:cs.getPropertyValue('--cy').trim(),g:cs.getPropertyValue('--cg').trim(),b:cs.getPropertyValue('--cb').trim(),w:cs.getPropertyValue('--ck').trim(),borda:'#ffffff',simbolo:'#ffffff'};
  try{CONF=JSON.parse(localStorage.getItem('unotfm-mostruario'))||{}}catch(e){CONF={}}
  $('cores').innerHTML=CORES.map(([k,n])=>`<label>${n}<input type="color" id="cor-${k}" data-cor="${k}"></label>`).join('');
  try{
    for(const [slot,v] of await DB.tudo())colocar(slot,new Blob([v.buf],{type:v.tipo||'image/png'}),v.nome,v.avisos);
  }catch(e){aviso('Este navegador não guarda as imagens entre uma visita e outra.',4000)}
  aplicar();desenhar();

  $('btnEnviar').onclick=()=>{alvoUnico=null;$('arquivos').click()};
  $('arquivos').onchange=e=>{const l=[...e.target.files];e.target.value='';receberArquivos(l)};
  // escolher ou tirar a imagem de um item
  $('painel').addEventListener('click',e=>{
    const b=e.target.closest('[data-escolher]');if(b){alvoUnico=b.dataset.escolher;const inp=$('arquivos');inp.multiple=false;inp.click();setTimeout(()=>inp.multiple=true,0);return}
    const t=e.target.closest('[data-tirar]');if(t)tirar(t.dataset.tirar);
  });
  $('soltos').addEventListener('change',async e=>{
    const s=e.target.closest('[data-solto]');if(!s||!s.value)return;
    const [arq]=SOLTOS.splice(+s.dataset.solto,1);
    if(await usarArquivo(arq,s.value))aviso(`${arq.name}: ${nomeDoSlot(s.value)}`);
    aplicar();desenhar();
  });
  // baralho
  $('mistura').onchange=e=>{CONF.mistura=e.target.value;guardarConf();aplicar()};
  $('raio').oninput=e=>{CONF.raio=+e.target.value;guardarConf();aplicar()};
  $('filete').onchange=e=>{CONF.filete=e.target.checked;guardarConf();aplicar()};
  $('cores').addEventListener('input',e=>{
    const k=e.target.dataset.cor;if(!k)return;
    if(k==='borda'||k==='simbolo')CONF[k]=e.target.value;else{CONF.cores=CONF.cores||{};CONF.cores[k]=e.target.value}
    guardarConf();aplicar();
  });
  $('btnCoresJogo').onclick=()=>{delete CONF.cores;delete CONF.borda;delete CONF.simbolo;delete CONF.raio;delete CONF.filete;delete CONF.mistura;guardarConf();aplicar();desenharPainel();aviso('Cores e formas do jogo de volta.')};
  $('btnApagar').onclick=async()=>{
    if(!confirm('Apagar todas as imagens que você escolheu neste mostruário?'))return;
    Object.values(IMG).forEach(v=>URL.revokeObjectURL(v.url));Object.keys(IMG).forEach(k=>delete IMG[k]);SOLTOS.length=0;
    try{await DB.limpar()}catch(e){}
    aplicar();desenhar();aviso('Imagens apagadas.');
  };
  $('btnCopiarNomes').onclick=async()=>{
    let g='',t='Nomes dos arquivos (PNG):\n';
    t+='\nBaralho\n'+CAMADAS.map(c=>`${c.arquivo}.png  (${c.nome}: ${c.dica})`).join('\n')+'\n';
    SIMBOLOS.forEach(s=>{if(s.grupo!==g){g=s.grupo;t+=`\n${g}\n`}t+=`${s.arquivo}.png  (${s.nome})\n`});
    try{await navigator.clipboard.writeText(t);aviso('Lista copiada.')}catch(e){aviso('Não deu para copiar.')}
  };
  // galeria
  ['tamanho','lado','grupo','todasCores'].forEach(id=>$(id).addEventListener('change',desenharGaleria));
  $('galeria').addEventListener('click',e=>{
    const c=e.target.closest('.card[data-i]'),sec=e.target.closest('[data-sec]');if(!c||!sec)return;
    detalhe(LISTAS[+sec.dataset.sec][+c.dataset.i]);
  });
  $('galeria').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card[data-i]')){e.preventDefault();e.target.click()}});
  $('detFechar').onclick=()=>$('detalhe').hidden=true;
  $('detalhe').addEventListener('click',e=>{if(e.target===$('detalhe'))$('detalhe').hidden=true});
  $('btnAjuda').onclick=()=>$('ajuda').hidden=false;
  $('ajudaFechar').onclick=()=>$('ajuda').hidden=true;
  $('ajuda').addEventListener('click',e=>{if(e.target===$('ajuda'))$('ajuda').hidden=true});
  // arrastar arquivos (computador)
  let fora=null;
  addEventListener('dragover',e=>{e.preventDefault();$('zona').classList.add('arrastando');clearTimeout(fora);fora=setTimeout(()=>$('zona').classList.remove('arrastando'),200)});
  addEventListener('drop',e=>{e.preventDefault();$('zona').classList.remove('arrastando');alvoUnico=null;receberArquivos([...e.dataTransfer.files])});
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent/.test(location.host))navigator.serviceWorker.register('sw.js').catch(()=>{});
}
iniciar();
