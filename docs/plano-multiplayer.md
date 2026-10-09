# Plano: do solo ao multiplayer

Aprovado em 07/10/2026 (versão 2). Versão 2.1: acrescentada a seção 6, segurança no online.

Andamento (09/10/2026): fases 0, 1 e 1.5 feitas no código. Falta testar a sala nos celulares (roteiro na seção 4.3.2);
o iPhone ainda não foi testado. Próxima: fase 3 sem login (veja a decisão abaixo da tabela de fases e a proposta na
seção 9).

Objetivo final: partidas online com salas privadas, fila pública e ranking, login e progresso salvo, e o jogo
publicado também na Play Store e na App Store. O solo offline continua existindo.

## O que mudou nesta revisão

Conferi cada afirmação da versão 1 contra o código. Principais correções e acréscimos:

1. **As regras não estão só no motor.** Também há regras em:
   - `ui.js`: a jogada do humano, a troca de mão (mulligan) e as condições da sineta e do Pegar;
   - `effects.js`: o raio da Tempestade compra cartas;
   - `data.js`: funções auxiliares.

   Além disso, a jogada do humano e a do adversário seguem **dois caminhos diferentes**. Unificar os dois é a parte mais arriscada da fase 1 e agora tem etapa própria.
2. **O número de cada carta entrega qual carta ela é.** As cartas são numeradas na ordem em que o baralho é montado, antes de embaralhar. Quem souber o número de uma carta escondida consegue deduzir qual é. No multiplayer, a numeração precisa ser sorteada.
3. **O Mestre não "joga limpo" com a quantidade de cartas.** Ele enxerga a quantidade real de cartas dos outros mesmo com Neblina e Camuflagem. Não vê as cartas, só a quantidade. As outras dificuldades respeitam a Neblina e a Camuflagem. Virou a decisão 8.6.
4. **A semente do sorteio precisa ser secreta.** Quem souber a semente consegue prever o baralho inteiro.
5. **A pausa precisa ser respeitada pela mesa, não só pela tela.** Senão, os adversários jogam no meio das animações.
6. **Mais código antigo para remover.** Além dos adversários com regras próprias, ainda existe código do Paradoxo, do Rápido, do Tempo reduzido, do Limbo, do Mais regras e do Modo rigoroso.
7. **Os testes vêm primeiro.** Proponho uma etapa 0 com sorteio previsível e testes de cada carta, para conferir que nenhuma etapa muda o jogo.
8. **Rede local:**
   - uma prova de conceito antes de tudo, porque o iPhone sem internet é o ponto mais incerto;
   - além de ler o QR code, o jogo precisa gerá-lo;
   - as bibliotecas ficam no próprio site, para funcionar offline;
   - quem cai precisa ler o QR code de novo;
   - os aparelhos conferem se estão na mesma versão do jogo.
9. **Hospedagem:**
   - `jogo.dominio` e `api.dominio` não são a "mesma origem", como eu tinha escrito;
   - o plano gratuito do Supabase pausa o projeto depois de 7 dias sem uso;
   - atualizar o servidor encerra as partidas em andamento.
10. **Lojas:**
    - contas novas na Play Store precisam de um teste fechado com 12 pessoas por 14 dias antes de publicar;
    - a Apple exige denúncia e bloqueio de jogadores quando há partidas com desconhecidos.
11. Correções menores: a ação `uno` virou `sineta`, o texto "E a G" estava truncado e a tabela de contagem foi refeita.

---

## Ordem das fases

| Fase | O que entrega | Servidor? |
|---|---|---|
| **0. Testes** | Sorteio previsível e testes de cada carta | Não |
| **1. Separar regras e tela** | O mesmo jogo, com as regras isoladas da parte visual | Não |
| **1.5. Rede local** | Partida na mesma Wi-Fi, um aparelho como anfitrião | Não |
| 2. Login e progresso | Conta e estatísticas na nuvem (ainda no solo) | Supabase |
| 3. Salas privadas online | Jogar com amigos por código ou link | Fly.io + Supabase |
| 4. Fila casual | Partidas com desconhecidos, sem pontos | Fly.io + Supabase |
| 5. Ranqueada | Temporadas, ligas e placar | Fly.io + Supabase |
| Lojas | App na Play Store e na App Store | Depois da fase 2 |

**Decisão de 09/10/2026: a fase 3 vem antes da 2, sem login.** As salas privadas online não dependem de conta: cada
pessoa recebe um token da própria cadeira, e a mesa roda no servidor (mais seguro que a rede local). O login continua
necessário para a fila, o ranking e as lojas, e entra depois. Proposta detalhada na seção 9.

A **prova de conceito da rede local** (seção 4.1) é pequena e independente. Dá para fazer antes da fase 0, para
saber cedo se o caminho escolhido funciona no iPhone.

Este documento detalha as fases 0, 1 e 1.5 e traz o que já dá para decidir sobre a página e as lojas.

---

## 1. Como o jogo funciona hoje (diagnóstico)

Hoje as regras, a tela (animações, sons, textos e janelas) e o tempo (esperas para as animações) estão misturados.
No multiplayer, os três precisam ficar separados.

**Contagem nos arquivos do motor** (`engine.js` / `cards.js` / `bots.js`):

- Efeitos visuais e sons no meio das regras (`fx`, `sfx`, `stampOn`, `toast`, `ghost`, `FX3D` e afins): 64 / 131 / 3
- Textos montados nas regras com o nome de quem jogou (`who()`): 32 / 84 / 0
- "Esse jogador é você?" (`pi===0` e parecidos): 22 / 63 / 0
- Acesso direto à página (`$()`, `document`): 36 / 67 / 0
- `render()`: 20 / 26 / 3
- `setTimeout`: 10 / 56 / 3
- Sorteios (`Math.random`, `rand`, `shuffle`): 22 / 67 / 14

**Regras fora do motor:**
- **`ui.js`:** `humanPlay`, `finishHuman`, `humanMain`, `humanUno` (quando a sineta vale), `humanCatch` (quando dá para pegar) e `mulligan` (devolve a mão ao baralho e compra outra).
- **`effects.js`:** `thunderDraw` faz o jogador comprar cartas (o raio da Tempestade e do Trovão).
- **`data.js`:** funções como `drawAmt`, `curseOn`, `noDraw`, `alive` e `nextIdx`, e o `hold()`, que hoje já funciona como uma pausa para os adversários.

**Dois caminhos para a mesma jogada:**
- **Humano:** `humanPlay` → `announce` → janela de cor → `finishHuman` → `playCard` → `humanAsk` (janelas de alvo e de carta).
- **Adversário:** `botPlay` → `announce` → `botPlayNow` → `botThink` → `playCard` → `botDefer`.

Os dois têm diferenças sutis, por exemplo:
- a última carta coringa não pede cor;
- a Paz;
- a carta já pousada (`preLanded`);
- o tempo de anúncio;
- depois de comprar sem ter o que jogar, o humano passa sozinho em 0,7 s.

**"Você" é sempre o jogador 0, e isso vai além dos textos:**
- só o jogador 0 pode trocar a mão (`S.mull`);
- só ele joga sozinho na Confusão (`autoHuman`);
- só ele recebe as janelas;
- só os adversários pegam quem esqueceu a sineta (`scheduleCatch`) e pedem a sineta sozinhos (`afterOneCard`).

