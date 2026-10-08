/* unotfm, mesa: efeitos das cartas especiais (applySpecial), desafio, Carta da Regra, troca/carrossel e corte.
   Os desenhos e as janelas dessas cartas ficam em js/cards.js. Não usa nada da página */
function discardCard(i,c,k=0){
  const p=S.players[i];p.hand=p.hand.filter(x=>x!==c);
  S.discard.splice(S.discard.length-1,0,c);
  emit({t:'voa',de:i,para:'mesa',atraso:k*70});
}
function massCheck(){for(const i of alive())if(overloaded(i)&&markOut(i))return 'win';return 'done'}
function selfCheck(pi){
  const p=S.players[pi];
  if(p.hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}
  if(p.hand.length===target()&&!p.called)afterOneCard(pi);
  return 'done';
}
const opponents=pi=>alive().filter(i=>i!==pi&&i!==partner(pi));
// alvo da Teia e da Batata: o adversário com menos cartas que ele enxerga (o Fácil escolhe ao acaso).
// Na Teia, o Mestre pula quem ele anotou que não tem a cor da mesa (esse já não jogaria mesmo)
function botTarget(pi,skipLack){
  const o=opponents(pi);if(!o.length)return -1;
  if(R.diff==='easy')return rand(o);
  const byLen=shuffle([...o]).sort((a,b)=>seenLen(pi,a)-seenLen(pi,b));
  if(skipLack&&R.diff==='master'){const f=byLen.find(i=>!lacksCol(i,S.color));if(f!=null)return f}
  return byLen[0];
}
function giftCard(pi,t){
  const p=S.players[pi];if(!p.hand.length||t==null||t<0)return 'done';
  const c=rand(p.hand);p.hand=p.hand.filter(x=>x!==c);
  S.players[t].hand.push(c);S.players[t].called=false;
  emit({t:'recebe',p:t,ids:[c.id],de:pi});
  emit({t:'fx',g:'❤️‍🔥',txt:`${J(pi)} doou uma carta para ${V(t,'você',J(t))}`,cor:'var(--cg)',modo:'stamp'});
  log(`${J(pi)} doou uma carta para ${V(t,'você',J(t))}.`);
  if(massCheck()==='win')return 'win';
  return selfCheck(pi);
}
function webOn(pi,t){
  if(t==null||t<0)return;
  S.players[t].webbed=true;emit({t:'selo',p:t,ic:'🕸️',cor:'var(--muted)'});
  emit({t:'fx',g:'🕸️',txt:V(t,'Você perde a próxima vez',`${J(t)} perde a próxima vez`),cor:'var(--muted)',modo:'stamp'});
  log(`${J(pi)} prendeu ${V(t,'você',J(t))} na teia.`);
}
function wishOptions(){return shuffle(S.discard.slice(0,-1)).slice(0,3)}
function wishSwap(pi,c){
  const p=S.players[pi];if(!p.hand.length||!c)return;
  const out=rand(p.hand);
  S.discard=S.discard.filter(x=>x!==c);
  p.hand=p.hand.filter(x=>x!==out);S.discard.splice(S.discard.length-1,0,out);
  if(c.color==='w')c.chosen=null;
  p.hand.push(c);emit({t:'recebe',p:pi,ids:[c.id],de:'mesa',voaProprio:true});
  emit({t:'fx',g:SP.wish.g,txt:`${J(pi)} pegou ${cardName(c)} da pilha`,cor:'var(--cy)',modo:'stamp'});
  log(`${J(pi)} trocou uma carta com a pilha.`);
}
function giveBatata(pi,card,t){
  if(t!=null&&t>=0)agendar(()=>emit({t:'3d',k:'steam',onde:t}),250);
  if(t==null||t<0)return;
  S.discard=S.discard.filter(x=>x!==card);S.color=S.colBefore||S.color;emit({t:'redesenhaMesa'});
  if(card.baseColor==null)card.baseColor=card.color;card.color=rand(COLORS);card.chosen=null;
  S.players[t].hand.push(card);S.players[t].batata=0;S.players[t].called=false;
  emit({t:'recebe',p:t,ids:[card.id],de:'mesa'});
  emit({t:'selo',p:t,ic:'🥔',cor:'var(--cy)'});emit({t:'fx',g:'🥔',txt:`A batata foi para ${V(t,'você',J(t))}!`,cor:'var(--cy)',modo:'slam'});log(`${J(pi)} passou a batata para ${V(t,'você',J(t))}.`);
}
// cap: só a legenda (o dado já está na tela, em 3D ou pequeno perto do adversário).
// O resultado fica um tempo na tela antes de o efeito acontecer, e a legenda continua durante o efeito
const DICE_WAIT=3000;
const DICE_TXT=['Pega 1 carta do jogador anterior','Compra 2 cartas','Descarta até ficar com 3','Mostra um 4 ou compra 4','Distribui até 5 cartas','Compra até ficar com 6'];
function rollDice(pi,t,then,n0){
  const n=n0||1+Math.floor(rng()*6);
  const txt=DICE_TXT[n-1]+' e perde a vez';
  const wait=fastMode()?700:DICE_WAIT,show=wait+1000;
  emit({t:'dadoResultado',n,txt:`${V(t,'Você',J(t))}: ${txt}`,ms:show});emit({t:'pausa',ms:show});log(`Dado de ${J(t)}: ${n} (${txt.toLowerCase()}).`);
  emit({t:'anuncio',txt:`${V(t,'Seu dado','Dado de '+J(t))}: ${n}`});atualiza();
  const g=S.gen;
  agendar(()=>{if(g!==S.gen||S.phase==='over')return;emit({t:'anuncioFim'});const r=diceEffect(pi,t,n);if(r==='win')return;then()},wait);
}
function diceEffect(pi,t,n){
  const q=S.players[t];
  if(n===1&&S.players[pi].hand.length){const c=rand(S.players[pi].hand);S.players[pi].hand=S.players[pi].hand.filter(x=>x!==c);q.hand.push(c);emit({t:'recebe',p:t,ids:[c.id],de:pi});if(S.players[pi].hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}}
  if(n===2){const k=drawAmt(t,2);drawN(t,k);}
  if(n===3){let k=0;while(q.hand.length>3)discardCard(t,rand(q.hand),k++)}
  // 4: mostra um 4 (a carta continua na mão) ou compra 4
  if(n===4){const f=q.hand.find(c=>c.type==='num'&&c.value===4);if(f){emit({t:'mostra4',p:t,carta:f});log(`${J(t)} ${V(t,'mostra','mostrou')} um 4.`)}else{const k=drawAmt(t,4);drawN(t,k);}}
  if(n===5){const others=alive().filter(i=>i!==t);const k=Math.min(5,q.hand.length-1);for(let j=0;j<k;j++){const c=rand(q.hand);const o=rand(others);q.hand=q.hand.filter(x=>x!==c);S.players[o].hand.push(c);S.players[o].called=false;emit({t:'recebe',p:o,ids:[c.id],de:t,atraso:j*60})}}
  if(n===6){while(q.hand.length<6&&drawOne(t)){}}
  q.called=q.hand.length<=target()&&q.called;
  if(q.hand.length===0&&!nextHand(t)){endRound(t);return 'win'}
  return massCheck();
}
function resolveSimon(pi,card,ok,col){
  emit({t:'redesenhaMesa'});
  if(ok){S.color=col;card.chosen=col;S.simon.push(col);emit({t:'brilho',cor:CVAR[col]});emit({t:'fx',g:'🧠',txt:S.simon.length>1?`Acertou! Sequência de ${S.simon.length}`:`Primeira cor: ${CNAME[col]}`,cor:CVAR[col],modo:'stamp'});log(`${J(pi)} acertou a sequência da Memória (${S.simon.length}).`);return 'done'}
  drawN(pi,1);const c=rand(COLORS);S.color=c;card.chosen=c;
  emit({t:'fx',g:'🧠',txt:'Errou a sequência! +1',cor:'var(--cr)',modo:'slam'});log(`${J(pi)} errou a sequência da Memória.`);return massCheck();
}
function stealWild(pi,t){
  if(t==null||t<0)return 'done';
  const q=S.players[t];const w=q.hand.filter(c=>c.color==='w'&&c.type!=='bomb');
  if(!w.length){emit({t:'fx',g:'🧤',txt:`${V(t,'Você não tinha',J(t)+' não tinha')} curinga`,cor:'var(--muted)',modo:'stamp'});log(`${J(pi)} tentou roubar ${J(t)}, sem curingas.`);return 'done'}
  const c=rand(w);q.hand=q.hand.filter(x=>x!==c);S.players[pi].hand.push(c);S.players[pi].called=false;
  emit({t:'recebe',p:pi,ids:[c.id],de:t});
  emit({t:'fx',g:'🧤',txt:`${J(pi)} roubou ${label(c)} de ${V(t,'você',J(t))}`,cor:'var(--cy)',modo:'slam'});log(`${J(pi)} roubou um curinga de ${J(t)}.`);
  if(q.hand.length===0&&!nextHand(t)){endRound(t);return 'win'}
  return massCheck();
}
function banType(pi,c){
  const m=x=>x.type===c.type&&(c.type!=='num'||x.value===c.value);
  const g=S.gen,sp=fastMode()?.4:1;S.busy=true;emit({t:'pausa',ms:99999});
  const others=alive().filter(i=>i!==pi).map(i=>({i,cards:S.players[i].hand.filter(m)})).filter(x=>x.cards.length);
  const n=S.players[pi].hand.filter(m).length+others.reduce((a,x)=>a+x.cards.length,0)+S.deck.filter(m).length+S.discard.slice(0,-1).filter(m).length;
  emit({t:'fx',g:'✖️',txt:`${c.type==='num'?`Número ${c.value}`:label(c)} banido do jogo (${n} carta${n===1?'':'s'})`,cor:'var(--cr)',modo:'slam'});
  // quem jogou mostra e some primeiro; depois, juntos, os outros jogadores (o monte e a pilha perdem as cartas sem animação)
  const t1=tempoSome(S.players[pi].hand.filter(m).length,sp);emit({t:'some',p:pi,cartas:S.players[pi].hand.filter(m),sp});
  agendar(()=>{
    if(g!==S.gen||S.phase==='over')return;
    let t2=0;
    others.forEach(x=>{t2=Math.max(t2,tempoSome(x.cards.length,sp));emit({t:'some',p:x.i,cartas:x.cards,sp})});
    agendar(()=>{
      if(g!==S.gen||S.phase==='over')return;
      S.fxUntil=0;S.busy=false;
      if(banApply(pi,c,m,n)==='win')return;
      atualiza();endTurn();
    },t2);
  },t1);
  return 'defer';
}
// tempo de n cartas sumirem, uma de cada vez (vanishCards)
const tempoSome=(n,sp)=>OPCOES.semAnimacao||!n?0:((n-1)*VANISH_GAP+DROP)*sp;
function banApply(pi,c,m,n){
  const t=topCard();
  S.deck=S.deck.filter(x=>!m(x));S.discard=[...S.discard.slice(0,-1).filter(x=>!m(x)),t];
  S.players.forEach((q,i)=>{if(q.out)return;const k=q.hand.filter(m).length;if(k){q.hand=q.hand.filter(x=>!m(x));}});
  if(SP[c.type]){const rk=SP[c.type].rule||c.type;if(R[rk]){R[rk]=false;S.removed.push({k:rk,by:V(pi,'você',J(pi))})}}
  log(`${J(pi)} baniu ${label(c)}: ${n} cartas saíram do jogo.`);
  if(S.players[pi].hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}
  const empty=alive().find(i=>S.players[i].hand.length===0&&!nextHand(i));if(empty!=null){endRound(empty);return 'win'}
  graceCalls();return 'done';
}
function transmute(pi,col){
  const picks=alive().filter(i=>i!==pi).map(i=>{const acts=S.players[i].hand.filter(c=>c.type!=='num');return acts.length?{i,c:rand(acts)}:null}).filter(Boolean);
  if(!picks.length){emit({t:'fx',g:'🎩',txt:'Ninguém tinha carta de ação',cor:col,modo:'stamp'});log('Mágica: ninguém tinha carta de ação.');return 'done'}
  const g=S.gen,sp=fastMode()?.4:1;S.busy=true;emit({t:'pausa',ms:99999});
  picks.forEach(x=>{const c=x.c;x.before={...c};
    c.tm={type:c.type,color:c.color,value:c.value};c.type='num';c.value=Math.floor(rng()*10);if(c.color==='w')c.color=rand(COLORS);c.chosen=null;x.after={...c}});
  let t=0;picks.forEach(x=>{emit({t:'magica',p:x.i,carta:x.c,antes:x.before,depois:x.after,sp});
    t=Math.max(t,OPCOES.semAnimacao?0:humano(x.i)?(SHOW_IN+SHOW_HOLD)*sp+PUF+(MORPH_HOLD+MINE_BACK)*sp:(SHOW_IN+SHOW_HOLD+MORPH_HOLD)*sp+PUF)});
  // todas as cartas se transformam juntas, no "puf" do único som (PUF ms depois de ele começar)
  agendar(()=>{if(g===S.gen&&S.phase!=='over')emit({t:'som',k:'transmute'})},OPCOES.semAnimacao?0:(SHOW_IN+SHOW_HOLD)*sp);
  agendar(()=>{if(g===S.gen&&S.phase!=='over')emit({t:'tada',cor:col,ms:1800*sp})},OPCOES.semAnimacao?0:(SHOW_IN+SHOW_HOLD)*sp+PUF);
  log(`Mágica: ${picks.map(x=>`${label(x.before)} de ${J(x.i)} virou ${x.after.value}`).join(', ')}.`);
  agendar(()=>{
    if(g!==S.gen||S.phase==='over')return;
    picks.forEach(x=>emit({t:'magicaFim',carta:x.c,a:x.i}));
    S.fxUntil=0;S.busy=false;atualiza();endTurn();
  },Math.max(t,OPCOES.semAnimacao?300:0));
  return 'defer';
}
/* Banimento: as cartas saem na hora, uma de cada vez em sequência rápida. Começam retas e vão se inclinando de leve
   pelo caminho, sumindo no fim (o contrário das cartas que a Carta da Regra põe no monte): as do adversário caem da
   cadeira e as suas sobem da mão, com a mesma velocidade. Devolve a duração em ms */
