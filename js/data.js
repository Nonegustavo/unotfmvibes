/* unotfm solo: o que é da página nos dados (elementos, movimento reduzido, configuração salva, textos do menu, dicas).
   Os dados das regras ficam em js/mesa/dados.js */
const $=id=>document.getElementById(id);
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
// opções da mesa que vêm da página: movimento reduzido e a velocidade escolhida nas configurações
OPCOES.semAnimacao=RM;Object.defineProperty(OPCOES,'acelerada',{get:()=>CFG.fast===true});
// cores do lado do Portal e da regra Azul e Verde na página (os nomes das cores ficam com a mesa: nomesCor)
function applyBg(){
  const sb=!!(S&&S.side==='b');
  document.documentElement.classList.toggle('side-b',sb);
  document.documentElement.classList.toggle('bgmerge',!!R.bg&&!sb);
  nomesCor();
}
const MODE_DESC={classic:'Jogo tradicional, sem nenhuma regra especial.',mix:'Antes de distribuir as cartas, cada jogador escolhe uma regra para colocar na partida.',custom:'Você escolhe todas as regras da partida na lista abaixo.'};
const TIPS=[
  pc('Toque','Clique')+' nas cartas jogadas para ver o histórico de jogadas.',
  pc('Toque em','Pare o cursor sobre')+' um ícone de regra acima dos adversários para ver o que ela faz.',
  'Toque o sino 🛎️ quando for jogar sua penúltima carta. Se não tocar e um adversário perceber, você compra 2 cartas.',
  'Um adversário esqueceu de tocar o sino? '+pc('Toque','Clique')+' em "Pegar!" para forçá-lo a comprar 2 cartas.',
  'Blefar com +4 é arriscado: se jogar um +4 mesmo tendo outra carta da cor para jogar e for desafiado, você é que comprará as cartas.',
  'Recebeu um +4 suspeito? Desafie! Se foi blefe, quem jogou é que comprará as cartas. Mas se não foi, você compra 2 cartas a mais.',
  'O ranking do fim da partida é por pontos: guarde números baixos e livre-se dos curingas (50) e ações (20) quando alguém estiver perto de vencer.',
  'Selos nos topos das cartas indicam por que elas podem ser jogadas ou não e algumas outras informações especiais.',
  'A moldura brilhante nas cadeiras mostra de quem é a vez. Quando ela sai pela ponta, é sua vez. As setas no topo e embaixo da mesa mostram o sentido do jogo.',
  'Na Paz, cartas de ação não fazem efeito e curingas não trocam a cor. Às vezes vale guardar suas ações para depois.',
  'Durante o clima Nevasca, ninguém compra cartas. Caso todos passem a vez, a nevasca acaba.',
  'Com a regra Azul e Verde, as cartas azuis e verdes são da mesma cor. Azul?! Verde?! Já nem sei que cores são essas.',
  'O ícone 🍀 na cadeira de um adversário mostra que ele guardou uma Carta da Sorte: a próxima compra dele vai ser jogável.',
  'Os efeitos 3D podem ser desligados aqui se '+pc('o seu celular','o jogo')+' ficar lento.',
  'Dizem que existe um nível acima do Difícil…',
  'Só tem um 0 de cada cor no baralho. Os outros números têm dois de cada cor.',
  pc('Toque nos adversários para entender as condições dos ícones deles.','Pare o cursor sobre os ícones dos adversários para entender as condições deles.'),
  pc('Toque nos','Pare o cursor sobre os')+' ícones da mesa para ver mais detalhes do que está acontecendo durante a partida.',
  pc('Toque e segure uma carta sua','Pare o cursor sobre uma carta sua')+' para ver o que ela faz.',
];
const COMBO_DESC={rise:'Crescente: você pode se defender com outra carta de compra de mesmo valor ou maior: +2 em +2, +4 em +2 ou em +4. As compras se acumulam para o próximo jogador.',normal:'Combinar: você pode se defender de um +2 jogando outro +2, e de um +4 jogando outro +4. As compras se acumulam para o próximo jogador.',super:'Qualquer: você pode se defender de qualquer carta de compra com qualquer carta com +. As compras se acumulam para o próximo jogador.',none:'Desativado: não é possível se defender. Quem recebe um +2 ou +4 compra na hora e perde a vez.'};
const SEGS={
  sound:[[true,'Ligado'],[false,'Desligado']],
  mode:[['classic','Clássico'],['mix','Mix de Regras'],['custom','Personalizado']],
  fx3d:[[true,'Ligados'],[false,'Desligados']],
  vibrate:[[true,'Ligada'],[false,'Desligada']],
  fast:[[false,'Normal'],[true,'Acelerada']],
  compact:[[false,'Livre'],[true,'Compacta']],
  ruleInfo:[[true,'Ligado'],[false,'Desligado']],
  bots:[[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']],
  diff:[['easy','Fácil'],['normal','Normal'],['hard','Difícil'],['master','Mestre']],
  start:[3,4,5,6,7,8,9,10].map(n=>[n,String(n)]),
  combo:[['normal','Combinar'],['rise','Crescente'],['super','Qualquer'],['none','Desativado']],
};
const load=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const DEF={bots:3,diff:'normal',start:7,combo:'normal'};RULES.forEach(r=>DEF[r.k]=false);DEF.poker=true;DEF.vibrate=true;DEF.ruleInfo=true;DEF.fast=false;DEF.compact=true;DEF.fx3d=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let CFG=Object.assign({},DEF,load('unotfm-solo-cfg',{}));
// configuração salva com duas regras incompatíveis (conflito novo): mantém só a primeira
CONFLICT_PAIRS.forEach(([a,b])=>{if(CFG[a]&&CFG[b])CFG[b]=false});
let MESTRE=load('unotfm-solo-master',false);if(CFG.diff==='master'&&!MESTRE)CFG.diff='hard';
let hardClicks={n:0,t:0};
// regras que não existem mais, guardadas em configurações antigas
['flash','time','limbo','addrules','hard','limitless','drekkemaus','jingle','papaille','charlotte','elisah','buffy','snowy','icemice','elise','red','blue','yellow','green'].forEach(k=>{delete CFG[k]});
RULES.forEach(r=>{if(CFG[r.k]&&(CONFLICT[r.k]||[]).some(x=>CFG[x]&&RULES.findIndex(q=>q.k===x)<RULES.findIndex(q=>q.k===r.k)))CFG[r.k]=false});
const NOU_OFF='Incompatível com a defesa contra compras desativada';if(CFG.combo==='none')CFG.nou=false;
if(!CFG.mode)CFG.mode=RULES.some(r=>r.k!=='poker'&&CFG[r.k])?'custom':'mix';
const rulesForMode=()=>regrasDe(CFG);
R=rulesForMode();
let SCORE=load('unotfm-solo-score',{});
let stormT=null;
// sorteio só visual (frases, dicas): não mexe na sequência do rng()
const randVis=a=>a[Math.floor(Math.random()*a.length)];
const who=pi=>pi===0?'Você':S.players[pi].name;
function toast(msg,bg){
  if(S&&S.turbo)return;
  const t=$('toast');t.textContent=msg;t.style.background=bg||'';t.style.color=bg?'#fff':'';
  t.classList.remove('show');void t.offsetWidth;t.classList.add('show');
}
