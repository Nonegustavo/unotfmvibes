/* unotfm solo: dados do jogo (cores, regras, cartas especiais, maldições, climas, dificuldades, configuração salva) */
const $=id=>document.getElementById(id);
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
// computador com mouse: as janelas de informação abrem ao parar o cursor; pc(celular, computador) escolhe o texto
const HOVER=matchMedia('(hover:hover) and (pointer:fine)').matches;
const pc=(m,c)=>HOVER?c:m;
// jogo acelerado: quando você foi eliminado (só assiste) ou com a opção "Velocidade do jogo: Acelerada"
const fastMode=()=>!!(S&&S.spectate)||CFG.fast===true;
/* Turbo ("Terminar e descobrir vencedor"): todo setTimeout passa por aqui. Fora do turbo vai para o timer do navegador
   e fica registrado em TB.live; no turbo entra numa fila de tempo virtual (TB.q) que turboRun() (engine.js) roda
   sem esperar, na ordem em que os timers venceriam. Date.now() acompanha o tempo virtual */
const TB={on:false,now:0,seq:0,turns:0,q:new Map(),live:new Map()};
const nativeTimeout=setTimeout.bind(window),nativeClear=clearTimeout.bind(window),realNow=Date.now.bind(Date);
window.setTimeout=(fn,ms,...a)=>{
  const id=++TB.seq;ms=Math.max(0,+ms||0);
  if(TB.on)TB.q.set(id,{fn,a,due:TB.now+ms,id});
  else TB.live.set(id,{fn,a,due:realNow()+ms,h:nativeTimeout(()=>{TB.live.delete(id);fn(...a)},ms)});
  return id;
};
window.clearTimeout=id=>{const t=TB.live.get(id);if(t){nativeClear(t.h);TB.live.delete(id)}TB.q.delete(id)};
Date.now=()=>TB.on?TB.now:realNow();
/* Sorteios: rng() decide tudo o que muda a partida (baralho, quem começa, efeitos, escolhas e tempos dos adversários) e
   segue uma semente, então a mesma semente repete a mesma sequência. Math.random() fica só para o visual (inclinação
   das cartas, frases, dado girando, partículas), para que desenhar mais ou menos coisas não mude a partida.
   A semente é sorteada a cada partida; o teste pode fixá-la em window.SEMENTE (cada partida usa a seguinte) */
const RNG={semente:0,a:0,b:0,c:0,d:0};
function semear(semente){
  let x=semente>>>0;RNG.semente=x;
  const sm=()=>{x=(x+0x9e3779b9)|0;let z=x;z=Math.imul(z^(z>>>16),0x85ebca6b);z=Math.imul(z^(z>>>13),0xc2b2ae35);return (z^(z>>>16))>>>0};
  RNG.a=sm();RNG.b=sm();RNG.c=sm();RNG.d=sm();
  IDS.a=sm();IDS.usados=new Set();
  for(let i=0;i<12;i++)rng();
}
// sfc32: rápido, com 128 bits de estado
function rng(){
  let{a,b,c,d}=RNG;const t=(((a+b)|0)+d)|0;
  RNG.d=(d+1)|0;RNG.a=b^(b>>>9);RNG.b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);RNG.c=(c+t)|0;
  return (t>>>0)/4294967296;
}
/* Número de cada carta: sorteado (de 1 a 2^31) por um gerador próprio, que segue a semente mas não mexe no rng(), e
   sem repetir na partida. Assim o número não dá pista de qual carta é (antes era a ordem de montagem do baralho) */