const DROP=850,VANISH_GAP=220,LIFT='translateY(-1.375rem) scale(1.08) ';
/* Transformação da Mágica: enquanto o som sobe (PUF ms, fixo como o áudio), a carta treme e vai brilhando;
   no "puf" um clarão e uma nuvem de fumaça com faíscas a cobrem, a face troca (swap) e a carta nova salta.
   Usa as propriedades translate/scale/filter, que se somam ao transform de posição das outras animações */
const PUF=550,POP=450;
/* Mágica de uma carta sua: ela sai da mão para o centro, logo acima da mão, se transforma junto com as outras
   e volta animada para a posição nova na mão (a ordem muda com o símbolo). Devolve a duração em ms */
const MINE_GO=450,MINE_BACK=450;
/* Mágica: cartas mostradas como na Clarividência (abaixo da cadeira do adversário ou, para você, na própria mão),
   que se transformam nas cartas de "to". Devolve a duração em ms */
const SHOW_IN=250,SHOW_HOLD=700,MORPH_HOLD=1000;
function doChallenge(pi){
  const c0=S.chal;if(!c0)return;
  S.busy=true;const g=S.gen;
  emit({t:'fx',g:'⚔️',txt:`${V(pi,'Você desafiou',J(pi)+' desafiou')} o +${c0.amt} de ${V(c0.by,'você',J(c0.by))}`,cor:'var(--accent)',modo:'stamp',ms:1300});
  log(`${J(pi)} desafiou o +${c0.amt} de ${J(c0.by)}.`);
  agendar(()=>{
    if(g!==S.gen||S.phase==='over')return;
    if(c0.bluff){
      const b=S.players[c0.by];const proof=b.hand.find(x=>x.color!=='w'&&sameCol(x.color,c0.col));
      emit({t:'fx',g:'🃏',txt:`Blefe! ${V(c0.by,'Você podia',J(c0.by)+' podia')} ter jogado ${proof?cardName(proof):'outra carta'}`,cor:'var(--cg)',modo:'stamp',ms:1500});
      emit({t:'revela',p:c0.by,carta:proof});
      agendar(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;challengeResolve(pi)},fastMode()?600:1500);
    }else{S.busy=false;challengeResolve(pi)}
  },fastMode()?500:1300);
}
function challengeResolve(pi){
  const c=S.chal;S.chal=null;if(!c)return;const n=S.pending;S.pending=0;S.pendingType=null;
  const amt=Math.min(n,c.amt||n),rest=n-amt;
  const frozenBy=S.weather==='blizzard'||curseIs('ice'),frozen=S.weather==='blizzard'||curseIs('ice');
  if(c.bluff){
    const cont=()=>{
      if(rest>0&&!frozen){
        if(rest>=99){drawn99(pi,endTurn);return}
        const k2=drawAmt(pi,rest);if(k2){drawN(pi,k2);}
        log(`${J(pi)} comprou o restante acumulado: ${k2}.`);
        if(overloaded(pi)&&markOut(pi))return;endTurn();return;
      }
      S.tok++;atualiza();pedirJogada(S.turn);
    };
    if(S.death){
      emit({t:'fx',g:'⚔️',txt:`Blefe! ${V(c.by,'Você foi eliminado',J(c.by)+' foi eliminado')}`,cor:'var(--cg)',modo:'slam'});emit({t:'selo',p:c.by,ic:'⚔️',cor:'var(--cr)'});
      log(`${J(pi)} desafiou: ${J(c.by)} blefou com +${amt} na morte súbita e foi eliminado.`);
      if(markOut(c.by,`foi pego blefando com +${amt} na morte súbita`))return;
    }else if(amt>=99&&!frozenBy){
      emit({t:'fx',g:'⚔️',txt:`Blefe! ${V(c.by,'Você compra',J(c.by)+' compra')} o +99`,cor:'var(--cg)',modo:'slam'});
      log(`${J(pi)} desafiou: ${J(c.by)} blefou com +99.`);
      drawn99(c.by,cont);return;
    }else{
      const k=frozenBy?0:drawAmt(c.by,amt);if(k){drawN(c.by,k);}
      emit({t:'fx',g:'⚔️',txt:`Blefe! ${V(c.by,'Você compra',J(c.by)+' compra')} ${k}`+(rest?`, ${V(pi,'você compra',J(pi)+' compra')} o resto (+${rest})`:''),cor:'var(--cg)',modo:'slam'});
      log(`${J(pi)} desafiou: ${J(c.by)} blefou com +${amt} e comprou ${k}.`);
      if(massCheck()==='win')return;
    }
    cont();
  }else{
    if(S.death){
      emit({t:'fx',g:'⚔️',txt:`Jogada legal! ${V(pi,'Você foi eliminado',J(pi)+' foi eliminado')}`,cor:'var(--cr)',modo:'slam'});log(`${J(pi)} desafiou errado na morte súbita e foi eliminado.`);
      if(markOut(pi,'desafiou errado na morte súbita'))return;endTurn();return;
    }
    if(n>=99&&!frozen){emit({t:'fx',g:'⚔️',txt:`Jogada legal! ${V(pi,'Você compra',J(pi)+' compra')} o +99`,cor:'var(--cr)',modo:'slam'});log(`${J(pi)} desafiou e errou.`);drawn99(pi,endTurn);return}
    const k=frozen?0:drawAmt(pi,n+2);if(k){drawN(pi,k);}
    emit({t:'fx',g:'⚔️',txt:`Jogada legal! ${V(pi,'Você compra',J(pi)+' compra')} ${k}`,cor:'var(--cr)',modo:'slam'});log(`${J(pi)} desafiou e errou: comprou ${k}.`);
    if(overloaded(pi)&&markOut(pi))return;endTurn();
  }
}
function autoHuman(pi){
  const g=S.gen,tok=S.tok;S.auto=true;atualiza();
  emit({t:'aviso',txt:'Confuso! Jogada aleatória',cor:'var(--cy)'});
  agendar(()=>{
    if(g!==S.gen||tok!==S.tok||S.turn!==pi||S.phase==='over')return;
    const me=S.players[pi];const opts=me.hand.filter(c=>canPlay(me,c,true));
    if(!opts.length){
      takeDraw(pi);
      if(S.busy&&S.autoResolve)agendar(()=>S.autoResolve&&S.autoResolve(),800);
      else if(S.phase==='drawn'&&S.turn===pi){const d=me.hand.find(c=>c.id===S.drawnId);if(d)autoPlay(pi,d)}
      return;
    }
    autoPlay(pi,rand(opts));
  },1000);
}
function autoPlay(pi,card){
  termina(pi,card,isWildPick(card)?rand(COLORS):null);
  if(S.busy&&S.autoResolve)agendar(()=>S.autoResolve&&S.autoResolve(),800);
  else if(S.phase==='combo'&&S.turn===pi)endTurn();
}
const CARD_RULES=()=>RULES.filter(r=>r.g==='Cartas especiais').map(r=>r.k);
function ruleOptions(n=2,pre){
  const pool=[...RULE_POOL,...CARD_RULES(),...Object.keys(DEF_RULES).filter(k=>DEF_RULES[k]!==R.combo),...(pre?['noaction','mess','mulligan','mini','maxi','twohands']:[])].filter(k=>!R[k]&&!(CONFLICT[k]||[]).some(x=>R[x])&&!(k==='bg'&&S&&S.side==='b')&&!(k==='nou'&&comboMode()==='none')&&!(k==='portal'&&!pre)
    // Mini e Maxi não mudam nada se as cartas iniciais já forem 4 ou menos / 9 ou mais
    &&!(k==='mini'&&R.start<=4)&&!(k==='maxi'&&R.start>=9));
  return shuffle(pool).slice(0,n);
}
function addRule(pi,k,quiet,done){
  R[k]=true;if(k==='bg')nomesCor();emit({t:'cores'});
  const by=pi==null?'o jogo':V(pi,'você',J(pi)); // quem adicionou, para cada um que vê (texto())
  S.added.push({k,by});emit({t:'regraFresca',k});
  S.ruleOrder=[...(S.ruleOrder||[]).filter(x=>x!==k),k]; // regra nova entra na ponta direita
  const cards=[];
  Object.entries(SP).forEach(([t,v])=>{if((v.rule||t)===k)v.deck.forEach(c=>cards.push(mk(c,t)))});
  if(k==='bomb')cards.push(mk('w','bomb'));
  cards.forEach(c=>S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,c));
  const extra=cards.length?` (+${cards.length} carta${cards.length>1?'s':''} no monte)`:'';
  if(quiet){for(let j=0;j<Math.min(cards.length,6);j++)emit({t:'voa',de:'mesa',para:'monte',atraso:j*90})}
  else ruleReveal(k,cards,done);
  log(`${pi==null?'O jogo':J(pi)} adicionou a regra ${RNAME[k]}${extra}.`);
}
// Carta da Regra: ícone grande com o nome, voa até a faixa de regras enquanto as cartas novas caem no monte; depois a janela explicativa
function ruleReveal(k,cards,done){
  const g=S.gen,sp=fastMode()?.4:1;S.busy=true;emit({t:'pausa',ms:99999});emit({t:'som',k:'rule'});
  const fin=()=>{if(g!==S.gen)return;emit({t:'regra',fase:'fim'});S.fxUntil=0;S.busy=false;atualiza();emit({t:'infoRegra',k});if(done)done()};
  if(OPCOES.semAnimacao){atualiza();fin();return}
  emit({t:'regra',fase:'mostra',k});
  agendar(()=>{
    if(g!==S.gen||S.phase==='over')return;
    atualiza();
    // o ícone voa até a faixa (se ela estiver na tela) enquanto as cartas novas caem no monte
    const voa=emit({t:'regra',fase:'voa',k,cartas:cards.slice(0,6),sp});
    agendar(fin,voa?anim(700*sp):700*sp);
  },1200*sp);
}
// ordem da faixa: a ordem em que as regras entraram (S.ruleOrder); as que ainda não estão nela vêm depois, na ordem da lista
function ruleKeys(){const order=(S&&S.ruleOrder)||[];return [...order.filter(k=>R[k]),...RULES.filter(r=>R[r.k]&&!order.includes(r.k)).map(r=>r.k)]}
// sequência de efeitos, um jogador por vez; a partida espera e depois segue
function sequenceFx(list,step){
  const g=S.gen,sp=fastMode()?.4:1;S.busy=true;emit({t:'pausa',ms:99999});
  const go=j=>{if(g!==S.gen||S.phase==='over')return;
    if(j>=list.length){S.fxUntil=0;S.busy=false;if(massCheck()==='win')return;atualiza();endTurn();return}
    step(list[j],()=>go(j+1),sp)};
  go(0);return 'defer';
}
// as cartas compradas aparecem direto na mão, sem voar do monte
function quietDraw(i){emit({t:'semVoo',p:i})}
// o adversário pensa: a tela mostra o balão com as opções piscando até parar na escolhida; a mesa só espera o tempo dele
function botThink(pi,kind,list,pickIdx,done){
  const steps0=4+rng()*3;
  const g=S.gen,sp=fastMode()?.4:1,passos=Math.max(3,Math.round(steps0*sp));
  emit({t:'pensa',p:pi,tipo:kind,lista:list,escolha:pickIdx,passos,sp});
  if(OPCOES.semAnimacao){agendar(()=>{if(g===S.gen)done()},300*sp);return}
  agendar(()=>{if(g===S.gen&&S.phase!=='over')done()},(250+passos*200+550)*sp);
}
// Memória do adversário: repete as cores uma a uma; se for errar, para na cor errada (erraEm)
function botTypeSimon(pi,seq,ok,done){
  const failAt=ok?-1:Math.floor(rng()*seq.length);
  const g=S.gen,sp=fastMode()?.4:1;
  emit({t:'memoriaBot',p:pi,seq,erraEm:failAt,sp});
  if(OPCOES.semAnimacao){agendar(()=>{if(g===S.gen)done()},300*sp);return}
  agendar(()=>{if(g===S.gen&&S.phase!=='over')done()},(failAt>=0?300+failAt*380+700:300+seq.length*380+400)*sp);
}
// depois da escolha de uma carta especial a vez passa, a não ser que o efeito continue ou a partida acabe
function aposEscolha(r){if(r==='win'||r==='defer'||S.phase==='over')return;atualiza();endTurn()}
// pedido de uma carta especial (alvo, carta, regra): a escolha vai para o efeito
function pedeEspecial(pi,card,tipo,tela,bot,efeito){return pedir(pi,{tipo,carta:card,tela,bot,responde:e=>{S.busy=false;aposEscolha(efeito(e,aposEscolha))}})}
const outros=pi=>alive().filter(i=>i!==pi);
function applySpecial(pi,card){
  const p=S.players[pi],T=card.type,col=CVAR[card.color]||'var(--accent)';
  const opp=alive().filter(i=>i!==pi);
  emit({t:'pausa',ms:1000});
  switch(T){
    case 'trade':if(!opp.length)return 'done';
      return pedeEspecial(pi,card,'alvo',{titulo:'Trocar de mão com…',sub:'Escolha com quem trocar todas as cartas.',opcoes:()=>outros(pi)},
        ()=>({e:botSwapTarget(pi),lista:outros(pi),ver:'player'}),t=>{swapHands(pi,t);return 'done'});
    case 'carousel':rotateHands();return 'done';
    case 'gift':if(!p.hand.length)return 'done';
      return pedeEspecial(pi,card,'alvo',{titulo:'Doar uma carta para…',sub:'Uma carta aleatória da sua mão vai para quem você escolher.',opcoes:()=>outros(pi)},
        ()=>{const o=opponents(pi);if(!o.length)return null;return {e:R.diff==='easy'?rand(o):fewest(pi,o),lista:outros(pi),ver:'player'}},t=>giftCard(pi,t));
    case 'web':
      return pedeEspecial(pi,card,'alvo',{titulo:'Prender na teia…',sub:'Quem você escolher perde a próxima vez.',opcoes:()=>outros(pi)},
        ()=>{const t=botTarget(pi,true);return t<0?null:{e:t,lista:outros(pi),ver:'player'}},t=>{webOn(pi,t);return 'done'});
    case 'wish':if(!p.hand.length||S.discard.length<2)return 'done';
      return pedeEspecial(pi,card,'carta',{titulo:'Carta do Desejo',sub:'Escolha uma carta da pilha. Uma carta aleatória sua vai para a pilha no lugar.',opcoes:()=>wishOptions()},
        ()=>{const opts=wishOptions();return {e:opts.find(c=>c.color==='w')||opts.find(c=>c.color===S.color)||opts[0],lista:opts,ver:'down'}},c=>{wishSwap(pi,c);return 'done'});
    case 'rain':{
      // um adversário por vez, no sentido do jogo: a carta cai do céu até ele
      const order=[];for(let i=nextIdx(pi,1);i!==pi&&!order.includes(i);i=nextIdx(i,1))if(opp.includes(i))order.push(i);
      log('Chuva: todos os adversários compram 1.');emit({t:'som',k:'rain'});
      return sequenceFx(order,(i,next,sp)=>{
        // a carta já entra na mão e a chuva cai até a cadeira (na mão de quem vê, exatamente no lugar da carta nova)
        const had=new Set(S.players[i].hand.map(c=>c.id));drawN(i,1);quietDraw(i);atualiza();
        const nc=S.players[i].hand.find(c=>!had.has(c.id));
        emit({t:'chuva',p:i,id:nc&&nc.id,ms:560*sp});
        agendar(()=>{emit({t:'chuvaFim',id:nc&&nc.id,a:i});atualiza();agendar(next,160*sp)},anim(560*sp));
      })}
    case 'thunder':{
      // 2 jogadores sorteados (pode ser quem jogou), cada um compra de 1 a 5; um por vez, as cartas aparecem de repente
      const vs=shuffle(alive()).slice(0,2);
      log(`Trovão atingiu ${vs.map(i=>J(i)).join(' e ')}.`);
      return sequenceFx(vs,(i,next,sp)=>{const n=1+Math.floor(rng()*5);
        thunderDraw(i,n);atualiza();agendar(next,950*sp)})}
    case 'equality':{
      alive().forEach(i=>{const q=S.players[i];let k=0;while(q.hand.length>3)discardCard(i,rand(q.hand),k++);while(q.hand.length<3&&drawOne(i)){}});
      graceCalls();emit({t:'fx',g:'=',txt:'Todos ficam com 3 cartas',cor:col,modo:'stamp'});log('Igualdade: todos ficaram com 3 cartas.');
      const r=massCheck();if(r==='win')return r;return selfCheck(pi)}
    case 'justice':{
      const k=Math.max(0,Math.min(opp.filter(i=>S.players[i].hand.length<p.hand.length).length,p.hand.length-1));
      for(let j=0;j<k;j++)discardCard(pi,rand(p.hand),j);
      emit({t:'fx',g:'🙏',txt:k?`${J(pi)} descartou ${k} carta${k>1?'s':''}`:'Ninguém tem menos cartas',cor:col,modo:'stamp'});log(`Misericórdia: ${J(pi)} descartou ${k}.`);
      return selfCheck(pi)}
    case 'magnet':{emit({t:'3d',k:'sparks',onde:pi,args:[col]});
      const same=p.hand.filter(c=>c.color===card.color);same.forEach((c,j)=>discardCard(pi,c,j));
      emit({t:'fx',g:'🧲',txt:same.length?`${J(pi)} descartou ${same.length} carta${same.length>1?'s':''}`:'Nenhuma carta da cor',cor:col,modo:'stamp'});
      log(`Imã: ${J(pi)} descartou ${same.length}.`);return selfCheck(pi)}
    case 'tornado':{emit({t:'3d',k:'swirl',args:['tornado']});
      if(opp.length<2){emit({t:'fx',g:'🌪️',txt:'Nada para embaralhar',cor:col,modo:'stamp'});return 'done'}
      const sizes=opp.map(i=>S.players[i].hand.length);const pool=shuffle(opp.flatMap(i=>S.players[i].hand));
      opp.forEach(i=>emit({t:'voa',de:i,para:'mesa',atraso:0}));
      opp.forEach((i,k)=>{const h=pool.splice(0,sizes[k]);S.players[i].hand=h;memReset(i);emit({t:'recebe',p:i,ids:h.map(c=>c.id),de:'mesa',maoNova:true,voa:false});agendar(()=>emit({t:'voa',de:'mesa',para:i,atraso:0}),350)});
      graceCalls();emit({t:'fx',g:'🌪️',txt:'Mãos dos adversários embaralhadas',cor:col,modo:'slam'});log('Tornado embaralhou as mãos dos adversários.');return 'done'}
    case 'steal':return transmute(pi,col);
    case 'peace':{const n=alive().length*2+2;S.peace=n+1;emit({t:'fx',g:'🌼',txt:'Ações sem efeito por alguns turnos',cor:'var(--cg)',modo:'stamp'});log('Paz: cartas de ação sem efeito por alguns turnos.');return 'done'}
    case 'batata':
      return pedeEspecial(pi,card,'alvo',{titulo:'Passar a batata para…',sub:'Quem ficar 5 turnos com ela é eliminado.',opcoes:()=>outros(pi)},
        ()=>{const b=botTarget(pi);return {e:b>=0?b:rand(opp),lista:outros(pi),ver:'player'}},t=>{giveBatata(pi,card,t);return 'done'});
    case 'curse':{
      const keys=Object.keys(CURSES).filter(c=>!(R.mess&&c==='shoe')),k=rand(keys),g=S.gen,sp=fastMode()?.35:1;
      S.busy=true;emit({t:'pausa',ms:99999});
      emit({t:'roleta',opcoes:keys.map(x=>CURSES[x].g)});
      const steps=[];let t=0;for(let j=0;j<16;j++){t+=(55+j*j*1.4)*sp;steps.push(t)}
      steps.forEach((at,j)=>agendar(()=>{if(g!==S.gen)return;emit({t:'roleta',para:j===steps.length-1?CURSES[k].g:null})},at));
      agendar(()=>{
        if(g!==S.gen||S.phase==='over')return;
        S.curse={k,left:CURSES[k].n*alive().length+2};emit({t:'3d',k:'aura',args:['#8b3fd1']});
        S.fxUntil=0;emit({t:'fx',g:CURSES[k].g,txt:`Maldição ${CURSES[k].nm}: ${CURSES[k].t}`,cor:'#6b2fa3',modo:'slam',ms:2600*sp});
        log(`Maldição ${CURSES[k].nm}: ${CURSES[k].t.toLowerCase()}.`);atualiza();
        agendar(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;atualiza();endTurn()},2500*sp);
      },steps[steps.length-1]+250*sp);
      return 'defer'}
    case 'dice':{
      const t=nextIdx(pi,1),g=S.gen;S.busy=true;
      const n=1+Math.floor(rng()*6);
      // adversário rola: dado pequeno perto da cadeira dele; você rola: dado grande (3D ou 2D)
      emit({t:'dado',p:t,n,ms:fastMode()?450:1200,txt:`${V(t,'Você rola',J(t)+' rola')} o dado…`});emit({t:'pausa',ms:3000});atualiza();
      agendar(()=>{
        if(g!==S.gen||S.phase==='over')return;
        rollDice(pi,t,()=>{emit({t:'dadoFim'});if(g!==S.gen||S.phase==='over')return;S.busy=false;
          // quem rolou sempre perde a vez (se ainda estiver no jogo)
          const q=S.players[t];if(!q.out&&!q.thorned){S.skip=true;emit({t:'selo',p:t,ic:'⊘',cor:'var(--cr)'})}atualiza();if(S.phase!=='over')endTurn()},n);
      },fastMode()?500:1450);
      return 'defer'}
    case 'oddeven':S.traffic=S.traffic==='odd'?'even':S.traffic==='even'?'odd':rand(['odd','even']);
      emit({t:'fx',g:'🚦',txt:`Proibido vencer com cartas ${S.traffic==='odd'?'ímpares':'pares'}`,cor:col,modo:'stamp'});log(`Semáforo: proibido vencer com ${S.traffic==='odd'?'ímpares':'pares'}.`);return 'done';
    case 'death':S.death=true;emit({t:'fx',g:'☠️',txt:'Morte súbita! Quem comprar ou errar é eliminado',cor:'#0d0a14',modo:'slam'});log('Morte súbita ativada.');return 'done';
    case 'share':{
      const copies=shuffle([...p.hand]).slice(0,10).map(c=>{const n=mk(c.color,c.type,c.value);n.extra=true;return n});
      copies.forEach((c,k)=>{const t=rand(opp);if(t==null)return;S.players[t].hand.push(c);S.players[t].called=false;emit({t:'recebe',p:t,ids:[c.id],de:pi,atraso:k*50})});
      emit({t:'fx',g:'🤲',txt:`${J(pi)} partilhou ${copies.length} cópia${copies.length===1?'':'s'}`,cor:col,modo:'slam'});log(`${J(pi)} deu ${copies.length} cópias das suas cartas.`);return massCheck()}
    case 'simon':return pedir(pi,{tipo:'memoria',carta:card,responde:(ok,c)=>{S.busy=false;aposEscolha(resolveSimon(pi,card,ok,c))}});
    case 'chair':{
      // adversário que joga também troca de lugar e leva a vez junto (a próxima vez é a do vizinho no lugar novo)
      const idx=alive().filter(i=>!humano(i));
      if(R.team||idx.length<2){emit({t:'fx',g:'🪑',txt:'Ninguém trocou de lugar',cor:col,modo:'stamp'});return 'done'}
      emit({t:'cadeiras'});
      const from=shuffle([...idx]),mv=(a,ix)=>{const o=[...a];idx.forEach((i,k)=>o[i]=a[from[k]]);return o};
      const put=(a,b)=>b.forEach((x,i)=>a[i]=x);put(S.players,mv(S.players));
      if(S.other)put(S.other.players,mv(S.other.players));
      if(S.mem)['lacks','lastCol'].forEach(k=>{const m=S.mem[k],o={...m};idx.forEach((i,k2)=>{if(m[from[k2]]!==undefined)o[i]=m[from[k2]];else delete o[i]});S.mem[k]=o});
      if(!humano(pi)&&S.turn===pi){S.turn=idx[from.indexOf(pi)];if(S.turn!==pi)emit({t:'segueVez'})}
      emit({t:'fx',g:'🪑',txt:'Os adversários trocaram de lugar',cor:col,modo:'slam'});log('Dança: os adversários trocaram de lugar.');
      // espera um pouco com a vez ainda no lugar novo, para ficar claro quem se mexeu, antes de passar a vez
      if(canCombo(p,card)&&(R.stack||R.sequence))return 'done';
      const g=S.gen;S.busy=true;atualiza();
      agendar(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;atualiza();endTurn()},fastMode()?500:1300);
      return 'defer'}
    case 'view':
      opp.forEach(i=>{const q=S.players[i];if(q.hand.length)emit({t:'espia',p:i,carta:rand(q.hand)})});
      emit({t:'fx',g:'👁️',txt:'Todos mostram uma carta',cor:col,modo:'stamp'});log('Clarividência: todos mostraram uma carta.');return 'done';
    case 'treasure':{
      p.treasure=(p.treasure||0)+1;
      if(p.treasure>=3){p.treasure=0;const c=mk(card.color,'chest');c.extra=true;p.hand.push(c);p.called=false;emit({t:'recebe',p:pi,ids:[c.id],de:'mesa',voa:false});
        emit({t:'fx',g:'💰',txt:`${J(pi)} achou a Carta do Tesouro!`,cor:'var(--cy)',modo:'slam'});log(`${J(pi)} recebeu a Carta do Tesouro.`)}
      else{emit({t:'fx',g:'🧭',txt:`Busca de ${V(pi,'você',J(pi))}: ${p.treasure}/3`,cor:col,modo:'stamp'})}
      return 'done'}
    case 'lock':
      opp.forEach(i=>{const free=shuffle(S.players[i].hand.filter(c=>!c.lock)).slice(0,2);free.forEach(c=>c.lock=true);if(free.length)emit({t:'selo',p:i,ic:'🔒',cor:col})});
      emit({t:'fx',g:'🔒',txt:'Duas cartas trancadas por jogador',cor:col,modo:'stamp'});log('Tranca: duas cartas de cada adversário trancadas.');return 'done';
    case 'theft':
      return pedeEspecial(pi,card,'alvo',{titulo:'Roubar um curinga de…',sub:'Se ele tiver um curinga, ele vai para a sua mão.',opcoes:()=>outros(pi)},
        ()=>{const o=opponents(pi);return {e:o.length?(R.diff==='easy'?rand(o):fewest(pi,o,true)):rand(opp),lista:outros(pi),ver:'player'}},t=>stealWild(pi,t));
    case 'ban':if(!p.hand.length)return 'done';
      return pedeEspecial(pi,card,'carta',{titulo:'Carta do Banimento',sub:'Escolha uma carta. Todas as cartas com o mesmo símbolo saem do jogo.',opcoes:()=>shuffle([...S.players[pi].hand]).slice(0,3)},
        ()=>{const o3=shuffle([...p.hand]).slice(0,3);return {e:rand(o3),lista:o3,ver:'down'}},c=>banType(pi,c));
    case 'box':
      alive().forEach((i,k)=>{const c=mk('w','random');c.extra=true;S.players[i].hand.push(c);S.players[i].called=false;emit({t:'recebe',p:i,ids:[c.id],de:'monte',atraso:k*60,origem:false})});
      emit({t:'fx',g:'📦',txt:'Todos ganham uma Carta Misteriosa',cor:col,modo:'slam'});log('Presente: todos ganharam uma Carta Misteriosa.');return massCheck();
    case 'confuse':p.confuseNext=true;emit({t:'fx',g:'🍄',txt:`${V(pi,'Você jogará',J(pi)+' jogará')} aleatoriamente na próxima vez`,cor:col,modo:'stamp'});log(`${J(pi)} ficará confuso.`);return 'done';
    case 'ink':{
      const t=nextIdx(pi,1);S.players[t].hand.forEach(c=>{if(c.color!=='w'){if(c.baseColor==null)c.baseColor=c.color;c.color=card.color}});
      emit({t:'selo',p:t,ic:'🖌️',cor:col});emit({t:'fx',g:'🖌️',txt:`Cartas de ${V(t,'você',J(t))} pintadas de ${CNAME[card.color].toLowerCase()}`,cor:col,modo:'slam'});log(`Tinta: cartas de ${J(t)} pintadas.`);return 'done'}
    case 'mix1':case 'mix2':case 'mix3':{
      if(T!=='mix3'){S.dir*=-1;emit({t:'sentido'})}
      const a=nextIdx(pi,1);
      if(T==='mix1'){S.skip=1;emit({t:'selo',p:a,ic:'⊘',cor:'var(--cr)'});emit({t:'fx',g:ARROWS,txt:`Inverte e ${V(a,'você perde',J(a)+' perde')} a vez`,cor:'var(--accent)',modo:S.dir===1?'cw':'ccw'})}
      if(T==='mix2'){const n=drawAmt(a,2);drawN(a,n);emit({t:'selo',p:a,ic:'⊘',cor:'var(--cr)'});S.skip=1;emit({t:'fx',g:ARROWS,txt:`Inverte e ${V(a,'você compra',J(a)+' compra')} ${n}`,cor:'var(--cr)',modo:S.dir===1?'cw':'ccw'})}
      if(T==='mix3'){const b=nextIdx(pi,2);const n=drawAmt(b,2);emit({t:'selo',p:a,ic:'⊘',cor:'var(--cr)'});drawN(b,n);emit({t:'selo',p:b,ic:'⊘',cor:'var(--cr)'});S.skip=2;emit({t:'fx',g:'⊘+2',txt:`${J(a)} perde a vez, ${J(b)} compra ${n}`,cor:'var(--cr)',modo:'slam'})}
      return massCheck()}
    case 'rule':{
      const opts=ruleOptions(3);
      if(!opts.length){emit({t:'fx',g:'📜',txt:'Nenhuma regra nova disponível',cor:col,modo:'stamp'});return 'done'}
      // a pessoa vê 3 opções sorteadas de novo quando a janela abre
      return pedeEspecial(pi,card,'regra',{opcoes:()=>ruleOptions(3)},()=>({e:rand(opts),lista:opts,ver:'rule'}),
        (k,fim)=>{if(k==null)return 'done';addRule(pi,k,false,()=>fim('done'));return 'defer'})}
    case 'sun':case 'fog':case 'storm':case 'blizzard':{
      const w=WEATHER[T];S.weather=T;S.passes=0;if(T==='blizzard'){S.pending=0;S.pendingType=null;S.chal=null}
      emit({t:'fx',g:w.g,txt:`${w.n}: ${w.t}`,cor:w.c,modo:'slam'});log(`O clima mudou para ${w.n.toLowerCase()}.`);
      if(T==='storm')emit({t:'relampago'});
      if(T==='fog')S.players.forEach(q=>q.called=false);
      return 'done'}
    case 'portal':if(!S.other)return 'done';portalSequence(pi);return 'defer';
    case 'luck':p.luck=true;emit({t:'fx',g:'🍀',txt:V(pi,'Sua próxima compra será jogável',`Próxima compra de ${J(pi)} será jogável`),cor:'var(--cg)',modo:'stamp'});log(`${J(pi)} está com sorte.`);return 'done';
  }
  return 'done';
}

