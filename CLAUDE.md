# unotfm solo

Versão solo, para navegador, do **unotfm** (módulo de UNO do Gustavo no Transformice, mantido pelo Modules Team).
O jogador enfrenta adversários controlados pelo computador, com dezenas de regras da casa e cartas especiais vindas do módulo.
Hospedado no GitHub Pages e instalável como app (PWA).

## Como trabalhar comigo (Gustavo)

- **Confirme o entendimento antes de mudanças grandes ou ambíguas.** Liste o que entendeu, item por item, e aponte o que falta decidir, com uma sugestão para cada ponto. Só implemente depois do "pode aplicar". Correções pequenas e claras podem ser feitas direto.
- Escreva em **português do Brasil**, tanto as respostas quanto os textos do jogo.
- Na interface, chame os bots de **"adversários"**. A palavra "bot" não aparece para o jogador.
- Depois de alterar, **teste** (veja abaixo) e diga claramente o que foi conferido e o que não deu para conferir.
- Faça commit com mensagem em português descrevendo a mudança. Só faça push depois da confirmação, a não ser que eu peça para enviar direto.

## Estrutura

```
index.html              marcação da página (sem CSS/JS embutido)
css/style.css           todos os estilos
js/mesa/                a mesa (as regras), que não usa nada da página e roda também no Node:
  dados.js              S, R, OPCOES, sorteio com semente, cores, regras (RULES), cartas especiais (SP), maldições,
                        climas, dificuldades (DIFF), baralho e funções puras da partida
  regras.js             eventos (emit), controladores e pedidos, relógio (RELOGIO, agendar), canPlay, distribuição
                        (newGame/dealAndStart), Portal, jogar/playCard, fim de turno, compras, eliminação, fim
  cartas.js             efeitos das cartas especiais (applySpecial), desafio, Carta da Regra, troca/carrossel e corte
  adversarios.js        IA dos adversários (inclui o Mestre) e o controlador deles (CONTROLES.bot)
  visao.js              o que cada jogador pode saber (visao) e o giro das cadeiras (giraPara/giraDe, eventoPara)
js/turbo.js             invólucro do setTimeout (TB) e o turbo (Terminar e descobrir vencedor)
js/data.js              o que é da página nos dados: elementos ($), movimento reduzido, configuração salva (CFG),
                        rulesForMode(), textos do menu e dicas (TIPS), applyBg
js/arte.js              desenho das cartas: símbolos (SIMBOLOS, sim), face (faceHTML), verso (versoHTML) e camadas
                        do baralho (ARTE, aplicarArte)
js/effects.js           camada 3D com three.js (FX3D) e sons sintetizados com Web Audio (SND, sfx)
js/cards.js             desenhos e janelas das cartas especiais (dado, Banimento, Mágica, cartas mostradas, faixa
                        de regras, Mix de Regras, balões)
js/rede.js              rede de mentira entre duas abas (?rede=anfitriao / ?rede=convidado), CONTROLES.rede
js/ui.js                tela: TELA (eventos), VIS, controlador da tela e pedidos, render(), janelas (cor, rastrear,
                        regras, status, histórico), configurações, ligação de eventos, instalação do PWA
manifest.webmanifest    manifesto do PWA
sw.js                   service worker (offline)
icons/                  ícones do app
lan-teste.html          prova de conceito da rede local (link em Configurações → Experimental), com
css/lan-teste.css,      js/lan-teste.js e as bibliotecas de QR code em js/vendor/ (qrcode-generator e jsQR)
mostruario.html         mostruário de cartas (Configurações → Experimental), com css/mostruario.css e js/mostruario.js
docs/plano-multiplayer.md  plano aprovado do multiplayer (fases 0, 1 e 1.5, hospedagem, lojas)
```

