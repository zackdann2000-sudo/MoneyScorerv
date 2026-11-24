# GTM Playbook — lançamento do GreenScore

Documento de trabalho do dia D. Regra que vale para todo o material: **nada de
promessa de lucro e nenhum número inventado**. Todo dado citado sai de
`/desempenho` (Track Record) e é dito com a amostra ao lado — quando a amostra é
pequena, o próprio texto avisa.

Preencher antes de publicar:

- `{{acerto}}` → win rate da página (ex.: `57,4%`)
- `{{roi}}` → ROI por unidade (ex.: `+6,1%`)
- `{{amostra}}` → nº de picks liquidadas (ex.: `412 picks`)

Se o número não existir ainda, **não publique a peça** que depende dele: prefira
o post 2, que não usa estatística.

---

## 1. Copy de lançamento

### Post 1 — X/Twitter (thread de 5) · o diferencial quantitativo

> 1/ Todo site de palpite te dá uma opinião. O GreenScore te dá o número, a
> amostra e o cálculo. Se o modelo não vê vantagem, ele diz "não há pick".
>
> 2/ Cada análise é um Poisson com peso por recência e xG no λ. A saída é
> probabilidade: 1X2, over/under, props por jogador. A odd do mercado aparece do
> lado — a comparação é sua, não nossa.
>
> 3/ Combinada só com âncora na **Pinnacle**. Sem odd da Pinnacle, a perna entra
> no bilhete sem EV. Preferimos esconder o EV a inventar um.
>
> 4/ Quando duas pernas são correlacionadas (BTTS + over 2.5 no mesmo jogo), o EV
> some da tela e aparece um aviso. Multiplicar probabilidade dependente é como se
> maquiava EV falso — a gente não faz.
>
> 5/ E o histórico? Congelado antes do apito, liquidado depois, red incluído:
> {{acerto}} de acerto em {{amostra}}, ROI {{roi}} por unidade. Track Record
> aberto em greenscore.app/desempenho.
>
> (Conteúdo analítico, 18+, não é recomendação de aposta.)

### Post 2 — Instagram/Reels (legenda) · o problema de confiança

> Você já pagou por um "palpite do dia" e recebeu um print sem contexto?
>
> Aqui funciona ao contrário. Antes do jogo você vê:
> · a probabilidade do modelo
> · a odd real do mercado
> · a amostra que gerou aquilo (últimos 10 jogos, xG, H2H)
>
> Depois do jogo, o pick continua lá — inclusive quando dá red. Sem print
> apagado, sem "green do dia" escolhido a dedo.
>
> Tem plano grátis: 1 análise por dia, sem cartão. Se o modelo não vê valor na
> linha, ele simplesmente não te dá um pick.
>
> Análise esportiva com número aberto. 18+. Não é recomendação de aposta.

### Post 3 — LinkedIn / Reddit r/futebol e r/sportsbook (longo) · o método

> **Por que a maioria dos "tips" não fecha a conta — e o que muda quando você
> mostra o cálculo**
>
> Três coisas explicam quase todo palpite ruim que circula por aí:
>
> 1) **Probabilidade sem fonte.** "Vai dar over 2.5" não é análise. Nós
> publicamos λ (gols esperados) por equipe, com peso por recência e xG, e a
> probabilidade que sai disso. Dá para discordar do número — e é bom que dê.
>
> 2) **EV inventado.** Combinada de 3 pernas do mesmo jogo é o exemplo clássico:
> os eventos são dependentes, então multiplicar as probabilidades como se fossem
> independentes infla o EV. No GreenScore o EV só existe com odd da Pinnacle e
> desaparece quando as pernas são correlacionadas.
>
> 3) **Histórico maquiado.** Pick publicado depois do resultado não prova nada. O
> nosso Track Record é gravado antes do apito e liquidado automaticamente no fim
> do jogo — red fica na lista, e o ROI só considera picks que tinham odd
> publicada no momento do registro.
>
> Estado atual, com a amostra à vista: {{amostra}} liquidadas, {{acerto}} de
> acerto, ROI {{roi}} por unidade. Amostra pequena é dita como pequena.
>
> Se você aposta, o mínimo é exigir isso de quem te vende palpite.
> 18+. Conteúdo analítico, sem promessa de resultado.

**Regras de publicação:** nunca usar "lucro garantido", "green certo",
"dobrei a banca"; nunca printar só greens; sempre dizer 18+ e que é análise, não
recomendação.

---

## 2. Checklist do dia D

### Véspera (D-1)

- [ ] `NEXT_PUBLIC_GA_ID` configurada na Vercel e **redeploy** feito.
- [ ] GA4 → *DebugView* aberto enquanto você navega: `page_view`, `sign_up`,
      `begin_checkout` e `purchase` precisam aparecer em sequência.
- [ ] `/desempenho` com o número real do dia (se for publicar o post 1/3).
- [ ] Cron diário rodou (Vercel → Crons) e o watcher de gol responde
      `ok:true` com `?debug=1`.
- [ ] Alerta de falha do cron-job.org ligado.
- [ ] Um cadastro de teste feito e apagado depois (confirma trial + toast).
- [ ] Suporte pronto: `mailto:` funcionando, respostas padrão separadas para
      "não consigo entrar", "não recebi o push" e "como cancelo".