**O estado `S` mistura o jogo e a tela.** Por exemplo: `newIds`, `botDraw`, `animPlay`, `handFrom`, `seatFlip`,
`lastTop`, `annText`, `fxUntil` e a inclinação das cartas na mesa (`rot`, sorteada até dentro do `mk()`).

**Vazamentos de informação que hoje não importam:**
- **Números das cartas.** `mk()` numera as cartas na ordem em que o baralho é montado, antes de embaralhar. Pelo número, dá para deduzir qual é a carta.
- **Quantidade de cartas escondida.** O Mestre vê a quantidade real de cartas dos outros mesmo com Neblina e Camuflagem: no `seenLen`, na avaliação da Troca e do Carrossel (`masterBonus`) e no desafio (`masterChallenge`). As outras dificuldades respeitam o "?". Nenhum adversário vê as cartas escondidas.
- **Revelações.** Cada uma precisa definir para quem vale: Clarividência, Mágica, Partilha, Revelação, Banimento e desafio. No solo só existe um humano, então isso nunca fez diferença.

**Código antigo, que nada mais aciona:**
- adversários com regras próprias (`BOTRULES`, `ab()`, `charlotteFx`, `icemiceHook`, `immune`);
- Paradoxo (`case 'paradox'`, `CARRY`);
- Rápido (`startFlash`);
- Tempo reduzido (`timeT`, `timeUp`);
- Limbo (`limboT`, `S.limit`);
- Mais regras (`addT`);
- Modo rigoroso.

**O que já ajuda:**
- O `TB` (todo `setTimeout` passa por ele) e o turbo provam que as regras rodam sem esperar a tela.
- Só o Portal depende do fim de uma animação para continuar (`onfinish`).
- O `npm test` joga partidas inteiras e detecta travamentos.

---

## 2. Como o jogo deve ficar (arquitetura alvo)

```
 SALA   jogadores, cadeiras, configuração, reconexão, rodadas do torneio, tempo de cada jogador
  │
  ▼  ações                               eventos (filtrados) + pedidos
 MESA   regras da partida, estado G,  ─────────────────────────────▶  TELA de cada jogador
        relógio próprio, sorteio                                       (anima, toca sons, abre janelas)
        com semente secreta
```

- **Mesa:** só as regras de uma partida. É um objeto com relógio próprio, não uma função "pura":
  - recebe ações e emite eventos e pedidos;
  - agenda os próprios passos no relógio;
  - aproveita o jeito do código de hoje (continuações com espera), só trocando o `setTimeout` pelo relógio da mesa. Reescrever tudo como função pura seria mais elegante, mas o risco é muito maior.
  - roda igual no navegador (solo), no aparelho do anfitrião (rede local) e no servidor (online);
  - não toca na página, não toca som e não sabe quem é "você".
- **Sala:** fica acima da mesa e não existe no solo. Cuida de:
  - quem está em cada cadeira;
  - as regras escolhidas;
  - o tempo de cada jogador;
  - quem caiu e voltou;
  - o adversário do computador que assume uma cadeira;
  - as várias rodadas do Torneio e da Sobrevivência (hoje no `TOUR`, global).
- **Tela:** recebe os eventos em fila e anima. É ela que escreve "Você comprou" ou "Jingle comprou".
  - **Cada tela se vê na cadeira 0.** Ela gira os números das cadeiras na entrada (cadeira 3 da mesa = cadeira 0 da tela, e assim por diante), e o `ui.js` continua supondo que 0 é você.
  - O sentido do jogo não muda com o giro.
- **Adversários do computador:** respondem aos mesmos pedidos que um humano, olhando só a visão da cadeira deles.
  Rodam onde a mesa roda.

### 2.1 Visão de cada jogador

`visao(G, jogador)` devolve só o que esse jogador pode saber:
- a própria mão;
- a quantidade de cartas dos outros (ou "?" com Neblina e Camuflagem);
- a mesa, o histórico, as regras ativas e a quantidade de cartas no monte;
- a carta do topo do monte, com a Revelação;
- as cartas reveladas para ele.

**Cartas escondidas não têm número na visão dos outros.** O número das cartas é sorteado a cada partida, e uma carta
só ganha número na visão de alguém quando ele pode vê-la.

**Plateia de cada revelação** (no solo, sempre foi "você"). Sugestão:

| Revelação | Quem vê |
|---|---|
| Clarividência, Banimento, Revelação | Todos |
| Mágica | Todos veem, por um instante, a carta transformada de cada um, como hoje |
| Partilha | Cada cópia só para quem a recebeu |
| Rastrear e as compras | Só quem comprou |
| Desafio do +4 | Todos, como hoje: se foi blefe, a carta que prova aparece |

### 2.2 Ações (jogador → mesa)

As cartas são indicadas sempre pelo número (`id`), nunca pelo objeto.

| Ação | Quando |
|---|---|
| `jogar {id, cor?}` | na vez, no combo ou depois de comprar |
| `comprar` | na vez |
| `passar` | depois de comprar, no combo ou na Nevasca |
| `sineta` | ao ficar com 1 carta (2 com a regra Duas!) |
| `pegar {alvo}` | enquanto alguém está sem tocar a sineta |
| `desafiar` | contra o último +4 ou +99 |
| `entrar {id}` | Jogar Junto, fora da vez |
| `escolher {pedido, valor}` | responder a um pedido |
| `mulligan` | no início, com a regra |

### 2.3 Pedidos e janelas (mesa → jogadores)

`pedido {id, jogador, tipo, opções, limite}`. A mesa só espera por pedidos. Os tipos são:
- **`jogada`:** a própria vez, com as cartas jogáveis e se pode comprar ou passar;
- **`cor`;**
- **`alvo`:** Troca, Doação, Teia, Batata e Roubo;
- **`carta`:** Desejo, Banimento e Rastrear;
- **`memoria`:** repetir a sequência de cores;
- **`regra`:** Carta da Regra e Mix de Regras.

Quem responde depende de quem está na cadeira: a tela (humano), o `bots.js` (adversário) ou a rede (pessoa em outro
aparelho). Se o tempo acabar, um adversário do computador decide.

**Pedidos ao mesmo tempo:** no Mix de Regras, cada humano escolhe a sua regra junto com os outros, e não um de cada
vez como hoje.

**Janelas de reflexo:** a sineta, o Pegar e o Jogar Junto não são pedidos. São janelas que abrem e fecham com eventos
(`{t:'janela', tipo:'pegar', alvo, aberta:true}`). Vale a primeira ação que chega à mesa.

### 2.4 Eventos (mesa → telas)

Cada chamada visual de hoje vira um evento com dados, sem texto pronto. **Todo evento tem plateia:**
- **todos:** por exemplo, "jogou o 7 azul";
- **um jogador:** por exemplo, as cartas que você comprou;
- **resumido para os outros:** por exemplo, os outros veem "comprou 2", sem as cartas.

| Hoje | Evento |
|---|---|
| `fx('⊘', who(v)+' perdeu a vez', …)` | `{t:'perdeVez', p:v}` |
| `stampOn(pi,'🌵',…)` | `{t:'selo', p:pi, ic:'espinho'}` |
| `ghost(targetRect(a), targetRect(b))` | `{t:'cartasVoam', de:a, para:b, n:1}` |
| `sfx('dice')` + dado rolando | `{t:'dado', p:t, n:4}` |
| `hold(900)` | `{t:'pausa', ms:900}` |

O histórico e o registro da partida passam a ser montados pela tela a partir dos eventos que ela recebeu. Assim
ninguém vê no histórico o que não devia.

### 2.5 Tempo