Os arquivos JS são **scripts clássicos carregados em ordem** e compartilham o escopo global (não há módulos nem IIFE).
- Não crie nomes globais que colidam com propriedades do `window`. Por isso a função da carta do topo se chama `topCard()`, já que `top` é reservado.
- Código executado no carregamento só pode chamar funções de arquivos carregados antes. Ordem: `js/mesa/dados.js`, `regras.js`, `cartas.js`, `adversarios.js`, `visao.js`, `js/turbo.js`, `data.js`, `arte.js`, `effects.js`, `cards.js`, `ui.js`, `rede.js`.
- **A mesa não usa nada da página:** nada de `document`, `$`, `window`, `render()`, `CFG`, `RM`, `sfx`, `VIS` ou `who` em `js/mesa/`. Ela fala com a tela só por `emit` (`atualiza` redesenha; `cores` troca as cores do Portal) e recebe da página as opções em `OPCOES` (`semAnimacao`, `acelerada`, `controles`). O `npm run test:mesa` pega na hora qualquer uso da página que escapar.
- O three.js vem do cdnjs (r128) com `defer`, e a fonte vem do Google Fonts. Se o three.js não carregar, o jogo usa os efeitos 2D.

### PWA / service worker
- HTML, CSS e JS usam rede primeiro e caem no cache quando offline. Por isso as atualizações chegam sozinhas.
- Cada página fica guardada no próprio endereço (o jogo em `./index.html`, o teste em `lan-teste.html`); offline, uma página desconhecida abre o jogo.
- Ao **criar ou renomear arquivos**, adicione-os à lista `CORE` do `sw.js`.
- Ao **trocar ícones**, aumente a versão em `const CACHE='unotfm-vN'`.

## Como testar

```bash
python -m http.server 8000    # na raiz do repositório (no Windows é "python"; "python3" abre a Microsoft Store)
```
- Abra `http://localhost:8000` (no app do Claude, a configuração `unotfm` em `.claude/launch.json` faz isso).
- Teste automático: `npm test` (3 partidas) ou `npm test -- 10`; `--ver` abre o navegador visível (usa o Chrome/Edge instalado); `--vel=5` encurta as esperas do jogo em 5x para rodar mais rápido; `--regras=mess,weather` joga no modo Personalizado só com essas regras; `--semente=N` fixa os sorteios (cada partida mostra a semente dela, mas como o jogo corre em tempo real a partida pode se separar depois dos primeiros lances). O script `tests/smoke.mjs` sobe o próprio servidor, joga clicando em cartas `.card.ok`, Comprar, UNO e nas janelas de escolha, e falha se houver `pageerror` ou travamento (captura em `tests/travou-N.png`). Na primeira vez: `npm install` e `npx playwright install chromium`.
- **Teste de cada carta:** `npm run test:cartas` (uns 15 s). Para cada carta especial (jogada por um adversário e por você), cada regra e algumas partidas inteiras, monta a situação com semente fixa, avança pelo relógio virtual do turbo e compara mãos, mesa, vez, marcas dos jogadores e o registro completo com `tests/cartas-resultados.json`. Na sua vez, o teste joga a primeira carta jogável e resolve as janelas pelo `autoResolve`. **Toda refatoração precisa manter esses resultados idênticos.** Quando a mudança no jogo é de propósito, confira as diferenças que ele mostra e grave de novo com `npm run test:cartas -- --gravar` (`--so=carta:dice` roda só os cenários com esse texto no nome).
- **Mesa no Node:** `npm run test:mesa` (2000 partidas só com adversários em uns 4 s, com regras sorteadas; `-- 10000`, `--regras=mess,dice` ou `nenhuma`, `--semente=N`, `--dif=master`). Carrega `js/mesa/*.js` com o módulo `vm`, sem página, num relógio virtual; falha com erro ou partida travada e mostra estatísticas (vitórias por cadeira, regras com partidas mais longas e mais curtas).
- **Ações e rede:** tudo o que a pessoa faz passa por `acao({t:...})` na tela, que chama `agir(pi,ação)` na mesa (jogar, principal, sineta, pegar, desafiar, trocarMao); a mesa confere se a ação vale. Na rede de mentira (`js/rede.js`), o anfitrião roda a mesa e manda ao convidado cada evento girado (`eventoPara`) com a visão dele (`visao`: sem mãos dos outros, monte, memória dos adversários, blefe do +4 nem semente); o convidado manda as ações e as respostas dos pedidos, que o anfitrião confere. **Rede de mentira:** `npm run test:rede` (duas abas jogando sozinhas; `-- 5`, `--regras=trade,simon` ou `mix`, `--ver`); para jogar à mão, abra `http://localhost:8000/?rede=anfitriao` e `?rede=convidado` em duas abas.
- Mostruário: `npm run test:mostruario` (envia desenhos de teste, confere avisos e se as imagens continuam depois de recarregar; capturas em `tests/mostruario-*.png`).
- Teste de rede local: `npm run test:lan` (anfitrião e dois convidados no Chromium, pelos códigos em texto; `--sem-camera` testa os endereços escondidos em nomes `.local`) e `npm run test:lan-camera` (lê os QR codes por uma câmera falsa).
- Confira se não há `pageerror` e se a partida não trava. Uma boa verificação de travamento é ver se status, mão e cadeiras ficam mais de 15 s sem mudar.
- Os efeitos 3D precisam de WebGL. No headless, use `--use-gl=swiftshader` e sirva o `three.min.js` localmente se o CDN não estiver acessível.
- Para mudanças visuais, tire capturas da área afetada (viewport 390×800, celular).

