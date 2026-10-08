# Plano: do solo ao multiplayer

Aprovado em 07/10/2026 (versão 2). Versão 2.1: acrescentada a seção 6, segurança no online.

Andamento: a sineta já foi feita, e a prova de conceito da rede local (seção 4.1) foi testada em 07/10/2026 entre dois
Androids, com bons resultados. O iPhone não foi testado.

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