- **A pausa vale para a mesa e para a tela.** Quando um efeito precisa de tempo (anúncio, dado, Portal, Dança das Cadeiras), a mesa espera no relógio dela e emite `{t:'pausa', ms}`.
  - A tela usa essa pausa para segurar a fila.
  - É o que o `hold()` faz hoje para os adversários, só que valendo para todo mundo.
- **O relógio da mesa:** real no solo, no anfitrião e no servidor; virtual no turbo (o `TB` de hoje).
- **O turbo só existe no solo.** No multiplayer, quem é eliminado assiste no ritmo normal.
- **O Portal** deixa de esperar o fim da animação e passa a esperar uma pausa de duração fixa.

### 2.6 Sorteio com semente

Todo sorteio das regras usa um gerador com semente (`rng()`). Os sorteios só visuais (inclinação das cartas, frases da
Mágica, faces do dado rolando, fumaça) continuam no `Math.random`. Se usassem o mesmo gerador, qualquer mudança
visual alteraria a partida.

- **A semente é secreta.** Ela fica na mesa (servidor ou anfitrião) e só é revelada depois da partida, se for preciso auditar.
- **Para repetir uma partida**, basta guardar a semente e a lista de ações, com o momento de cada uma no relógio da mesa.
- **Isso permite:**
  - repetir um travamento do `npm test`;
  - rever jogada a jogada uma partida ranqueada denunciada;
  - rodar milhares de partidas iguais para comparar.

### 2.7 Alternativa considerada e descartada

Cada aparelho poderia rodar a partida inteira com a mesma semente, trocando só as ações. Daria menos trabalho, mas
todos os aparelhos teriam todas as mãos na memória. Entre amigos não faria diferença, mas impossibilitaria o online
ranqueado. Como o objetivo final inclui o ranking, a mesa com autoridade é o caminho.

---

## 3. Fases 0 e 1 em etapas (o jogo nunca fica quebrado)

Cada etapa termina com o jogo igual para o jogador, os testes passando e um commit próprio, que vai direto para a
`main`. Pedidos de ajustes no jogo continuam sendo atendidos entre uma etapa e outra.

Tamanho de cada etapa: **P** (pequena), **M** (média), **G** (grande).

**Fase 0: testes que tornam a refatoração segura**

- **0. Semente e testes de cada carta (M)**
  - Os sorteios das regras passam a usar `rng()`, e o `npm test` ganha `--semente=N`.
  - Um teste novo, rodando no navegador pelo Playwright, monta uma situação para cada carta especial e cada regra:
    - joga a carta;
    - avança o tempo pelo relógio virtual do turbo;
    - compara o resultado (mãos, mesa, vez e registro) com um resultado guardado.
  - Daqui em diante, toda etapa precisa manter esses resultados idênticos.
  - **Feito:** `rng()` (sfc32) no `data.js`, `npm test -- --semente=N` e `npm run test:cartas`, com 173 cenários (cada
    carta jogada por um adversário e por você, cada regra e três partidas inteiras), em uns 15 s. Cada cenário roda duas
    vezes para confirmar que se repete, e uma mudança proposital numa carta foi detectada.

**Fase 1: separar regras e tela**

- **A. Remover código antigo (P)**
  - Sai tudo o que está na lista "Código antigo" do diagnóstico.
  - **Feito:** saíram cerca de 150 linhas (inclusive a barra do Rápido e o som do Paradoxo), com os 173 cenários do
    teste das cartas idênticos.
- **B. Eventos (M)**
  - Os efeitos visuais e sons das regras (incluindo o `thunderDraw` e o `hold`) passam a sair por `emit({...})`, com plateia.
  - Por enquanto, o `emit` executa o efeito na hora.
  - **Conferir:** testes de carta idênticos e as mesmas animações.
  - **Feito:** cerca de 200 chamadas viraram eventos (`emit`, tratados pelo `TELA` do `ui.js`). Portal, Chuva, Carta da
    Regra, Maldição e Dado deixaram de esperar o fim da animação: a regra conta o próprio tempo e a tela só anima. O teste
    das cartas passou a guardar também os eventos de cada cenário. Ficaram para depois: `render()` e o estado visual em
    `S` (etapa D), pensamentos e janelas (E) e as durações que ainda vêm da tela (`some`, `magica`, `dado`; etapa F).
- **C. Textos por quem vê (M)**
  - O `who()` e os "Você…" saem das regras e vão para o tradutor de eventos.
  - O registro da partida passa a ser montado pela tela.
  - **Conferir:** registro idêntico nos testes.
  - **Feito:** cerca de 160 textos passaram a usar `J(pi)` e `V(pi, para ele, para os outros)`, marcas com o nome do
    jogador que a tela traduz com `texto()`. O registro e o histórico das jogadas são montados pela tela. Teste das cartas
    com estado, registro e eventos idênticos (a única diferença foi de propósito: o aviso de eliminado agora vai só para
    quem saiu, com `a:pi`). Ainda ficam nas regras textos do humano que a etapa E resolve (`S.outWhy`, Mix de Regras).
- **D. Estado visual separado (M)**
  - O que é só da tela sai do `S` e vai para um `V`, inclusive a inclinação das cartas na mesa.
  - O número das cartas passa a ser sorteado.
  - **Feito:** o estado da tela foi para o `VIS` (`ui.js`), com o nome `VIS` porque `V` ficou com os textos da etapa C.
    As regras mandam eventos (`recebe`, `compra`, `semVoo`, `origem`, `jogaDoMonte`, `anuncio`, `gira`…) e a tela decide o que
    animar. A inclinação das cartas na mesa é da tela (`rotDe`). O número das cartas é sorteado (de 1 a 2^31, sem
    repetir) por um gerador próprio que segue a semente. Estado e registro dos 173 cenários idênticos.
- **E. Quem controla cada cadeira (G), a etapa mais arriscada**
  - Cada cadeira passa a ter um controlador: humano nesta tela, adversário do computador ou, mais tarde, pessoa em outro aparelho.
  - Os dois caminhos de jogada viram um só.
  - Todas as escolhas viram pedidos.
  - O que hoje é exclusivo do jogador 0 (troca de mão, Confusão, passar sozinho, pegar e tocar a sineta) passa a valer por tipo de controlador.
  - **Conferir:** testes de carta, `npm test` e jogar à mão cada carta com escolha.
  - **Feito:** `p.ctrl` em cada jogador, `CONTROLES.bot` e `CONTROLES.tela`, `jogar`/`termina` no lugar de humanPlay,
    finishHuman, botPlay e botPlayNow, e `pedir` para cor, alvo, carta (Desejo, Banimento, Rastrear), regra (Carta da Regra
    e Mix) e Memória. As regras não usam mais `pi===0` nem `p.bot`. Estado e registro idênticos, menos a Clarividência
    (de propósito: agora você também mostra uma carta, como todos). Testadas no navegador, com cliques, as janelas de
    cada carta com escolha, Rastrear, Mix, Confusão e Corte.
- **F. Relógio e pausas (M)**
  - Os `setTimeout` das regras passam a usar o relógio da mesa.
  - O Portal deixa de esperar a animação.
  - **Conferir:** testes, turbo e Portal.
  - **Feito:** `RELOGIO` e `agendar` no `engine.js` (39 esperas das regras trocadas); a hora das regras vem de
    `RELOGIO.agora()`. Durações fixas calculadas pela mesa: Banimento (`tempoSome`), Mágica, dado (1450 ms para todos, e a
    tela decide se mostra o dado pequeno, o 3D ou só o aviso), balão de pensar e Memória dos adversários (a tela anima com
    `pensaFx`/`memoriaBotFx`) e o voo dos ícones do Mix (`comecaMix`). A pausa do `fx` saiu do desenho e foi para o `emit`.
    Estado e registro dos 173 cenários idênticos.
