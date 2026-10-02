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
js/data.js              cores, regras (RULES), cartas especiais (SP), maldições (CURSES), climas (WEATHER),
                        dificuldades (DIFF), dicas (TIPS), configuração salva (CFG) e rulesForMode()
js/effects.js           camada 3D com three.js (FX3D) e sons sintetizados com Web Audio (SND, sfx)
js/engine.js            baralho, canPlay, distribuição (newGame/dealAndStart), Portal (dois lados),
                        playCard, fim de turno, compras, eliminação
js/cards.js             efeitos das cartas especiais (applySpecial), janelas de decisão do jogador,
                        troca/carrossel e corte
js/bots.js              IA dos adversários, incluindo o nível oculto Mestre
js/ui.js                jogador humano, render(), janelas (cor, rastrear, regras, status, histórico),
                        configurações, ligação de eventos, instalação do PWA
manifest.webmanifest    manifesto do PWA
sw.js                   service worker (offline)
icons/                  ícones do app
```

Os arquivos JS são **scripts clássicos carregados em ordem** e compartilham o escopo global (não há módulos nem IIFE).
- Não crie nomes globais que colidam com propriedades do `window`. Por isso a função da carta do topo se chama `topCard()`, já que `top` é reservado.
- Código executado no carregamento só pode chamar funções de arquivos carregados antes.
- O three.js vem do cdnjs (r128) com `defer`, e a fonte vem do Google Fonts. Se o three.js não carregar, o jogo usa os efeitos 2D.

### PWA / service worker
- HTML, CSS e JS usam rede primeiro e caem no cache quando offline. Por isso as atualizações chegam sozinhas.
- Ao **criar ou renomear arquivos**, adicione-os à lista `CORE` do `sw.js`.
- Ao **trocar ícones**, aumente a versão em `const CACHE='unotfm-vN'`.

## Como testar

```bash
python -m http.server 8000    # na raiz do repositório (no Windows é "python"; "python3" abre a Microsoft Store)
```
- Abra `http://localhost:8000` (no app do Claude, a configuração `unotfm` em `.claude/launch.json` faz isso).
- Teste automático: `npm test` (3 partidas) ou `npm test -- 10`; `--ver` abre o navegador visível (usa o Chrome/Edge instalado); `--vel=5` encurta as esperas do jogo em 5x para rodar mais rápido. O script `tests/smoke.mjs` sobe o próprio servidor, joga clicando em cartas `.card.ok`, Comprar, UNO e nas janelas de escolha, e falha se houver `pageerror` ou travamento (captura em `tests/travou-N.png`). Na primeira vez: `npm install` e `npx playwright install chromium`.
- Confira se não há `pageerror` e se a partida não trava. Uma boa verificação de travamento é ver se status, mão e cadeiras ficam mais de 15 s sem mudar.
- Os efeitos 3D precisam de WebGL. No headless, use `--use-gl=swiftshader` e sirva o `three.min.js` localmente se o CDN não estiver acessível.
- Para mudanças visuais, tire capturas da área afetada (viewport 390×800, celular).

## Conceitos importantes do código

- **Estado:** `S` guarda a partida atual e `R` as regras ativas do lado atual. `CFG` é a configuração salva. `rulesForMode()` monta `R` a partir do modo.
- **Modos:** Clássico (sem regras), Mix de regras (chave `poker`: cada jogador escolhe uma regra **antes** da distribuição) e Personalizado. Clássico e Mix usam sempre 3 adversários e 7 cartas.
- **Dificuldades:** Fácil, Normal, Difícil e **Mestre** (oculto). O Mestre é desbloqueado tocando 7 vezes seguidas em "Difícil", fica salvo em `unotfm-solo-master` e não mostra nenhuma indicação antes disso. Ele usa memória (`S.mem`: cores que faltam a cada jogador, última cor jogada, cartas já saídas) sem nunca ver mãos ocultas.
- **Regras:** `RULES` (grupo, chave, nome, descrição). As cartas especiais ficam em `SP` (nome, ícone `g`, descrição, `deck` com cores e quantidades do `deck.lua`, `rule` quando a chave da regra é diferente, e `hide`). Os conflitos ficam em `CONFLICT_PAIRS`. Os ícones das regras (`RICON` + `SP.g`) **não podem se repetir**.
- **Anúncio antes do efeito:** toda carta de ação (e o 0 na Tempestade) primeiro pousa na mesa (`announce`) e só depois aplica o efeito.
  - Misteriosa e Clonagem giram e se transformam. Coringas giram ao ser pintados.
  - Os adversários mostram a decisão num balão perto da cadeira (`botThink`).