### Dia D — hora a hora

| Momento | Ação | Onde olhar |
|---|---|---|
| H0 | Publica o post principal (12h–19h BRT rende mais em futebol) | — |
| H0+15min | Conferir se o link abre e se o OG aparece | opengraph.xyz |
| H0+1h | Picos de erro e latência | Vercel → Logs (`500`, `[stripe]`) |
| H0+1h | Funil real: visitas → cadastros → checkouts | GA4 → Realtime |
| H0+2h | Responder **todos** os comentários (objeções na seção 3) | — |
| H0+4h | Checar taxa de erro do `/api/auth/register` e do checkout | Vercel → Logs |
| Fim do dia | Fechar números: visitas, cadastros, `sign_up`, `begin_checkout`, `purchase` | GA4 → Explorar |
| Fim do dia | Crons verdes? algum webhook com falha? | Vercel + Stripe → Webhooks |

### Sinais de que algo quebrou (e o que fazer)

- `sign_up` zero com bastante visita → GA mal configurado **ou** rota de cadastro
  falhando: abra a aba Network e faça um cadastro você mesmo.
- Visita alta e `begin_checkout` zero → o paywall não está aparecendo (cheque
  `/planos` logado e deslogado).
- `begin_checkout` alto e `purchase` zero → Stripe em modo teste, env de produção
  errada ou webhook sem segredo.
- Pico de 500 em `/api/*` → provável cota de fonte (ESPN/API-Football): veja
  `[espn]`/`fetch failed` no log e considere subir o cache antes de continuar o
  anúncio.
- Reclamação de push que não chega → confirme se o usuário instalou o PWA
  (push web exige) e se o opt-in de "⚽ Gols" está ligado em `/config`.

### Plano B

- Se o tráfego derrubar alguma fonte externa: reduzir o anúncio, não aumentar o
  polling. O app degrada mostrando "sem dados" em vez de número inventado.
- Se aparecer bug feio: Vercel → Deployments → *Promote* no deploy anterior.
  Rollback é instantâneo e não mexe no banco.

---

## 3. Tratamento de objeções

**"Mais um site de palpite?"**
> Entendo. A diferença é que aqui dá para auditar: o pick é gravado antes do
> jogo e liquidado depois, e o ROI só conta pick que tinha odd publicada. Se o
> modelo não vê vantagem na linha, ele não emite pick — o produto é feito para
> dizer "não" também.

**"Se vocês acertassem tanto, não venderiam assinatura."**
> Não vendemos acerto, vendemos o cálculo. O Track Record está aberto com a
> amostra do lado: {{amostra}} liquidadas, {{acerto}} de acerto, ROI {{roi}}.
> Aposta tem variância; quem promete lucro garantido está mentindo. 18+.

**"Por que o EV desaparece em algumas combinadas?"**
> Porque as pernas são correlacionadas (ex.: BTTS e over 2.5 no mesmo jogo). O
> EV clássico assume eventos independentes; multiplicar probabilidade dependente
> infla o número. Preferimos esconder o EV a mostrar um valor falso — e avisamos
> na tela.

**"Por que o EV só usa odd da Pinnacle?"**
> É a referência de mercado mais eficiente que conseguimos ler de forma
> confiável. Usar a odd de uma casa pequena inflaria o EV artificialmente. Sem
> odd da Pinnacle, a perna entra sem EV.

**"Isso é palpite de IA? ChatGPT analisando jogo?"**
> Não. É modelo estatístico determinístico (Poisson com peso por recência e xG
> no λ) sobre dados reais de partidas. O mesmo jogo, com os mesmos dados, gera o
> mesmo número — dá para reproduzir.

**"Como sei que o histórico não foi editado?"**
> O pick é gravado no banco antes do apito e liquidado por um cron no fim do
> jogo. Não existe rota de edição retroativa de resultado; o Track Record mostra
> greens, reds e pendentes juntos. Se um dia editar, o histórico inteiro perde o
> valor — é o nosso ativo.

**"Não tenho tempo de ler análise."**
> O plano grátis dá 1 análise por dia: você abre o jogo, vê a probabilidade e a
> odd e decide em 30 segundos. Se quiser mais, os planos liberam 6, 20 ou
> ilimitado — cancelamento pelo próprio Stripe.

**"É seguro pagar?"**
> Cartão via Stripe, sem passar pela nossa base. Cancele quando quiser no portal
> do cliente. O acesso VIP é vinculado à sua conta, não ao aparelho.

---

## 4. Métricas do lançamento (meta, não promessa)

Anotar no fim do dia D:

| Métrica | Onde | Meta inicial |
|---|---|---|
| Visitas | GA4 | — (baseline) |
| `sign_up` / visitas | GA4 | ≥ 3% |
| `begin_checkout` / `sign_up` | GA4 | ≥ 5% |
| `purchase` / `begin_checkout` | GA4 | ≥ 30% |
| Erros 5xx | Vercel Logs | < 1% das requests |
| Cadastros com trial negado | log `[register]` | monitorar (fraude × suporte) |