- **G. Mesa isolada (M)**
  - As regras passam para `js/mesa/` e não usam mais nada da página.
  - **Formato:** continuam scripts clássicos, para não mexer no resto do site. No Node, são carregados com o módulo `vm`, como num navegador. Um empacotador (esbuild) só entra se for preciso, na fase 3.
  - Um teste novo roda milhares de partidas só com adversários no Node, em segundos. De bônus, mostra estatísticas como quem vence mais e com quais regras.
  - Os arquivos novos entram na lista `CORE` do `sw.js`.
  - **Feito:** `js/mesa/` com `dados.js`, `regras.js`, `cartas.js` e `adversarios.js`; o turbo foi para `js/turbo.js` e os
    desenhos das cartas ficaram em `js/cards.js`. A mesa recebe da página só `OPCOES` (movimento reduzido, velocidade,
    controladores) e pede redesenho pelo evento `atualiza`. `npm run test:mesa` joga 2000 partidas só com adversários no
    Node em uns 4 s (10 mil em 38 s, sem erros nem travamentos) e já achou um `who` que tinha escapado da etapa C.
    Os 173 cenários continuam idênticos, inclusive os eventos.
- **H. Duas telas com rede de mentira (M)**
  - Duas abas conversam com a mesa por `BroadcastChannel`.
  - Toda mensagem é convertida em texto (JSON) e atrasada de propósito (100 a 300 ms). Assim aparecem os erros que só existiriam com rede de verdade, como objetos compartilhados por engano ou ordem de chegada.
  - **Conferir:** jogar as duas cadeiras à mão.
  - **Feito:** `agir(pi, ação)` na mesa (jogar, principal, sineta, pegar, desafiar, trocar a mão), conferindo se a ação vale;
    `js/mesa/visao.js` com `visao(pi)` (sem mãos dos outros, monte, memória dos adversários, blefe do +4 nem semente; Batata
    e Mão Colorida vão prontas) e o giro das cadeiras; `js/rede.js` com anfitrião e convidado (`?rede=anfitriao` /
    `?rede=convidado`) e `CONTROLES.rede`, que leva os pedidos à outra aba e confere as respostas (na Memória, confere os
    toques). `npm run test:rede` joga as duas cadeiras sozinho pelas janelas e confere a mão do convidado contra a mesa e o
    que ele recebe; `npm run test:mesa` confere a visão em milhares de partidas. A rede de mentira achou dois erros que
    só apareceriam com rede: mensagens trocando de ordem (agora uma fila só) e a mesa ocupada depois do Rastrear respondido
    pela rede. Falta jogar à mão as duas cadeiras.

---

## 4. Fase 1.5: rede local (um dos aparelhos é o servidor)

Dois ou mais aparelhos na mesma Wi-Fi. O **anfitrião** cria a sala e roda a mesa e os adversários do computador no
próprio navegador. Os convidados entram por QR code. Não precisa de computador. Com o app instalado (PWA), a ideia é
funcionar até sem internet.

### 4.1 Prova de conceito (antes de tudo)

Uma página de teste separada (`lan-teste.html`), em poucas horas de trabalho:
- dois aparelhos se conectam por QR code e trocam mensagens.

O que testar:
- Android com Android, iPhone com Android e iPhone com iPhone;
- com e sem internet;
- com e sem o app instalado.

**Por que antes:** o ponto mais incerto é o iPhone sem internet. Por privacidade, os navegadores escondem o endereço
do aparelho na rede. Quando a página tem permissão de câmera (que vamos pedir para ler o QR code), eles costumam
liberar. Mas isso varia por navegador e versão, e só o teste confirma.

**Se falhar no iPhone sem internet, há duas saídas:**
- exigir internet só para apresentar os aparelhos (código curto de sala). A partida continua direto pela Wi-Fi;
- usar um computador como servidor (a ideia da versão 1).

**Resultado (07/10/2026):** dois Androids 10 com o app instalado, Chrome 154 (anfitrião) e Chrome 148 (convidado),
pedindo a câmera antes do convite e sem servidor STUN.

| Teste | Resultado |
|---|---|
| Conexão com internet | ✅ conectou 0,1 s depois de ler a resposta |
| Conexão sem internet (roteador sem internet) | ✅ funcionou igual |
| Caminho da conexão | Direto pela Wi-Fi, endereço local dos dois lados (IPv4 privado e, em outra rodada, IPv6) |
| Leitura do QR code | 1,3 a 2,2 s com o leitor do sistema; QR codes de 123 a 190 caracteres (versões 6 a 8) |
| Ping | 7 a 46 ms fora dos bloqueios de tela (17 a 31 ms em média) |
| Rajada de 500 mensagens | 500/500, em ordem, em 0,09 a 0,27 s |
| Tela bloqueada do convidado por ~17 s e por ~1,5 min | A conexão não caiu; as respostas só esperam a tela voltar |
| Manter a tela acesa | Funciona, e volta sozinho ao desbloquear |

- **Observação:** o relatório mostra "Internet: sim" mesmo sem internet, porque o navegador só informa se há uma rede, não se ela chega à internet.
- **Conclusão:** no Android, o caminho do plano (WebRTC com QR code e o anfitrião rodando a partida) está confirmado, inclusive offline.
- **Falta:** o iPhone. Fica para quando houver um à mão. Se falhar, valem as duas saídas acima.

### 4.2 Como funciona para o jogador

1. O anfitrião toca em **"Jogar na rede local" → "Criar sala"**, escolhe o modo e as regras, e aparece um **QR code**.
2. O convidado toca em **"Entrar numa sala"** e lê o QR code com a câmera.
3. O convidado mostra um QR code de resposta, e o anfitrião lê com a câmera.
4. O convidado entra na sala. Para mais convidados, os passos 2 e 3 se repetem (até 5 convidados).
5. O anfitrião começa a partida. As cadeiras vazias viram adversários do computador.

São duas leituras por convidado, porque a conexão direta entre navegadores (WebRTC) precisa de uma "proposta" e de
uma "resposta", e sem internet não há outro caminho para elas. Com internet, um **código curto de sala** pode
substituir os QR codes. Isso exige um serviço na internet só para apresentar os aparelhos, por isso fica para a fase 3.

### 4.3 Por dentro

- **Conexão WebRTC** com canal de dados confiável e em ordem. Pelo canal passam as ações, os eventos e os pedidos da seção 2.
- **Cada convidado recebe só a própria visão.** Para ele, é igual a jogar online.
- **QR code: o jogo precisa gerar e ler.**
  - Gerar: `qrcode-generator`, por exemplo.
  - Ler: `jsQR`. O Safari do iPhone não tem leitor embutido.
  - As duas bibliotecas ficam **no próprio site**, na lista `CORE` do `sw.js`. Assim funcionam offline mesmo na primeira vez.
- **A proposta é compactada.** O texto da conexão tem uns 1.000 caracteres; só os campos essenciais vão no QR code, e o outro lado remonta o resto. Um QR code menor é lido bem mais rápido de uma tela.
- **Conferência de versão.** Ao entrar, os aparelhos comparam a versão do jogo. Sem internet, um deles pode estar com uma versão antiga guardada; nesse caso, aparece o aviso "atualize o jogo".
- **Ligações da mesa com os jogadores:**
  - direta, na mesma página: solo e o anfitrião;
  - WebRTC: convidados na rede local;
  - WebSocket: online, a partir da fase 3.