/* ---------- trade / carousel ---------- */
function handTo(i,hand,fromIdx){
  S.players[i].hand=hand;memReset(i);emit({t:'contagemDireta'}); // o número de cartas nas cadeiras muda direto, sem contagem
  emit({t:'recebe',p:i,ids:hand.map(c=>c.id),de:fromIdx,maoNova:true,voa:false});
}
function graceCalls(){S.players.forEach(p=>{p.called=p.hand.length<=target()})}
function swapHands(a,b){
  if(b==null||b<0)return;
  const ha=S.players[a].hand,hb=S.players[b].hand;
  for(let k=0;k<3;k++){emit({t:'voa',de:a,para:b,atraso:k*80});emit({t:'voa',de:b,para:a,atraso:k*80})}
  handTo(a,hb,b);handTo(b,ha,a);graceCalls();
  emit({t:'fx',g:'⇆',txt:`${J(a)} ⇆ ${J(b)}`,cor:'var(--cb)',modo:'stamp'});emit({t:'pausa',ms:1000});
  log(`${J(a)} trocou de mão com ${V(b,'você',J(b))}.`);
}
function rotateHands(){
  emit({t:'3d',k:'swirl',args:['orbit',S.dir]});
  const ids=alive();const old=Object.fromEntries(ids.map(i=>[i,S.players[i].hand]));
  ids.forEach(i=>{const to=nextIdx(i,1);emit({t:'voa',de:i,para:to,atraso:0})});
  ids.forEach(i=>{const to=nextIdx(i,1);handTo(to,old[i],i)});
  graceCalls();
  emit({t:'fx',g:ARROWS,txt:'Todos passam as cartas adiante',cor:'var(--cb)',modo:S.dir===1?'cw':'ccw'});emit({t:'pausa',ms:1000});
  log('Todas as mãos giraram no sentido do jogo.');
}
function botSwapTarget(pi){
  let others=alive().filter(i=>i!==pi&&i!==partner(pi));
  if(!others.length)others=alive().filter(i=>i!==pi);
  if(!others.length)return -1;
  if(R.diff==='easy')return rand(others);
  return fewest(pi,others);
}