const IDS={a:0,usados:new Set()};
function novoId(){
  let id;do{IDS.a=(IDS.a+0x6d2b79f5)|0;let t=Math.imul(IDS.a^(IDS.a>>>15),1|IDS.a);t=(t+Math.imul(t^(t>>>7),61|t))^t;id=((t^(t>>>14))>>>1)||1}while(IDS.usados.has(id));
  IDS.usados.add(id);return id;
}
const novaSemente=()=>Number.isInteger(window.SEMENTE)?(window.SEMENTE++)>>>0:(Math.random()*4294967296)>>>0;
semear((Math.random()*4294967296)>>>0);
const COLORS=['r','y','g','b'];
const CNAME={r:'Vermelho',y:'Amarelo',g:'Verde',b:'Azul',k:'Cinza'};
const CVAR={r:'var(--cr)',y:'var(--cy)',g:'var(--cg)',b:'var(--cb)',k:'var(--cgray)'};
function applyBg(){
  const sb=!!(S&&S.side==='b');
  document.documentElement.classList.toggle('side-b',sb);
  document.documentElement.classList.toggle('bgmerge',!!R.bg&&!sb);
  const def=(k,v)=>Object.defineProperty(CNAME,k,{configurable:true,enumerable:true,get:typeof v==='function'?v:()=>v});
  if(sb){def('r','Rosa');def('y','Laranja');def('g','Ciano');def('b','Roxo');return}
  def('r','Vermelho');def('y','Amarelo');
  if(R.bg){const q=()=>Math.random()<.5?'Azul?':'Verde?';def('b',q);def('g',q)}else{def('b','Azul');def('g','Verde')}
}
const TEAMCOL=['var(--accent)','#e08a2b','#2b9aa0'];
const BOTNAMES=['Snowy','Buffy','Elise','Jingle','Charlotte','Papaille','Drekkemaus','Icemice','Elisah'];
const AVCOL=['#d9534f','#2b8a9e','#8e5bd0','#d4892b','#3c9d5d','#c2477f','#4a6fd1','#7c8b2a','#b0563a'];