- **Portal:** são dois lados independentes. `SIDE_KEYS` e `PLAYER_KEYS` definem o que é separado por lado, e o sentido do jogo é compartilhado. O outro lado tem cores rosa, laranja, ciano e roxo, borda e símbolos pretos e coringas brancos. A mesa não muda de cor. Azul e Verde só vale no lado normal.
- **Eliminação por erro** (ser pego sem UNO, blefe desafiado, desafio errado) **só acontece com a Morte súbita**. Fora dela:
  - Pego sem UNO compra 2 (4 no Modo rigoroso).
  - O desafio vale só para o **último** +4/+99. Se foi blefe, o blefador compra as cartas da carta dele e o desafiante compra o restante acumulado.
- **Nevasca e Gelo:** ninguém compra. Os +2/+4 continuam acumulando, e quem não se defende perde a vez sem comprar. No desafio:
  - Se foi blefe, o desafiante segue jogando.
  - Se a jogada era legal, o desafiante perde a vez.
  - Perder a vez por penalidade não conta como "passar" para encerrar a Nevasca.
- **Compra:** depois de comprar, o jogador pode jogar **qualquer** carta jogável ou passar.
  - Insatisfação passa a vez ao comprar.
  - Compra rápida joga a carta comprada sozinha, mesmo que não combine (exceto a Bomba).
  - Satisfação compra 1 por vez (2 com a Bigorna) e não deixa passar enquanto não houver carta jogável.
- **Reembaralhar:** `restoreCard`/`returnable` devolvem as cartas à forma original (coringa preto, Misteriosa e Clonagem desfeitas, cor de antes da Tinta, Batata vermelha). Cartas com `extra: true` (Misteriosas do Presente, cópias da Partilha, Tesouro) não voltam ao baralho.
- **Status:**
  - `seatStatus(i)` para jogadores: selo na borda de baixo da cadeira e o seu selo acima da mão.
  - `tableStatus()` para a mesa: selos abaixo do baralho.
  - `infoPopup()` abre a janela explicativa com seta. Essas janelas não têm botão Ok e fecham ao tocar em qualquer lugar.
- **Cartas na mão:** os selos no topo (`cardBadges`) indicam por que a carta pode ser jogada (🛡️ defesa, ✂️ corte, 📚/🔢 combo, ↕️ vizinho, 🔥 inferno, ☀️+1, 💯, 🌼, 👢, ⛈️) ou o que a bloqueia, com borda vermelha (🔒, 🧼, 🚦, ↕️).

## Removido de propósito (não reintroduzir sem pedir)
- Regras baseadas em tempo: Rápido, Tempo reduzido, Limbo, Mais regras e a maldição de 3 segundos. Funcionam mal no solo, porque só o humano sofre pressão de tempo.
- Carta do Paradoxo.
- Regras de bots específicos (Drekkemaus, Charlotte etc.). O código ainda existe, mas inativo (`BOTRULES`, `ab()`).
- Botão "Regras" no topo. As regras são vistas tocando nos ícones abaixo dos jogadores.

## Ideias ainda não feitas
Xadrez Maluco, Imitação, Jogada Secreta, Quente e Frio. A Emoção e o Meep dependem do Transformice e não entram.