/* ---------- jump-in ---------- */
function canJump(pi,c){
  return R.jumpin&&S.phase==='play'&&!S.busy&&S.turn!==pi&&!S.players[pi].out&&identical(c,topCard());
}
function doJumpIn(pi,card){
  S.tok++;
  S.turn=pi;S.extra=false;S.skip=false;
  if(humano(pi))S.mull=false;
  emit({t:'fx',g:'✂',txt:V(pi,'Você cortou!',`Corte de ${J(pi)}!`),cor:'var(--cy)',modo:'stamp'});
  log(`${J(pi)} cortou a vez!`);
  const go=()=>{
    // a pessoa escolhe na hora (a carta já pousou na mesa)
    if(humano(pi)&&ASK_TYPES.includes(card.type))S.preLanded=card;
    const r=playCard(pi,card,null);
    if(r==='win'||r==='defer')return;
    if(r==='combo'){S.tok++;atualiza();pedirJogada(pi);return}
    endTurn();
  };
  if(card.type!=='num'){announce(pi,card,go,fastMode()?250:480);return}
  go();
}
function scheduleJumps(){
  if(!R.jumpin||S.phase!=='play')return;
  const tok=S.tok,g=S.gen,p=DIFF[R.diff].jump;
  const humanTurn=humano(S.turn);
  alive().forEach(i=>{
    if(i===S.turn||!deBot(i))return;
    const c=S.players[i].hand.find(x=>identical(x,topCard()));
    if(!c||rng()>p)return;
    agendar(()=>{
      if(g!==S.gen||tok!==S.tok||S.phase!=='play'||S.busy)return;
      if(!S.players[i].hand.includes(c)||!identical(c,topCard()))return;
      doJumpIn(i,c);
    },(humanTurn?1600:500)+rng()*(humanTurn?1000:500));
  });
}