## Conceitos importantes do código

- **Desenho das cartas** (`js/arte.js`): os símbolos são do Gustavo e iguais em todos os baralhos; o baralho (cores, textura, moldura, verso) pode mudar.
  - Cada símbolo tem uma chave (`'7'`, `'skip'`, `'trade'`…) e um nome de arquivo em português (`7.png`, `bloqueio.png`, `troca.png`; veja `SIMBOLOS`). Toda face de carta sai do `faceHTML`, que usa `sim(chave, reserva)`: o desenho, se houver, ou o símbolo de hoje (texto ou emoji).
  - Os desenhos são PNG de uma cor só usados como molde (`mask-image`) e pintados com a cor do texto da carta, então funcionam em qualquer baralho e no outro lado do Portal. O coringa desenhado é preenchido com as 4 cores; os combos juntam dois símbolos.
  - As camadas do baralho são variáveis do CSS (`--carta-camadas`, `--carta-mistura`, `--verso`, `--carta-borda`, `--sim-cor`, `--carta-raio`…) aplicadas pelo `aplicarArte()`; as cores valem só no lado normal. Sem nada definido, o visual é o de sempre (conferido pixel a pixel).
  - No jogo ainda não há desenhos; por enquanto eles só aparecem no mostruário, que guarda as imagens no aparelho (IndexedDB).
- **Sineta 🛎️ no lugar de "UNO"** (marca da Mattel; o DOS também é). O botão `#unoBtn` mostra 🛎️, o som `bell` é um toque (dois com a regra Duas!, no mesmo tom), perto do agudo e com tom e intervalo um pouco sorteados, e a regra `dos` se chama "Duas!". Não use as palavras UNO nem DOS nos textos do jogo.