### 4.3.1 Andamento

- **Etapa 1, conexões (feita):** `js/lan.js` com o código de conexão e de QR code (o `lan-teste` usa o mesmo arquivo);
  `js/rede.js` com ligações de dois tipos (de mentira entre abas, com atraso de 100 a 300 ms, e WebRTC) e até 5
  convidados, cada um com a sua cadeira, visão e pedidos. `npm run test:rede -- --webrtc --convidados=3` joga pela
  conexão de verdade entre abas.
- **Etapa 2, sala (feita):** `js/sala.js` e o botão 👥 na tela inicial. Anfitrião: lugares (2 a 6), ordem das pessoas com
  ▲▼ (o anfitrião é sempre "você", embaixo; os outros giram em volta), sortear a cada partida, tempo para jogar, regras
  (as Configurações, sem a quantidade de adversários), convite por QR code e leitura da resposta pela câmera (ou colando
  o código), começar e, no fim, nova rodada ou voltar à sala. Convidado: lê o convite, mostra a resposta, vê a sala e
  toca em "Estou pronto". `npm run test:sala` faz tudo pelas telas.
- **Etapa 3, regras do multiplayer (feita):** relógio de cada vez e de cada pedido de uma pessoa (Normal: 20 s, 15 s,
  30 s; Longo: o dobro; Sem limite), com a barra acima da mão; tempo esgotado, o computador decide; depois de 3 seguidos,
  fica na cadeira (🤖) até a pessoa agir. Queda: sem sinal por 8 s, o computador joga (📵) até o sinal voltar; com a
  ligação fechada, a pessoa volta com um convite novo e recupera a cadeira (número do aparelho). Tela acesa na sala
  (Wake Lock). Mix: uma pessoa por vez, depois os adversários, lista para todos e começo quando todos fecharem.
  O anfitrião abre a sala durante a partida pelo botão "Sala" do topo. `npm run test:tempo` confere tudo isso.
- **Etapa 4, fechamento (feita em 09/10/2026):** o que ainda era só do jogador 0 passou a valer para cada pessoa.
  - Segunda Chance de cada pessoa (antes, só o anfitrião via o botão, e a primeira jogada de qualquer pessoa tirava a troca de todas).
  - Dança das Cadeiras: todos os adversários de quem jogou trocam de lugar, pessoas e bots, levando junto as marcas e o
    outro lado do Portal. Cada tela continua com a pessoa embaixo (a mesa gira junto).
  - Torneio e Sobrevivência na sala, com placar por pessoa; quem sai da Sobrevivência assiste às partidas seguintes na
    cadeira dele, e o torneio acaba quando todas as pessoas saem ou sobra um só.
  - Com outras pessoas, quem é eliminado assiste no ritmo normal (o "Terminar e descobrir vencedor" é só do solo).
  - O `lan-teste` saiu; o `npm run test:sala` passou a testar também a leitura dos QR codes pela câmera (`--camera`) e,
    sem câmera, a conexão com o endereço escondido num nome `.local`. `npm run test:rede-regras` confere a Segunda Chance,
    a Dança e o Torneio com pessoas.
- **Decisões da sala (08/10/2026):** o anfitrião escolhe quantas cadeiras (as vazias são adversários), pode arrumar os
  lugares ou sortear a cada partida; os convidados tocam em "Pronto", mas quem começa é o anfitrião. Nome guardado no
  aparelho. Uma opção "Tempo para jogar" (Normal, Longo, Sem limite). No Mix de Regras, as pessoas escolhem uma de
  cada vez, depois os adversários; a lista de regras aparece para todos, e a partida começa quando todos fecharem a
  janela ou o tempo acabar.

### 4.3.2 Roteiro para testar nos celulares

Com 2 ou 3 aparelhos na mesma Wi-Fi e o jogo atualizado em todos (abrir uma vez com internet). Para cada item, anotar
se funcionou, se demorou e, se travar, tirar uma captura da tela.

1. Criar a sala, convidar pela câmera (convite e resposta) e começar. Quanto tempo levou cada leitura?
2. Jogar uma partida no Personalizado com Dança das Cadeiras, Troca, Desejo e Segunda Chance, e outra no Mix de Regras.
3. Sem internet: desligar a internet do roteador (ou usar o ponto de acesso de um celular sem dados) e repetir o item 1.
4. Bloquear a tela de um convidado por 20 s e por 2 min: o bot joga por ele (📵) e ele volta sozinho? Se a conexão
   cair, entrar com um convite novo e conferir que ele volta para a mesma cadeira.
5. Com o tempo para jogar Normal, deixar o tempo acabar 3 vezes seguidas e depois voltar a jogar.
6. O anfitrião troca de app por alguns segundos e volta: a partida continua?
7. iPhone, quando houver um: repetir os itens 1, 3 e 4 com o iPhone como convidado e depois como anfitrião.

### 4.4 Limitações

- **O anfitrião precisa ficar com o jogo aberto.** Se trocar de app ou bloquear a tela, principalmente no iPhone, a partida para para todos.
  - A tela fica acesa enquanto ele estiver numa sala (Wake Lock), e aparece um aviso.
  - Se o anfitrião sair, a partida acaba.
- **Quem cair precisa ler o QR code de novo.** Na rede local, voltar exige uma nova troca de QR codes. Enquanto isso, um adversário do computador joga na cadeira, e a pessoa pode retomá-la quando reconectar.
  - Isso vale também para um convidado que bloqueia a tela.
- **O anfitrião pode ver tudo** pelo console, porque a mesa roda no aparelho dele. Entre amigos não é problema; no online, a mesa roda no servidor.
- **Algumas redes bloqueiam a conversa entre aparelhos:** Wi-Fi de visitantes, de hotel ou com "isolamento de clientes". Nesses casos, um celular pode criar um ponto de acesso para os outros.

### 4.5 Regras que o multiplayer exige (rede local e online)

- **Tempo por pedido:**
  - jogada: 20 s;
  - cor e alvo: 15 s;
  - Memória, Carta da Regra e Mix: 30 s, porque é preciso ler.

  Todos os tempos podem ser mudados na sala. Ao acabar o tempo, o adversário do computador decide pela pessoa.
- **Ausência:** depois de 3 tempos esgotados seguidos, a cadeira passa para o adversário do computador até a pessoa voltar a jogar.
- **Reflexos:** vale a ordem de chegada à mesa.
- **Regras de tempo** (Rápido, Tempo reduzido): podem voltar só no multiplayer, onde todos sofrem a mesma pressão. Decidimos depois.
- **Número de jogadores:** de 2 a 6 cadeiras, com adversários do computador completando. Hoje o Clássico e o Mix usam sempre 4 cadeiras e 7 cartas; isso pode continuar como padrão.

### 4.6 Mais adiante, com o app de loja

Dentro do app (Capacitor), o anfitrião pode abrir um servidor de verdade no celular e anunciar a sala na rede. Os
convidados veem a sala numa lista, sem QR code.

---

## 5. Página e hospedagem