const RULES=[
  {g:'Baralho e mão',k:'noaction',n:'Sem Ação',d:'O baralho não tem as cartas +2, +4, reverter e bloqueios.'},
  {g:'Baralho e mão',k:'mess',n:'Bagunça',d:'O baralho tem só cartas de ação: as comuns e as especiais de todas as regras. '+pc('Toque e segure uma carta para ver o que ela faz.','Pare o cursor numa carta para ver o que ela faz.')},
  {g:'Baralho e mão',k:'revelation',n:'Revelação',d:'A carta no topo do baralho é visível para todos.'},
  {g:'Baralho e mão',k:'mulligan',n:'Segunda Chance',d:'No início do jogo, você pode trocar sua mão por uma nova.'},
  {g:'Baralho e mão',k:'camouflage',n:'Camuflagem',d:'Você não enxerga quantas cartas os adversários têm até que fiquem com 1 carta.'},
  {g:'Baralho e mão',k:'mini',n:'Mini',d:'Todos começam com 4 cartas (ignora a quantidade de cartas iniciais escolhida).'},
  {g:'Baralho e mão',k:'maxi',n:'Maxi',d:'Todos começam com 9 cartas (ignora a quantidade de cartas iniciais escolhida).'},
  {g:'Baralho e mão',k:'twohands',n:'Duas Mãos',d:'Você tem duas mãos de cartas para jogar. Termine uma primeiro para poder usar a outra e ganhar o jogo!'},
  {g:'Baralho e mão',k:'overload',n:'Sobrecarga',d:'Quem ficar com mais de 10 cartas na mão será eliminado.'},
  {g:'Baralho e mão',k:'dos',n:'Duas!',d:'Você precisa tocar a sineta quando tiver duas cartas na mão, e não quando tiver uma.'},
  {g:'Baralho e mão',k:'shiny',n:'Mão Colorida',d:'Se um jogador segurar todas as cores ou um curinga, este ícone aparecerá.'},
  {g:'Jogadas',k:'stack',n:'Empilhar',d:'Você pode jogar várias cartas do mesmo número de uma só vez.'},
  {g:'Jogadas',k:'sequence',n:'Sequência',d:'Você pode jogar várias cartas da mesma cor, desde que formem uma sequência numérica.'},
  {g:'Jogadas',k:'neighbor',n:'Vizinho',d:'Números iguais não combinam mais. Números só combinam com um número acima ou abaixo.'},
  {g:'Jogadas',k:'hell',n:'Inferno',d:'Cartas de ação podem ser jogadas em cima de outras cartas de ação de qualquer cor.'},
  {g:'Jogadas',k:'jumpin',n:'Corte',d:'Se você tiver uma carta idêntica à da mesa, pode jogá-la mesmo que não seja sua vez!'},
  {g:'Jogadas',k:'black',n:'Descolorir',d:'Se jogar uma carta idêntica à da mesa, ela fica cinza. Em cima dela, só vale uma carta com o mesmo número ou símbolo, ou um curinga.'},
  {g:'Jogadas',k:'perfection',n:'Perfeccionista',d:'Se jogar um número igual ao número de cartas na mão, jogue novamente.'},
  {g:'Jogadas',k:'clean',n:'Final Limpo',d:'Você só pode vencer se sua última carta for numérica.'},
  {g:'Compras',k:'nou',n:'Contra-ataque',d:'Você pode jogar cartas Inverter para devolver compras de carta.'},
  {g:'Compras',k:'satisfaction',n:'Compra Implacável',d:'Compre cartas até poder jogar uma.'},
  {g:'Compras',k:'insatisfaction',n:'Compra e Passa',d:'Comprar carta fará você passar a vez automaticamente.'},
  {g:'Compras',k:'fastdraw',n:'Compra Rápida',d:'Cartas compradas são jogadas imediatamente, mesmo que não combinem (exceto penalidades).'},
  {g:'Compras',k:'tracking',n:'Rastrear',d:'Ao comprar carta, você escolhe uma entre três cartas para comprar.'},
];
const C4=['r','b','y','g'],C8=[...C4,...C4];
const SP={
  trade:{n:'Carta da Troca',g:'🔀',d:'Ao jogar esta carta, escolha um adversário para trocar de cartas com ele.',deck:['r','b','y','g']},
  carousel:{n:'Carta do Carrossel',g:'🎠',d:'Ao jogar esta carta, todos passam suas cartas para o próximo jogador.',deck:['r','b','y','g']},
  gift:{n:'Carta da Doação',g:'❤️‍🔥',d:'Ao jogar esta carta, escolha um adversário para doar uma carta aleatória para ele.',deck:['r','b','y','g']},
  web:{n:'Carta da Teia',g:'🕸️',d:'Ao jogar esta carta, escolha um jogador para ficar 1 turno sem jogar.',deck:['r','b','y','g']},
  rain:{n:'Carta da Chuva',g:'💧',d:'Ao jogar esta carta, seus adversários compram 1 carta.',deck:['r','b']},
  thunder:{n:'Carta do Trovão',g:'⚡',d:'Ao jogar esta carta, dois jogadores aleatórios compram de 1 a 5 cartas.',deck:['g','y']},
  equality:{n:'Carta da Igualdade',g:'⚖️',d:'Ao jogar esta carta, todos compram ou descartam até terem 3 cartas.',deck:['r','b','y','g']},
  justice:{n:'Carta da Misericórdia',g:'🙏',d:'Ao jogar esta carta, descarte 1 carta por cada jogador com menos cartas que você.',deck:['r','b','y','g']},
  magnet:{n:'Carta do Imã',g:'🧲',d:'Ao jogar esta carta, descarte todas as cartas da mesma cor que esta.',deck:['r','b','y','g','r','b','y','g']},
  tornado:{n:'Carta do Tornado',g:'🌪️',d:'Ao jogar esta carta, embaralhe as cartas dos outros jogadores.',deck:['r','b','y','g','r','b','y','g']},
  steal:{n:'Carta da Mágica',g:'🎩',d:'Ao jogar, faça uma carta de cada adversário se transformar em carta numérica.',deck:['r','b','y','g']},
  wish:{n:'Carta do Desejo',g:'🪄',d:'Ao jogar esta carta, troque uma carta aleatória da sua mão por uma da pilha de descartes.',deck:['r','b','y','g']},
  peace:{n:'Carta da Paz',g:'🌼',d:'Ao jogar esta carta, cartas de ação não terão efeito por alguns turnos.',deck:['r','b','y','g']},
  luck:{n:'Carta da Sorte',g:'🍀',d:'Ao jogar esta carta, a sua próxima carta comprada será uma carta jogável naquele turno.',deck:['r','b','y','g','r','b','y','g']},
  random:{n:'Carta Misteriosa',g:'❓',d:'Esta carta ativa um efeito aleatório quando jogada.',deck:['w','w','w','w']},
  clone:{n:'Carta da Clonagem',g:'🧬',d:'Esta carta ativa o mesmo efeito da carta anterior.',deck:['w','w','w','w']},
  bomb:{n:'Carta Bomba',g:'💣',d:'Se comprar esta carta, você perde.',deck:[]},
  batata:{n:'Carta da Batata',g:'🥔',d:'Ao jogar esta carta, coloque-a na mão de um jogador. Quem ficar com esta carta na mão por 5 turnos perde.',deck:['r']},
  curse:{n:'Carta da Maldição',g:'😈',d:'Ao jogar esta carta, aplique uma maldição aleatória que dura alguns turnos.',deck:C4},
  dice:{n:'Carta do Dado',g:'🎲',d:'Ao jogar esta carta, force o próximo jogador a rolar o dado, sofrer uma consequência e perder a vez.',deck:C4},
  oddeven:{n:'Carta do Semáforo',g:'🚦',d:'Ao jogar esta carta, será proibido vencer com cartas pares ou ímpares (escolhido aleatoriamente). Ao jogar isso de novo, mude.',deck:C8},
  half:{n:'Carta do Rei',g:'👑',d:'Compre apenas metade das cartas enquanto segurar esta carta na mão. Ao jogar, escolha a cor.',deck:['w']},
  death:{n:'Carta da Morte Súbita',g:'☠️',d:'Após jogar esta carta, quem não puder jogar cartas ou cometer um erro será eliminado. Erros: ser pego sem tocar a sineta, ter o blefe de um +4 desafiado ou desafiar um +4 quando a jogada era legal.',deck:['r','b']},
  share:{n:'Carta da Partilha',g:'🤲',d:'Ao jogar esta carta, dê cópias das suas cartas aleatoriamente aos outros jogadores (máximo 10 cartas).',deck:['g','y']},
  simon:{n:'Carta da Memória',g:'🧠',d:'Ao jogar esta carta, repita as cores escolhidas por outras cartas desta. Se errar, compre 1 carta. Se acertar, escolha a próxima cor.',deck:['w','w','w','w','w','w','w','w']},
  chair:{n:'Carta da Dança das Cadeiras',g:'🪑',d:'Ao jogar esta carta, seus adversários trocam de posições aleatoriamente. Se um adversário jogar, ele também muda de lugar e a vez segue a partir do lugar novo dele.',deck:C8},
  view:{n:'Carta da Clarividência',g:'👁️',d:'Ao jogar esta carta, todos mostram uma de suas cartas.',deck:C8},
  treasure:{n:'Carta da Busca',g:'🧭',d:'Ao jogar esta carta 3 vezes, receba a Carta do Tesouro, que faz você vencer o jogo.',deck:C8},
  chest:{n:'Carta do Tesouro',g:'💰',hide:1,rule:'treasure',deck:[]},
  lock:{n:'Carta da Tranca',g:'🔒',d:'Ao jogar esta carta, bloqueie duas cartas na mão de cada outro jogador por 1 turno.',deck:C4},
  theft:{n:'Carta do Roubo',g:'🧤',d:'Ao jogar esta carta, force um jogador a dar uma carta curinga para você (se ele tiver uma).',deck:C8},
  ban:{n:'Carta do Banimento',g:'✖️',d:'Ao jogar esta carta, escolha uma entre 3 cartas da sua mão. Tire do jogo TODAS as cartas com o mesmo símbolo da carta escolhida.',deck:C4},
  box:{n:'Carta do Presente',g:'📦',d:'Ao jogar esta carta, todos ganham uma Carta Misteriosa, que ativa um efeito aleatório.',deck:['r','b']},
  confuse:{n:'Carta da Confusão',g:'🍄',d:'Ao jogar esta carta, você jogará uma carta aleatória na próxima vez (mesmo que não combine).',deck:C4},
  ink:{n:'Carta da Tinta',g:'🖌️',d:'Ao jogar esta carta, pinte todas as cartas do próximo jogador com a cor desta carta.',deck:C4},
  mix1:{n:'Combo Inverter + Bloqueio',g:'⇄⊘',small:1,hide:1,rule:'mix',deck:C4},
  mix2:{n:'Combo Inverter + +2',g:'⇄+2',small:1,hide:1,rule:'mix',deck:C4},
  mix3:{n:'Combo Bloqueio + +2',g:'⊘+2',small:1,hide:1,rule:'mix',deck:C4},
  d99:{n:'Curinga +99',g:'+99',small:1,rule:'plus99',d:'Ao jogar esta carta, o próximo jogador morre de tanto comprar cartas. Esta carta pode ser desafiada.',deck:['w']},
  sun:{n:'Clima: Ensolarado',g:'☀️',hide:1,rule:'weather',deck:C4},
  fog:{n:'Clima: Neblina',g:'☁️',hide:1,rule:'weather',deck:C4},
  storm:{n:'Clima: Tempestade',g:'⛈️',hide:1,rule:'weather',deck:C4},
  blizzard:{n:'Clima: Nevasca',g:'❄️',hide:1,rule:'weather',deck:C4},
  portal:{n:'Carta do Portal',g:'🌀',d:'Duas partidas estão acontecendo ao mesmo tempo. Jogue esta carta para alternar entre elas.',deck:C8},
  rule:{n:'Carta da Regra',g:'📜',d:'Ao jogar esta carta, adicione uma nova regra à partida atual.',deck:C4},
};
Object.entries(SP).forEach(([k,v])=>{if(!v.hide)RULES.push({g:'Cartas especiais',k:v.rule||k,n:v.n,d:v.d})});
RULES.push({g:'Cartas especiais',k:'weather',n:'Cartas de Clima',d:'Cada carta de clima tem um efeito global que perdura até que outra carta de clima seja jogada.'});
RULES.push({g:'Cartas especiais',k:'mix',n:'Cartas Combo',d:'Estas cartas ativam os dois efeitos correspondentes aos símbolos delas (Inverter+Bloqueio, Inverter+2, Bloqueio+2).'});
RULES.splice(RULES.findIndex(r=>r.k==='hell'),0,{g:'Jogadas',k:'bg',n:'Azul e Verde',d:'Cartas azuis e verdes serão tratadas como se fossem da mesma cor.'});
RULES.splice(RULES.findIndex(r=>r.k==='satisfaction'),0,{g:'Compras',k:'nochallenge',n:'Sem Desafiar',d:'Os +4 não podem mais ser desafiados. (Sem esta regra, quem recebe um +4 pode desafiar o último jogado: se foi blefe, quem jogou compra as cartas dessa carta e o desafiante compra o restante acumulado; se não foi, o desafiante compra tudo e mais 2.)'});
RULES.push(
  {g:'Partida',k:'poker',n:'Mix de Regras',d:'No início do jogo, cada jogador escolhe uma regra para colocar na partida.'},
  {g:'Partida',k:'team',n:'Jogo em Duplas',d:'Cada jogador tem uma dupla (quem senta à frente). Se um vencer, a equipe toda vence.'},
  {g:'Partida',k:'tournament',n:'Torneio',d:'Várias partidas ocorrerão. Quando um jogador atingir 500 pontos, ele será o vencedor. Quem vence a rodada ganha os pontos das cartas que sobraram na mão dos outros.'},
  {g:'Partida',k:'survivor',n:'Torneio de Sobrevivência',d:'Várias partidas ocorrerão. Quando um jogador atingir 300 pontos, ele será eliminado do torneio. Vence quem sobrar. Cada um soma os pontos das cartas que sobraram na própria mão.'},
);
const WEATHER={
  sun:{g:'☀️',n:'Ensolarado',t:'Pode jogar fora da cor, mas compra 1',c:'#e8a317'},
  fog:{g:'☁️',n:'Neblina',t:'Cartas dos adversários ocultas, sem sineta',c:'#8a86a0'},
  storm:{g:'⛈️',n:'Tempestade',t:'Quando um jogador mudar de cor, um adversário aleatório compra 1 carta',c:'#4b4f8f'},
  blizzard:{g:'❄️',n:'Nevasca',t:'Ninguém compra. Acaba se todos passarem a vez.',c:'#5aa9d6'},
};
const CURSES={
  anvil:{nm:'Bigorna',g:'⚒️',t:'Quem comprar cartas comprará 1 carta a mais',n:4},
  ice:{nm:'Gelo',g:'🧊',t:'Ninguém pode comprar cartas',n:3},
  shoe:{nm:'Bota',g:'👢',t:'Quem jogar carta de ação compra 1 carta',n:3},
  thorn:{nm:'Espinho',g:'🌵',t:'Quem comprar cartas será eliminado',n:1},
  poison:{nm:'Veneno',g:'🧪',t:'Todos ficam confusos',n:1},
};
// Regras de defesa: valem no lugar da defesa contra compras da configuração (R.combo). Só saem no Mix de Regras e na
// Carta da Regra, nunca a que repete a configuração, e não aparecem na lista do Personalizado
const DEF_RULES={dfnormal:'normal',dfrise:'rise',dfsuper:'super',dfnone:'none'};
RULES.push(
  {g:'Compras',k:'dfnormal',n:'Defesa - Combinar',d:'Substitui a defesa contra compras da partida: você pode se defender de um +2 jogando outro +2, e de um +4 jogando outro +4. As compras se acumulam para o próximo jogador.'},
  {g:'Compras',k:'dfrise',n:'Defesa - Crescente',d:'Substitui a defesa contra compras da partida: você pode se defender com outra carta de compra de mesmo valor ou maior (+2 em +2, +4 em +2 ou em +4). As compras se acumulam para o próximo jogador.'},
  {g:'Compras',k:'dfsuper',n:'Defesa - Qualquer',d:'Substitui a defesa contra compras da partida: você pode se defender de qualquer carta de compra com qualquer carta com +. As compras se acumulam para o próximo jogador.'},
  {g:'Compras',k:'dfnone',n:'Defesa - Desativada',d:'Substitui a defesa contra compras da partida: não é possível se defender. Quem recebe um +2 ou +4 compra na hora e perde a vez.'},
);
// defesa em vigor: a da regra de defesa ativa ou, sem ela, a da configuração
function comboMode(){for(const k in DEF_RULES)if(R[k])return DEF_RULES[k];return R.combo}
const RULE_POOL=['stack','sequence','neighbor','hell','jumpin','perfection','clean','nou','satisfaction','insatisfaction','fastdraw','tracking','dos','shiny','black','revelation','camouflage','bg','overload'];
const CONFLICT_PAIRS=[['mini','maxi'],['tournament','survivor'],['stack','sequence'],['stack','neighbor'],['stack','mess'],['stack','perfection'],['sequence','mess'],['sequence','perfection'],['perfection','mess'],['mess','noaction'],['mess','clean'],['revelation','tracking'],['tracking','satisfaction'],['satisfaction','insatisfaction'],['insatisfaction','fastdraw'],['satisfaction','fastdraw']];
Object.keys(DEF_RULES).forEach((a,i,l)=>l.slice(i+1).forEach(b=>CONFLICT_PAIRS.push([a,b])));
CONFLICT_PAIRS.push(['nou','dfnone']); // Contra-ataque não combina com a defesa desativada (também a da configuração, veja NOU_OFF)
RULES.filter(r=>r.g==='Cartas especiais').forEach(r=>CONFLICT_PAIRS.push(['mess',r.k],['noaction',r.k]));
const CONFLICT={};CONFLICT_PAIRS.forEach(([a,b])=>{(CONFLICT[a]=CONFLICT[a]||[]).push(b);(CONFLICT[b]=CONFLICT[b]||[]).push(a)});
const RNAME=Object.fromEntries(RULES.map(r=>[r.k,r.n]));
const MODE_DESC={classic:'Jogo tradicional, sem nenhuma regra especial.',mix:'Antes de distribuir as cartas, cada jogador escolhe uma regra para colocar na partida.',custom:'Você escolhe todas as regras da partida na lista abaixo.'};
const TIPS=[
  pc('Toque','Clique')+' nas cartas jogadas para ver o histórico de jogadas.',
  pc('Toque em','Pare o cursor sobre')+' um ícone de regra acima dos adversários para ver o que ela faz.',
  'Toque a sineta 🛎️ quando for jogar sua penúltima carta. Se não tocar e um adversário perceber, você compra 2 cartas.',
  'Um adversário esqueceu de tocar a sineta? '+pc('Toque','Clique')+' em "Pegar!" para forçá-lo a comprar 2 cartas.',
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
const DIFF={
  easy:{call:.65,catchP:.45,catchMs:2600,jump:.2},
  normal:{call:.88,catchP:.8,catchMs:1700,jump:.45},
  hard:{call:1,catchP:1,catchMs:1000,jump:.8},
  master:{call:1,catchP:1,catchMs:1300,jump:.85},
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
function rulesForMode(){const r={...CFG};if(CFG.mode!=='custom'){RULES.forEach(x=>r[x.k]=false);if(CFG.mode==='mix')r.poker=true;r.bots=3;r.start=7}return r}
let R=rulesForMode();
let SCORE=load('unotfm-solo-score',{});
let S=null,TOUR=null,stormT=null;
// quem está no jogo com menos pontos na mão (empate: menos cartas)
function pointsLeader(){
  const pts=i=>S.players[i].hand.reduce((a,c)=>a+cardPoints(c),0);
  return alive().reduce((a,b)=>pts(b)<pts(a)||(pts(b)===pts(a)&&S.players[b].hand.length<S.players[a].hand.length)?b:a);
}
const target=()=>R.dos?2:1;
const partner=i=>R.team?(i+S.players.length/2)%S.players.length:-1;
const teamOf=i=>i%(S.players.length/2);

const rand=a=>a[Math.floor(rng()*a.length)];
// sorteio só visual (frases, dicas): não mexe na sequência do rng()
const randVis=a=>a[Math.floor(Math.random()*a.length)];
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const mk=(color,type,value=null)=>({id:novoId(),color,type,value});
// Carta especial em jogo: pela regra dela ou pela Bagunça (que tem todas, menos o Semáforo, já que não há números)
const spOn=t=>R.mess?t!=='oddeven':!!R[SP[t].rule||t];
function buildDeck(){
  const d=[];
  for(const c of COLORS){
    if(!R.mess){d.push(mk(c,'num',0));for(let v=1;v<=9;v++)d.push(mk(c,'num',v),mk(c,'num',v))}
    if(!R.noaction)for(const t of['skip','rev','d2'])d.push(mk(c,t),mk(c,t));
  }
  for(let i=0;i<4;i++){d.push(mk('w','wild'));if(!R.noaction)d.push(mk('w','d4'))}
  if(!R.noaction)Object.entries(SP).forEach(([t,v])=>{if(spOn(t))v.deck.forEach(c=>d.push(mk(c,t)))});
  return shuffle(d);
}
const isDraw=c=>c.type==='d2'||c.type==='d4'||c.type==='d99';
const drawVal=c=>c.type==='d2'?2:c.type==='d4'?4:99;
const curseIs=k=>!!(S&&S.curse&&S.curse.k===k);
const sameCol=(a,b)=>a===b||(R.bg&&((a==='b'&&b==='g')||(a==='g'&&b==='b')));
// Mão Colorida: segura todas as cores ou um curinga
const colorful=p=>p.hand.some(c=>c.color==='w')||COLORS.every(col=>p.hand.some(c=>c.color===col));
const holds=(pi,t)=>S.players[pi].hand.some(c=>c.type===t);
// chamada só quando a compra vai acontecer: com a Carta do Rei, uma compra de mais de 1 carta cai pela metade e avisa na mesa
function drawAmt(pi,n){let k=n;if(holds(pi,'half')){k=Math.ceil(k/2);if(n>1&&k<n)emit({t:'rei'})}if(curseIs('anvil'))k+=1;return k}
const confused=pi=>!!(S.players[pi].confuse||curseIs('poison'));
const noDraw=pi=>S.death||curseIs('thorn');
function nextHand(pi){
  const p=S.players[pi];if(!p.hand2||!p.hand2.length)return false;
  p.hand=p.hand2;p.hand2=[];p.called=false;
  emit({t:'recebe',p:pi,ids:p.hand.map(c=>c.id),de:'monte',maoNova:true});
  emit({t:'fx',g:'✋',txt:`${V(pi,'Você pega',J(pi)+' pega')} a segunda mão`,cor:'var(--accent)',modo:'slam'});log(`${J(pi)} terminou a primeira mão.`);
  return true;
}
const topCard=()=>S.discard[S.discard.length-1];
const cur=()=>S.players[S.turn];
const N=()=>S.players.length;
const alive=()=>S.players.map((p,i)=>i).filter(i=>!S.players[i].out);
const nextIdx=(from,steps)=>{let i=from;for(let k=0;k<steps;k++){do{i=(i+S.dir+N())%N()}while(S.players[i].out)}return i};
const label=c=>SP[c.type]?SP[c.type].n:c.type==='num'?String(c.value):c.type==='skip'?'Bloqueio':c.type==='rev'?'Inverter':c.type==='d2'?'+2':c.type==='wild'?'Coringa':'+4';
const isWildPick=c=>c.type==='wild'||c.type==='d4'||c.type==='d99'||c.type==='half';
const cardName=c=>c.color==='w'?label(c):SP[c.type]?`${label(c)} (${CNAME[c.color].toLowerCase()})`:`${label(c)} ${CNAME[c.color]}`;
const cardPoints=c=>c.type==='num'?c.value:(c.color==='w'?50:20);
const identical=(a,b)=>a.color!=='w'&&a.color===b.color&&a.type===b.type&&a.value===b.value;
const who=pi=>pi===0?'Você':S.players[pi].name;
/* Textos das regras sem "você": as regras não sabem quem está olhando. J(pi) marca o nome de um jogador (vira "Você"
   para ele mesmo) e V(pi,'para ele','para os outros') escolhe a frase conforme quem vê. As marcas guardam o nome do
   jogador (que não muda com a Dança das Cadeiras) e a tela troca tudo com texto(s) na hora de mostrar */
const J=pi=>`${S.players[pi].name}`;
const V=(pi,meu,dos)=>`${S.players[pi].name}${meu}${dos}`;
// texto para quem vê (eu: nome do jogador desta tela; no solo, a cadeira 0)
function texto(s,eu=S&&S.players[0].name){
  if(typeof s!=='string'||!/[]/.test(s))return s;
  return s.replace(/([^]*)([^]*)([^]*)/g,(x,n,meu,dos)=>n===eu?meu:dos)
    .replace(/([^]*)/g,(x,n)=>n===eu?'Você':n);
}

// registro da partida: a tela guarda as linhas (evento 'registro')
function log(msg){emit({t:'registro',txt:msg})}
const snap=c=>({type:c.type,color:c.color,value:c.value,chosen:c.chosen,orig:c.orig});
function toast(msg,bg){
  if(S&&S.turbo)return;
  const t=$('toast');t.textContent=msg;t.style.background=bg||'';t.style.color=bg?'#fff':'';
  t.classList.remove('show');void t.offsetWidth;t.classList.add('show');
}

const ARROWS='<svg viewBox="0 0 200 200"><g fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M100 22A78 78 0 0 1 168 139" marker-end="url(#ah2)"/><path d="M100 178A78 78 0 0 1 32 61" marker-end="url(#ah2)"/></g><defs><marker id="ah2" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="2.4" markerHeight="2.4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs></svg>';
function hold(ms){S.fxUntil=Math.max(S.fxUntil||0,Date.now()+ms)}