- **Eventos (regras → tela):** as regras (`js/mesa/`) não desenham nem tocam som. Elas chamam `emit({t:'fx'|'selo'|'som'|'voa'|'3d'|'portal'|...})`, só com dados (lugares são número da cadeira, `'mesa'` ou `'monte'`; plateia em `a`, padrão todos), e a tela executa em `TELA(ev)` no `ui.js`. Efeito novo numa regra: crie um evento e trate-o no `TELA`, em vez de chamar `fx`, `sfx`, `ghost` ou mexer na página. Quando a regra espera uma animação, ela conta o próprio tempo (`setTimeout(…,anim(ms))`; `anim` é 0 no turbo e com movimento reduzido) e a tela só anima. Ainda sobram na regra: a renderização (`render()`), o estado visual guardado em `S` (`newIds`, `handFrom`…, etapa D), os pensamentos e janelas de escolha (etapa E) e algumas durações que vêm da tela (etapa F).
- **Textos por quem vê:** as regras não sabem quem está olhando. Nos textos delas (registro, `fx`, avisos), use `J(pi)` para o nome do jogador (vira "Você" para ele mesmo) e `V(pi,'Você compra',J(pi)+' compra')` quando a frase muda; nunca `who()` nem `pi===0?…`. As marcas guardam o nome do jogador e a tela traduz com `texto(s)` (já feito no `TELA`, no registro, no `annText` e em quem adicionou cada regra). O registro e o histórico das jogadas são montados pela tela (eventos `registro`, `histInicio`, `jogada`, `fimJogada`). Evento só para um jogador: `a:pi` (no solo, a tela mostra só os de `a` 0 ou sem `a`).
- **Estado:** `S` guarda a partida atual e `R` as regras ativas do lado atual. O que é só da tela fica no `VIS` (`ui.js`: cartas novas na sua mão e de onde vieram, compras dos adversários a animar, origem da carta jogada, inclinação na mesa com `rotDe(c)`, anúncio, faixa de regras, registro e histórico); as regras nunca mexem nele, só mandam eventos (`recebe`, `compra`, `origem`, `anuncio`…). O número das cartas (`id`) é sorteado por um gerador próprio que segue a semente sem mexer no `rng()`. `CFG` é a configuração salva. `rulesForMode()` monta `R` a partir do modo.
- **Modos:** Clássico (sem regras), Mix de Regras (chave `poker`: cada jogador escolhe uma regra **antes** da distribuição) e Personalizado. Clássico e Mix usam sempre 3 adversários e 7 cartas.
- **Dificuldades:** Fácil, Normal, Difícil e **Mestre** (oculto). O Mestre é desbloqueado tocando 7 vezes seguidas em "Difícil", fica salvo em `unotfm-solo-master` e não mostra nenhuma indicação antes disso. Ele usa memória (`S.mem`: cores que faltam a cada jogador, última cor jogada, cartas já saídas) sem nunca ver mãos ocultas.
- **Regras:** `RULES` (grupo, chave, nome, descrição). As cartas especiais ficam em `SP` (nome, ícone `g`, descrição, `deck` com cores e quantidades do `deck.lua`, `rule` quando a chave da regra é diferente, e `hide`). Os conflitos ficam em `CONFLICT_PAIRS`. O Contra-ataque também não combina com a defesa desativada da configuração (`NOU_OFF`). As regras de defesa (`DEF_RULES`, "Defesa - …") substituem a defesa da configuração (use sempre `comboMode()`, nunca `R.combo` direto), só saem no Mix e na Carta da Regra (nunca a igual à configuração) e não aparecem no Personalizado. Os ícones das regras (`RICON` + `SP.g`) **não podem se repetir**.
- **Quem controla cada cadeira:** cada jogador tem `p.ctrl` (`'tela'`, a pessoa deste aparelho; `'bot'`, adversário do computador; mais tarde `'rede'`). Nas regras, nunca `pi===0` nem `p.bot`: use `deBot(pi)`/`humano(pi)`. Toda jogada passa por `jogar(pi,carta)` (anúncio, cor) e `termina()`; a vez é pedida com `pedirJogada(pi)` (o adversário pensa e joga; a pessoa usa a tela). Toda escolha é um pedido, `pedir(pi,{tipo:'cor'|'alvo'|'carta'|'regra'|'memoria', responde, bot(), tela:{titulo,sub,opcoes()}})`, respondido por `CONTROLES.bot` (`js/mesa/adversarios.js`, com o balão de pensar) ou `CONTROLES.tela` (`ui.js`, pelas janelas). Cartas especiais com escolha usam `pedeEspecial` (`js/mesa/cartas.js`). Ainda são do jogador 0 por enquanto: a sineta e o Pegar (botões da tela), a Segunda Chance (`S.mull`) e a Dança das Cadeiras (as pessoas não trocam de lugar).
- **Anúncio antes do efeito:** toda carta de ação primeiro pousa na mesa (`announce`) e só depois aplica o efeito.
  - Misteriosa e Clonagem giram e se transformam. Coringas giram ao ser pintados.
  - Os adversários mostram a decisão num balão perto da cadeira (`botThink`).
- **Portal:** são dois lados independentes. `SIDE_KEYS` e `PLAYER_KEYS` definem o que é separado por lado, e o sentido do jogo é compartilhado. O outro lado tem cores rosa, laranja, ciano e roxo, borda e símbolos pretos e coringas brancos. A mesa não muda de cor. Azul e Verde só vale no lado normal.
- **Terminar e descobrir vencedor (turbo):** depois que você é eliminado, o botão principal joga o resto da partida na hora (`turboStart`/`turboRun`/`turboStop` no `js/turbo.js`).
  - **Sorteios:** tudo o que muda a partida usa `rng()` (`rand`, `shuffle` e os tempos e decisões dos adversários), que segue a semente sorteada em cada `newGame` (`S.semente`). `Math.random()` (e `randVis`) só no que é visual: inclinação das cartas, frases, dado girando, partículas, "Azul?/Verde?". Misturar os dois quebra o teste das cartas.
  - **Relógio da mesa:** nas regras, espere com `agendar(fn,ms)` e leia a hora com `RELOGIO.agora()` (`js/mesa/regras.js`), nunca `setTimeout`/`Date.now()` direto; o `setTimeout` fica para a tela. As durações que a regra espera são da própria regra (`tempoSome`, Mágica, dado de 1450 ms, balão de pensar em `botThink`, `comecaMix`), e a tela só anima nesse tempo. As pausas que seguram os adversários saem do `emit` (`pausa`, `fx`, `tada`), não do desenho.
  - Todo `setTimeout` passa pelo invólucro do `js/turbo.js` (`TB`). No turbo, os timers vão para uma fila de tempo virtual e `Date.now()` segue esse tempo. Não use `setTimeout` para esperar algo do tempo real (animação, evento) sem pensar no turbo: o Portal, por exemplo, chama `finish()` nas animações quando `S.turbo`.
  - Com `S.turbo`, `render()`, `fx()`, `stampOn()` e `toast()` não desenham nada. Depois de `TURBO_MAX` vezes, vence quem tem menos pontos na mão (`pointsLeader()`).