- **Até a fase 2:** o GitHub Pages continua ótimo e sem custo. Ele aceita domínio próprio, também sem custo.
- **Domínio próprio** (`.com.br`, cerca de 40 reais por ano), quando o nome estiver decidido. Os motivos:
  - links de sala que abrem direto no app (App Links e Universal Links), que exigem um domínio seu;
  - aparência;
  - não depender do endereço do GitHub.
  - Correção da versão 1: `jogo.dominio` e `api.dominio` são origens diferentes (mas o mesmo "site"). Para o login isso não atrapalha: o Supabase usa um token que vai junto na conexão do WebSocket, e não cookies.
- **Servidor de partidas:** Fly.io, região São Paulo (`gru`). A máquina menor custa cerca de 2 dólares por mês.
  - **Atualizar o servidor encerra as salas em andamento**, porque as partidas ficam na memória. O servidor avisa, para de aceitar salas novas e espera as partidas acabarem antes de reiniciar.
- **Login e banco:** Supabase.
  - **O plano gratuito pausa o projeto depois de 7 dias sem uso**, e aí o login para de funcionar. No começo, um acesso automático diário evita isso. Com uso real, o plano pago custa 25 dólares por mês.

---

## 6. Segurança no online

**Não dá para impedir que alguém mande mensagens por fora do jogo.** Qualquer pessoa consegue ver o que o navegador
envia e escrever um programa que imite o jogo. Mas dá para tornar isso inútil, com uma regra: **o servidor não confia
em nada que vem do aparelho.** Ele funciona como o crupiê de uma mesa de cartas: as cartas ficam com ele, e ele só
aceita jogadas válidas. Uma mensagem forjada só consegue fazer o que um jogador honesto faria pelo jogo.

### 6.1 O que a arquitetura já resolve

Com a mesa rodando no servidor (fases 1 e 3):
- **Ninguém vê as mãos dos outros nem o baralho:** cada um recebe só a própria visão, e o número das cartas é sorteado (seção 2.1).
- **Não dá para jogar carta que não tem, jogar fora da vez nem "comprar" uma carta escolhida:** toda ação passa pelas regras da mesa.
- **Não dá para prever o baralho:** a semente do sorteio fica só no servidor (seção 2.6).
- **O resultado é calculado pelo servidor:** o aparelho nunca diz "eu ganhei".

### 6.2 O que o servidor confere em cada mensagem

- **Quem é:** a conexão leva o token do login (Supabase), conferido pelo servidor. O token só vale para a cadeira daquela pessoa naquela sala.
- **Se a ação vale agora:** é a vez dela? A carta está na mão dela? A regra permite? A resposta é para o pedido que está aberto?
- **Formato e quantidade:** cada tipo de mensagem tem um formato fixo. Campos desconhecidos, mensagens grandes ou rápidas demais são descartados, e quem insiste é desconectado.
- **Banco de dados:**
  - a página nunca grava placar nem ranking; só o servidor grava, com uma chave secreta que fica só nele;
  - no Supabase, as regras de acesso (RLS) deixam cada jogador ler só o que é permitido e mudar só o próprio perfil.
- **Nada secreto no código da página:** ela é pública. A chave pública do Supabase pode ficar ali, porque é feita para isso e as regras de acesso a protegem.
- **Conexão criptografada** (HTTPS e WSS), para ninguém espiar numa Wi-Fi pública.

### 6.3 O que continua possível, e como diminuir

Nenhum jogo online elimina estes riscos; os grandes também convivem com eles.

| Risco | Como diminuir |
|---|---|
| Robô jogando pela pessoa, principalmente nos reflexos (sineta, Pegar, Jogar Junto) | Registrar o tempo de reação de cada jogador e revisar quem reage sempre rápido demais. No ranqueado, dá para considerar um tempo mínimo de reação. |
| Combinação entre amigos no ranqueado (trocar informações por fora) | Sortear quem joga com quem; não entrar em dupla na fila ranqueada; revisar quem cai junto com frequência demais. |
| Contas falsas para recomeçar o ranking | Ranqueado só com login do Google ou da Apple. |
| Ajudante que sugere a melhor carta | Não dá para impedir, e ajuda pouco: usa só o que o jogador já vê. |
| Sobrecarga de mensagens ou conexões | Limite por conta e por endereço. A infraestrutura do Fly.io absorve boa parte. |
| Denúncias de trapaça | Guardar a semente e a lista de ações das partidas ranqueadas, para repetir jogada a jogada e conferir. |

### 6.4 Em que fase entra cada coisa

- **Fase 3 (salas privadas):**
  - conferência do token e da cadeira;
  - formato fixo das mensagens;
  - limites de quantidade;
  - HTTPS e WSS;
  - RLS no banco.
  - **Um teste automático com um "cliente trapaceiro"**, que tenta jogar fora da vez, usar cartas que não tem, responder pedidos alheios, mandar mensagens quebradas e inundar o servidor. Todas essas tentativas precisam ser recusadas.
- **Fase 4 (fila casual):**
  - filtro de nomes ofensivos;
  - denunciar e bloquear jogadores (a Apple exige);
  - registro do tempo de reação.
- **Fase 5 (ranqueada):**
  - login obrigatório do Google ou da Apple;
  - sem dupla na fila;
  - partidas guardadas para revisão;
  - punição para quem abandona;
  - ferramentas de administração (banir, anular pontos).

### 6.5 Na rede local

A rede local não tem essa proteção: o anfitrião roda a mesa e, se souber mexer, consegue ver tudo. Entre amigos isso
não é problema, e já está aceito como limitação (seção 4.4).

---

## 7. Play Store e App Store

**Como:** **Capacitor**, que embrulha o mesmo código num app nativo.
- Dentro do app, os arquivos vão junto; o service worker fica desligado.
- WebRTC e câmera funcionam nos dois sistemas. O app precisa declarar o uso da câmera.

| | Play Store | App Store |
|---|---|---|
| Conta | 25 dólares, uma vez | 99 dólares por ano |
| Gerar o app | Windows serve | Mac ou serviço na nuvem (Codemagic) |

**Exigências que pesam no planejamento:**
- **Play Store, contas pessoais novas:** antes de publicar, é obrigatório um **teste fechado com pelo menos 12 pessoas por 14 dias seguidos**. Também é preciso verificar a identidade. Vale começar esse teste cedo, com o solo, assim que o nome estiver decidido.
- **Apple, funcionalidade mínima:** a Apple recusa apps que são só um site embrulhado. O solo offline, os sons e a vibração ajudam. O solo funcionar sem conta também ajuda na revisão.
- **Apple, login:** com login do Google, é obrigatório oferecer uma opção equivalente que proteja o email. Na prática, "Entrar com a Apple".
- **Apple, apagar a conta:** precisa ser possível dentro do próprio app.
- **Partidas com desconhecidos (fases 4 e 5):** a Apple exige filtro de nomes ofensivos, botão de denunciar, bloqueio de jogadores e um contato publicado. Interação online também muda a classificação etária nas duas lojas.
- **As duas lojas:** exigem política de privacidade e o formulário de dados coletados. Isso também atende a LGPD.
- **Compras dentro do app**, se um dia houver: na App Store, só pelo sistema da Apple.

**⚠️ Marcas registradas.** "UNO" e "DOS" são marcas da Mattel.
- **Já foi feito:** o botão virou a sineta 🛎️, e a regra DOS virou "Duas!".
- **Falta:**
  - o nome do jogo (o "unotfm" carrega o "uno");
  - evitar no visual das cartas o oval característico do UNO;
  - confirmar que os nomes dos adversários (jogadores do Transformice, marca da Atelier 801) podem ser usados.

