/* unotfm: desenho das cartas. Os símbolos (seus desenhos, iguais em todos os baralhos) e o baralho (cores, fundo,
   moldura e verso, que podem mudar) ficam separados. Os símbolos são moldes de uma cor só (PNG com fundo transparente):
   o jogo usa só o formato do traço e pinta com a cor que o baralho mandar. Enquanto um símbolo não tiver desenho, a
   carta mostra o símbolo de hoje (texto ou emoji). Carregado depois do data.js (usa SP e WEATHER). */

/* ---------- símbolos ---------- */
// nome do arquivo de cada símbolo (sem .png): o nome da carta sem "Carta da", sem acentos e com hífens
function nomeArquivo(k){
  const fixo={skip:'bloqueio',rev:'inverter',d2:'mais2',d4:'mais4',d99:'mais99',wild:'coringa'};
  if(fixo[k])return fixo[k];
  if(/^\d$/.test(k))return k;
  return SP[k].n.replace(/^(Carta (da|do|de) |Carta |Clima: )/,'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
}
// os combos juntam dois símbolos (Inverter + Bloqueio etc.): não precisam de desenho próprio
const COMBO={mix1:['rev','skip'],mix2:['rev','d2'],mix3:['skip','d2']};
const RESERVA={skip:'⊘',rev:'⇄',d2:'+2',d4:'+4'};
// todos os símbolos que podem ter desenho, em grupos (a ordem aparece no mostruário)
const SIMBOLOS=[
  ...[0,1,2,3,4,5,6,7,8,9].map(v=>({k:String(v),grupo:'Números',nome:String(v)})),
  {k:'skip',grupo:'Ações',nome:'Bloqueio'},{k:'rev',grupo:'Ações',nome:'Inverter'},{k:'d2',grupo:'Ações',nome:'+2'},
  {k:'wild',grupo:'Ações',nome:'Coringa (pintado com as 4 cores)'},{k:'d4',grupo:'Ações',nome:'+4'},
  ...Object.keys(SP).filter(k=>!COMBO[k]).map(k=>({k,grupo:WEATHER[k]?'Climas':'Cartas especiais',nome:SP[k].n})),
].map(s=>({...s,arquivo:nomeArquivo(s.k)}));

// desenhos em uso: chave do símbolo → endereço da imagem; e as camadas do baralho
const ARTE={simbolos:{},baralho:{}};
const temArte=k=>!!ARTE.simbolos[k];
const moldeCss=u=>`--img:url('${u}')`;
// símbolo de uma carta: o seu desenho (pintado com a cor da carta) ou, enquanto não houver, o de hoje
function sim(k,reserva){const u=ARTE.simbolos[k];return u?`<i class="sim" style="${moldeCss(u)}"></i>`:reserva}

/* ---------- face e verso ---------- */
function faceHTML(c){
  const t=c.type;
  if(t==='num'){
    const k=String(c.value),s=sim(k,c.value),a=temArte(k)?' arte':'';
    return `<span class="cn">${s}</span><span class="face${a}">${s}</span><span class="cn br">${s}</span>`;
  }
  if(SP[t]){
    const parte=COMBO[t],a=parte?parte.some(temArte):temArte(t);
    const s=!a?SP[t].g:parte?`<span class="combo">${parte.map(p=>sim(p,RESERVA[p])).join('')}</span>`:sim(t,SP[t].g),sm=SP[t].small?' sm':'',ar=a?' arte':'';
    return `${WEATHER[t]?'<span class="wxf"></span>':''}<span class="cn${sm}">${s}</span><span class="face sym sp${sm}${ar}">${s}</span><span class="cn br${sm}">${s}</span>`;
  }
  if(RESERVA[t]&&t!=='d4'){
    const s=sim(t,RESERVA[t]),a=temArte(t)?' arte':'';
    return `<span class="cn">${s}</span><span class="face sym${a}">${s}</span><span class="cn br">${s}</span>`;
  }
  // coringa: o seu desenho vira um molde preenchido com as 4 cores do baralho
  const roda=cls=>temArte('wild')?`<${cls==='mw'?'i':'span'} class="${cls} arte" style="${moldeCss(ARTE.simbolos.wild)}"></${cls==='mw'?'i':'span'}>`:cls==='mw'?'<i class="mw"></i>':'<span class="wheel"></span>';
  if(t==='wild')return `<span class="cn">${roda('mw')}</span>${roda('wheel')}<span class="cn br">${roda('mw')}</span>`;
  // +4
  if(!temArte('wild')&&!temArte('d4'))return `<span class="cn">+4</span><span class="wheel"><span>+4</span></span><span class="cn br">+4</span>`;
  const s=sim('d4','+4'),centro=temArte('wild')?`<span class="d4c">${roda('wheel')}<span class="d4s${temArte('d4')?' arte':''}">${s}</span></span>`:`<span class="wheel"><span class="${temArte('d4')?'arte':''}">${s}</span></span>`;
  return `<span class="cn">${s}</span>${centro}<span class="cn br">${s}</span>`;
}
// verso: a marca do jogo no meio (o baralho pode trocar o verso inteiro por uma imagem)
const versoHTML=()=>'<span class="face">unotfm</span>';

/* ---------- baralho ----------
   As camadas do baralho viram variáveis do CSS (veja "cards" no style.css). As cores valem só no lado normal: o outro
   lado do Portal tem a própria paleta. Sem nada definido, o baralho é o de hoje. */
function aplicarArte(){
  const b=ARTE.baralho,raiz=[],cores=[];
  const camadas=[b.moldura&&`url('${b.moldura}')`,b.textura&&`url('${b.textura}')`].filter(Boolean);
  if(camadas.length){
    raiz.push(`--carta-camadas:${camadas.join(',')}`);
    raiz.push(`--carta-mistura:${[b.moldura&&'normal',b.textura&&(b.mistura||'multiply')].filter(Boolean).join(',')}`);
    // a moldura estica para caber na carta; a textura cobre a carta (cortando o que sobrar)
    raiz.push(`--carta-tamanhos:${[b.moldura&&'100% 100%',b.textura&&'cover'].filter(Boolean).join(',')}`);
  }
  if(b.verso)raiz.push(`--verso:url('${b.verso}') center/cover no-repeat,#3b2f6b`,`--verso-mini:url('${b.verso}') center/cover no-repeat,#3b2f6b`,'--verso-rotulo:0');
  if(b.borda)raiz.push(`--carta-borda:${b.borda}`);
  if(b.simbolo)raiz.push(`--sim-cor:${b.simbolo}`);
  if(b.raio!=null)raiz.push(`--carta-raio:${b.raio}`);
  if(b.filete===false)raiz.push('--carta-filete:transparent');
  const nomes={r:'--cr',y:'--cy',g:'--cg',b:'--cb',w:'--ck'};
  Object.entries(nomes).forEach(([c,v])=>{if(b.cores&&b.cores[c])cores.push(`${v}:${b.cores[c]}`)});
  let el=document.getElementById('arte-css');
  if(!el){el=document.createElement('style');el.id='arte-css';document.head.appendChild(el)}
  el.textContent=(raiz.length?`:root{${raiz.join(';')}}\n`:'')+(cores.length?`html:not(.side-b){${cores.join(';')}}`:'');
}