- **Eliminação por erro** (ser pego sem tocar a sineta, blefe desafiado, desafio errado) **só acontece com a Morte súbita**. Fora dela:
  - Pego sem tocar a sineta compra 2.
  - O desafio vale só para o **último** +4/+99. Se foi blefe, o blefador compra as cartas da carta dele e o desafiante compra o restante acumulado.
- **+99:** quem precisa comprar as cartas dele (inclusive no desafio) é eliminado na hora (`drawn99`), sem comprar de verdade: só uma enxurrada de cartas voa do monte até ele antes. Só escapa quem não comprou por causa da Nevasca ou do Gelo.
- **Sentido do jogo:** filas de chevrons no topo da mesa (sentido em que a vez passa pelos adversários) e embaixo (oposto), movidas por `chevLoop()`. Ao inverter, `chevFlip()` vira na hora e acelera.
  As setas (`#chevs`) ficam fora da `.table`, na mesma linha da grade, com `z-index` 25 (acima das partículas 3D, 24). Efeitos que voam sobre a página usam 26 a 28, os avisos 29 e as janelas 30.
- **Maldição do espinho:** qualquer compra (`drawOne`) marca o jogador (`thornHit`, `p.thorned`) sem dar a carta, e ele é eliminado no fim do efeito (`massCheck`, `checkLimits` ou `endTurn`). A Morte súbita só elimina quem precisa comprar pelo monte ou erra.
- **Confusão:** a jogada aleatória pode ser qualquer carta (`canPlay(p,c,true)`), mas tranca, Final Limpo, Semáforo e compras acumuladas continuam valendo.
- **Tempestade:** quando a cor ativa muda, um adversário aleatório de quem mudou compra 1 (raio do Trovão). O selo ⛈️ aparece, na sua vez, nas cartas jogáveis que mudam a cor. O raio que cai em você mira nas cartas compradas (`thunderDraw`).
- **Mágica** (chave `steal`) mostra as cartas como a Clarividência (`showCards`). A carta transformada guarda a forma original em `c.tm`, que `restoreCard` desfaz.
- **Banimento** (`vanishCards`): as cartas aparecem e já saem no mesmo movimento. Uma de cada vez, em sequência rápida, as cartas começam retas, vão se inclinando de leve e somem no fim: as do adversário caem da cadeira e as suas sobem da mão, na mesma velocidade. As cartas mostradas pelos adversários têm o tamanho das cartas da mesa (`shownW`).
- **Nevasca e Gelo:** ninguém compra. Os +2/+4 continuam acumulando, e quem não se defende perde a vez sem comprar. No desafio:
  - Se foi blefe, o desafiante segue jogando.
  - Se a jogada era legal, o desafiante perde a vez.
  - Perder a vez por penalidade não conta como "passar" para encerrar a Nevasca.
- **Compra:** depois de comprar, o jogador pode jogar **qualquer** carta jogável ou passar.
  - Compra e Passa passa a vez ao comprar.
  - Compra Rápida joga a carta comprada sozinha, mesmo que não combine (exceto a Bomba).
  - Compra Implacável compra 1 por vez (2 com a Bigorna) e não deixa passar enquanto não houver carta jogável.