---

## 8. Decisões (aprovadas em 07/10/2026, com as sugestões abaixo)

1. **Ordem:** prova de conceito da rede local, depois as fases 0 e 1 (A a H), depois a 1.5, depois as outras.
   - **Sugestão:** sim.
2. **Remover o código antigo** (lista do diagnóstico) na etapa A.
   - **Sugestão:** sim.
3. **Rede local com WebRTC e QR code**, com o anfitrião rodando a partida. Se a prova de conceito falhar no iPhone sem internet, volto com as alternativas da seção 4.1.
   - **Sugestão:** sim.
4. **Tempos:** os da seção 4.5. Na rede local, quem cai é substituído na hora pelo adversário do computador e pode retomar a cadeira quando reconectar.
   - **Sugestão:** sim. São ajustáveis depois de testar.
5. **Lojas:** começar o teste fechado da Play Store com o solo assim que o nome estiver decidido. App Store junto com o login (fase 2), por causa do "Entrar com a Apple".
   - **Sugestão:** sim.
6. **O Mestre e a quantidade de cartas escondida:**
   - **(a)** passa a usar só a visão dele também no solo. Fica um pouco mais fraco com Neblina e Camuflagem;
   - **(b)** no solo, mantém a vantagem de hoje; no multiplayer, usa só a visão.
   - **Sugestão:** (a). Um comportamento só é mais simples de manter e de testar, e é mais justo.
7. **Nome e marca:** você já está pesquisando.
   - **Sugestão:** decidir antes do domínio e das lojas.

---

## 9. Fase 3: salas online com amigos, sem login (proposta de 09/10/2026, para aprovar)

Objetivo: jogar com amigos de qualquer lugar, por um código ou um link, sem QR code de ida e volta e sem conta. A
mesa roda num servidor. A sala da rede local continua existindo para jogar sem internet.

### 9.1 Como funciona para o jogador

- **Botão 👥:** duas opções, **"Pela internet"** (nova) e **"Na mesma Wi-Fi"** (a sala de hoje, que funciona sem internet).
- **Criar:** a pessoa põe o nome e a sala abre com um **código de 4 caracteres** (por exemplo, `K7QM`) e um **link**
  (`https://nonegustavo.github.io/unotfmvibes/?sala=K7QM`).
  - Botões **Compartilhar** (o menu de compartilhar do celular: WhatsApp e outros) e **Copiar**.
  - Um QR code do link, para quem está perto.
- **Entrar:** abrir o link (ou digitar o código no 👥) e pôr o nome. Pronto, a pessoa já está na sala: não há resposta
  para mostrar de volta.
- **Dono da sala** (quem criou) tem as mesmas opções da sala de hoje: lugares, ordem, sortear, tempo para jogar, regras
  e começar. Ganha também **remover alguém da sala**. Os outros veem a sala e tocam em "Estou pronto".
- **Quem cai** (sinal fraco, tela bloqueada, trocou de app) volta sozinho ao abrir o jogo de novo, sem convite novo: o
  aparelho guarda a chave da cadeira. Enquanto isso, um bot joga por ele, como na rede local.
- **Se o dono sair**, a partida continua e o posto de dono passa para a próxima pessoa. Na rede local, a saída do
  anfitrião encerra a partida; aqui não, porque a mesa está no servidor.
- **A sala acaba** 10 minutos depois que a última pessoa sair.

### 9.2 Por dentro

- **Servidor:** Node, numa pasta `servidor/` deste repositório, com WebSocket (biblioteca `ws`).
  - Cada sala tem a própria mesa num contexto `vm`, como no `test:mesa`, porque a mesa usa variáveis globais.
  - Medido em 09/10/2026: cerca de 300 KB por mesa com uma partida em andamento. A menor máquina comporta centenas de salas.
  - O relógio da mesa é o de verdade, e os bots jogam no servidor.
- **O mesmo anfitrião na rede local e no servidor.** Hoje o que o anfitrião faz está misturado com a página, no
  `js/rede.js` e no `js/sala.js`:
  - lugares, regras e começar;
  - enviar a cada pessoa os eventos e a visão dela, os pedidos, as ações;
  - tempo para jogar, queda e volta.

  A etapa 1 passa tudo isso para um arquivo sem página (`js/mesa/anfitriao.js`). Ele roda no navegador do anfitrião
  (rede local) e no servidor (online). As regras montadas a partir das configurações (`rulesForMode`, hoje no
  `data.js`) também vão para a mesa.
- **Mensagens:** as mesmas da rede local, mais as da sala (criar, entrar, comandos do dono). O jogador online é o
  convidado de hoje com outra ligação (WebSocket em vez de WebRTC).
  - Da rede local: eventos girados com a visão de cada um, pedidos, ações e respostas.
- **Quem é quem, sem login:** ao entrar, o servidor dá a cada pessoa uma **chave secreta** (aleatória, 128 bits),
  guardada no aparelho.
  - Ela vale só para aquela cadeira daquela sala e substitui, nesta fase, o token do login da seção 6.2.
  - O código da sala só serve para entrar enquanto houver lugar.
- **Versão:** o site (GitHub Pages) e o servidor precisam falar a mesma versão. Os dois conferem ao conectar e, se
  forem diferentes, aparece "Atualize o jogo". Eu publico os dois juntos.
- **Endereço do servidor:** `wss://<nome>.fly.dev`, com um nome provisório e neutro (sem "uno"), trocado quando
  houver domínio.
  - Para testar no computador: `npm run servidor` e o jogo com `?servidor=ws://localhost:8787`.
  - Os celulares na mesma Wi-Fi também podem usar o servidor do computador.

### 9.3 Segurança nesta fase

É o que a seção 6.4 previa para a fase 3, com a chave da cadeira no lugar do login:
- **A mesa fica no servidor:** ninguém vê as mãos dos outros nem o monte, nem o dono da sala (na rede local, o anfitrião podia).
- **Mensagens conferidas:**
  - formato fixo de cada uma (campos e tipos conferidos; o resto é descartado);
  - no máximo 4 KB por mensagem e cerca de 20 por segundo (quem insiste é desconectado);
  - comandos de dono só do dono.
- **Limites contra abuso:**
  - poucas salas criadas por endereço por hora;
  - poucas tentativas de código errado (para ninguém sair adivinhando códigos);
  - só aceita conexões vindas do site do jogo (e do computador, nos testes).
- **Teste do "cliente trapaceiro"**, no Node. Ele tenta jogar fora da vez, usar carta que não tem, responder pedido de
  outra pessoa, mandar comando de dono sem ser dono, mandar mensagens quebradas e inundar o servidor. Tudo precisa ser recusado.
- **Dados pessoais:** só o nome escolhido, que some com a sala. Nesta fase não há banco de dados nem registro das partidas.

### 9.4 Hospedagem

- **Fly.io, São Paulo** (`gru`), a menor máquina (256 MB).
  - Desliga sozinha quando não há salas e liga quando alguém cria uma (a primeira sala espera 1 a 3 s).
  - Custo: cerca de 2 dólares por mês se ficasse ligada o tempo todo; desligando sem uso, bem menos.
- **Com você:** criar a conta (pede cartão) e instalar o `flyctl`. O login dele é pelo navegador.
- **Comigo:** preparo `Dockerfile` e `fly.toml` e publico com `fly deploy` quando você autorizar.
- **Atualizar o servidor encerra as salas abertas**, porque as partidas ficam na memória. Por enquanto, a regra é
  publicar fora de horário de jogo; esperar as partidas acabarem antes de reiniciar fica para a fase 4.
- **Como publicar** (arquivos prontos: `Dockerfile`, `.dockerignore` e `fly.toml`, que levam só `servidor/` e `js/mesa/`):
  1. Com você: criar a conta em fly.io (pede cartão), instalar o `flyctl` no Windows (no PowerShell:
     `iwr https://fly.io/install.ps1 -useb | iex`) e entrar com `fly auth login` (abre o navegador).
  2. Comigo, com a sua autorização: `fly apps create mesa-tfm` (se o nome estiver ocupado, escolhemos outro e eu troco
     em `fly.toml` e no `SERVIDOR` do `js/rede.js`) e `fly deploy --ha=false` (uma máquina só: as salas ficam na memória dela).
  3. Conferir `https://mesa-tfm.fly.dev` e jogar pelo site publicado, com amigos em redes diferentes (Wi-Fi e 4G).
  - Cada atualização do jogo que mexer na mesa ou nas mensagens precisa publicar o servidor junto (a versão `rede-N`
    dos dois tem de ser a mesma).

### 9.5 Etapas

Cada etapa termina com os testes passando e um commit próprio, como nas fases 0 e 1.

1. **Anfitrião sem página (M).** Passar o anfitrião para `js/mesa/anfitriao.js`.
   - A rede local continua igual: `test:rede`, `test:sala`, `test:tempo` e `test:rede-regras` passando sem mudar o que conferem.
   - Teste novo no Node: o anfitrião com convidados de mentira, sem navegador.
2. **Servidor no computador (M).** `servidor/servidor.mjs`: salas com código, chaves, limites e a mesa de cada sala;
   `npm run servidor`.
   - `test:online`: abas jogando pelo servidor local, conferindo o mesmo que o `test:rede`.
   - `test:trapaca`: o cliente trapaceiro.
3. **Tela (M).** O 👥 com "Pela internet" e "Na mesma Wi-Fi".
   - Criar, compartilhar e entrar pelo link ou pelo código.
   - Volta automática, posto de dono passando adiante e remover alguém.
   - Daqui em diante dá para jogar nos celulares usando o servidor do computador.
4. **Publicar (P).** Fly.io, com você. Teste com amigos em redes diferentes (Wi-Fi de casas diferentes e 4G).

### 9.5.1 Andamento

- **Etapa 1, anfitrião sem página (feita em 09/10/2026):** `js/mesa/anfitriao.js` com a sala, os eventos e visões de
  cada pessoa, os pedidos, as ações, o sinal, a queda e a volta. O `rede.js` ficou com as ligações, o convite e o
  convidado, e o `sala.js` só desenha e manda os comandos. As regras a partir das Configurações (`regrasDe`) foram para
  a mesa. A rede local continua igual (`test:rede`, `test:sala`, `test:tempo`, `test:rede-regras`).
  - `npm run test:anfitriao` roda o anfitrião no Node com convidados robôs que jogam só pelas mensagens, sem ninguém na
    cadeira "da tela", como no servidor: 300 partidas sem erro, com quedas e voltas.
  - Ele achou um erro que só apareceria no servidor: no Mix de Regras, quem está na cadeira 0 podia comprar antes de
    as cartas serem distribuídas. Agora ninguém tem a vez antes da primeira carta na mesa.
  - Fica para a etapa 2: com Neblina e Camuflagem, a visão ainda manda quantas cartas cada um tem (a tela esconde, mas
    um cliente modificado veria).
- **Etapa 2, servidor no computador (feita em 09/10/2026):** `servidor/servidor.mjs` (Node e a biblioteca `ws`), com
  uma mesa e um anfitrião por sala num contexto `vm`.
  - Salas com código de 4 caracteres, chave secreta de 128 bits para cada pessoa (volta para o mesmo lugar), dono da
    sala com comandos e posto passando adiante, tirar alguém da sala (a chave dele não entra mais), sala vazia acaba em
    10 minutos, quem fica desligado fora da partida sai da sala em 2 minutos.
  - Conferências: site de origem, formato fixo de cada mensagem, no máximo 4 KB e 30 por segundo, 20 mensagens
    recusadas desconectam, 5 salas por endereço a cada 10 minutos, 10 códigos errados por minuto, regras limpas
    (`limpaCfg`) e nomes sem caracteres de controle.
  - Com Neblina e Camuflagem, a visão manda 5 cartas para quem está com a quantidade escondida.
  - `npm run test:online`: 12 salas ao mesmo tempo, com convidados robôs por WebSocket, sem problemas. Achou um erro
    que também existia na rede local: ao começar a partida seguinte depois de uma Dança das Cadeiras, uma pessoa recebia
    por um instante a visão de outra cadeira (a mão de outra pessoa). Agora a cadeira só muda no primeiro evento da
    partida nova.
  - `npm run test:trapaca`: as 24 tentativas do cliente trapaceiro foram recusadas, com a partida seguindo.
- **Etapa 3, telas (feita em 09/10/2026):** o 👥 tem "Pela internet" (criar sala, entrar com código) e "Na mesma Wi-Fi".
  - Quem cria vê o código grande, o link, "Compartilhar o link" (o menu de compartilhar do celular), "Copiar o link"
    e o QR code do link. O dono tem as opções da sala da rede local e também tira pessoas (✕).
  - Abrir o link (`?sala=CÓDIGO`) abre o 👥 com o código preenchido; a pessoa escreve o nome e entra.
  - A chave fica no aparelho: ao recarregar a página, abrir o jogo de novo ou perder a conexão, ele volta sozinho para
    a mesma cadeira (tenta de novo com espera crescente). Quem foi tirado, ou se a sala acabou, fica sabendo.
  - Se o dono sair, quem vira dono passa a ver os botões de dono (e o aviso "Agora você é o dono da sala").
  - Os nomes perdem os caracteres de HTML (`< > & " '`), no anfitrião e no servidor, porque aparecem nas telas dos outros.
  - `npm run test:sala-online` faz tudo isso pelas telas, com o servidor no computador.
  - Para jogar nos celulares antes da etapa 4: no computador, `npm run servidor` com `DEV=1` e o jogo servido pela
    rede local (`python -m http.server 8000`); nos celulares, `http://<endereço do computador>:8000`.

### 9.6 Decisões (aprovadas em 09/10/2026, com as sugestões)

1. **Código da sala:** 4 caracteres, sem os que se confundem (0 e O, 1, I e L). São cerca de 800 mil combinações, e o
   limite de tentativas impede adivinhar.
   - **Sugestão:** 4.
2. **No 👥:** "Pela internet" em cima e "Na mesma Wi-Fi" embaixo.
   - **Sugestão:** sim.
3. **Dono:** pode remover pessoas, e o posto passa adiante se ele sair.
   - **Sugestão:** sim.
4. **Sala vazia** acaba depois de 10 minutos.
   - **Sugestão:** 10 minutos.
5. **Nome provisório do servidor**, que aparece no endereço (`<nome>.fly.dev`).
   - **Sugestão:** algo neutro, como `mesa-tfm`, até o nome do jogo ser decidido.
6. **Mesmo código para o anfitrião da rede local e do servidor** (etapa 1).
   - **Sugestão:** sim. Dá mais trabalho agora, mas evita duas versões das mesmas regras de sala que vão se separando com o tempo.
7. **Conta no Fly.io:** só é preciso na etapa 4. As etapas 1 a 3 rodam no computador.