- **Reembaralhar:** `restoreCard`/`returnable` devolvem as cartas à forma original (coringa preto, Misteriosa e Clonagem desfeitas, cor de antes da Tinta, Batata vermelha). Cartas com `extra: true` (Misteriosas do Presente, cópias da Partilha, Tesouro) não voltam ao baralho.
- **Status:**
  - `seatStatus(i)` para jogadores: selo na borda de baixo da cadeira e o seu selo acima da mão.
  - `tableStatus()` para a mesa: selos abaixo do baralho.
  - `infoPopup()` abre a janela explicativa com seta. Essas janelas não têm botão Ok e fecham ao tocar em qualquer lugar.
  - Segurar uma carta da mão por 0,5 s (`showCardInfo`) abre essa janela com o que a carta faz e a explicação de cada selo. Cartas numéricas só abrem se tiverem selo, e segurar nunca joga a carta.
  - Segurar a carta da mesa (`showTopInfo`) abre a mesma janela com o nome e a descrição dela (numéricas não abrem). Tocar normalmente abre o histórico.
  - O Dado, a Maldição e as Cartas de Clima listam as possibilidades, uma por linha (`ruleListHtml`). Durante o jogo a lista aparece sempre; no menu de regras, só ao tocar em "Ver ..." (`RULE_MORE`).
- **Mão Colorida:** com a regra ativa, faixas das quatro cores passam na diagonal, bem fracas, no fundo da cadeira (classe `shiny`, aparece também na Neblina e na Camuflagem) ou da sua área de jogo.
- **Tesouro:** quem joga descarta as cartas que sobraram, uma de cada vez, e só então vence.
- **Escala:** o tamanho de tudo vem de `--u` (no `:root` do `style.css`), que vale 1px num celular de 390×800 e acompanha a largura e a altura da tela. `--cw` (largura da carta) e o `font-size` da raiz derivam dele, e as medidas do CSS estão em `rem`. Use `rem` (ou `var(--cw)`) em vez de `px` em medidas novas; `px` só para bordas finas (até 3px).
  Opção **Altura da mesa** (`CFG.compact`, padrão Compacta): em telas altas e estreitas (`max-aspect-ratio:10/19`) a mesa tem altura máxima de 380 `--u` e a sobra fica entre a barra do topo e as cadeiras. A classe `compact` no `<html>` é posta por `applyCompact()`; em outras proporções as Configurações avisam que a opção não muda nada.
  O centro da mesa (`.arena`) reduz o `--cw` para caber na altura da mesa (`.table` é um container query), então o +2/+4 nunca é cortado. As partes da página têm linha fixa na grade do `body`.
- **Telas grandes:** `@media (min-width:900px) and (min-height:560px)` no fim do `style.css` troca a referência para 1440×900 (cartas maiores), numa coluna central. Com mouse, passar sobre uma carta da mão, um selo da mesa, um selo de jogador ou o seu selo abre a mesma janela do toque.
- **Cartas na mão:** os selos no topo (`cardBadges`) indicam por que a carta pode ser jogada (🛡️ defesa, ✂️ corte, 📚/🔢 combo, ↕️ vizinho, 🔥 inferno, ☀️+1, 💯, 🌼, 👢, ⛈️) ou o que a bloqueia, com selo vermelho (🔒, 🧼, 🚦, ↕️). A carta bloqueada não tem borda vermelha, só o selo.

## Removido de propósito (não reintroduzir sem pedir)
- Regras baseadas em tempo: Rápido, Tempo reduzido, Limbo, Mais regras e a maldição de 3 segundos. Funcionam mal no solo, porque só o humano sofre pressão de tempo.
- Carta do Paradoxo.
- O código de todas essas regras saiu do jogo (etapa A do multiplayer); as configurações antigas que ainda as tenham ligadas são limpas ao carregar (`data.js`).
- Regras Sem limite e Modo rigoroso. Também não existe mais limite geral de cartas na mão (só a Sobrecarga limita).
- Regras de bots específicos (Drekkemaus, Charlotte etc.). O código também foi apagado (os nomes dos adversários continuam em `BOTNAMES`).
- Botão "Regras" no topo. As regras são vistas tocando nos ícones da faixa acima das cadeiras dos adversários (`#rulestrip`).

## Ideias ainda não feitas
Xadrez Maluco, Imitação, Jogada Secreta, Quente e Frio. A Emoção e o Meep dependem do Transformice e não entram.
