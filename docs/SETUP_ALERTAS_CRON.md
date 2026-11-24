# Alertas ao vivo — como ligar o cron de 1 minuto

A rota **`GET /api/cron/live`** é o watcher de gol e de kickoff. Ela foi escrita para
rodar **a cada minuto**, mas o Vercel Cron do plano **Hobby só aceita 1 execução por
dia** — por isso a entrada `* * * * *` foi removida do `vercel.json` (manter ali
quebraria o deploy). No plano Pro basta recriar a entrada. No Hobby, use um agendador
externo, como o cron-job.org.

---

## 1. Configurar a env (Vercel → Settings → Environment Variables)

| Variável | Para que serve |
|---|---|
| `LIVE_CRON_SECRET` | Segredo da rota. Sem ele a rota responde **503** de propósito (falha fechada). |
| `CRON_SECRET` | Só necessário se você usar o Vercel Cron (Pro). |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Push do app Android via Firebase. |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | Push do navegador (PWA). |

Gere o segredo:

```bash
openssl rand -hex 16
```

Copie o valor para a env na Vercel **e** guarde no gerenciador de senhas. Trocar o
segredo depois exige atualizar o agendador no mesmo instante.

## 2. Testar uma vez (sem laço)

```bash
curl -sS "https://SEU_DOMINIO/api/cron/live?secret=SEU_SEGREDO&debug=1"
```

Respostas esperadas:

- `{"ok":true,"vivos":0,"eventos":0,"enviados":0}` — nenhum jogo ao vivo agora. Está certo.
- `{"ok":true,"vivos":3,"eventos":1,"enviados":2}` — detectou 1 evento e mandou para 2 dispositivos.
- `{"error":"Não autorizado."}` com HTTP 503 — segredo ausente/errado na env ou na URL.

Com `debug=1` a resposta traz `vistos`, a lista de `id:placar` que o ciclo leu. É a
prova de que a leitura em lote está funcionando.

## 3. cron-job.org

1. Crie a conta em <https://cron-job.org> e confirme o e-mail.
2. **Create cronjob**.
3. **Title**: `GreenScore · watcher ao vivo`.
4. **URL**: `https://SEU_DOMINIO/api/cron/live?secret=SEU_SEGREDO`
   (o segredo vai na query para não depender de header custom).
5. **Schedule**: *Every 1 minute*. Fuso: `America/Sao_Paulo`.
6. **Request method**: `GET`. Não envie corpo.
7. Em **Advanced**: marque para guardar o histórico das últimas execuções e ative
   notificação por e-mail quando falhar 2× seguidas.
8. **Test run** uma vez antes de salvar — precisa voltar HTTP 200.

Alternativas com o mesmo contrato: EasyCron, Upstash QStash (schedule), GitHub Actions
com `schedule: */1 * * * *` (menos confiável, atrasa em picos de carga), ou um
`crontab` em qualquer VPS:

```cron
* * * * * curl -fsS "https://SEU_DOMINIO/api/cron/live?secret=SEU_SEGREDO" >/dev/null
```

## 4. Custo e limites — não aperte o intervalo

Cada execução faz **uma** varredura em lote do scoreboard: 18 requisições às ligas
canônicas, com cache de 45 s no servidor. Nenhuma chamada por jogo.

- Intervalo **mínimo** recomendado: 60 s. Abaixo disso o cache não é aproveitado e o
  Akamai do ESPN pode devolver 403 para o IP inteiro.
- Fora do horário de jogos a rota gasta as mesmas 18 requisições e não envia nada.
  Se quiser economizar, agende só entre 10h e 01h (Brasília).
- O `alert_state` guarda o placar anterior e os eventos já enviados por até 7 dias;
  a tabela não cresce sem limite.

## 5. Checklist de "está funcionando"

- [ ] `/api/cron/live?secret=...` devolve 200 com `ok:true`.
- [ ] Um usuário ligou **⚽ Gols** e **🟢 Início de jogo** em `/config` (ou na página do
      jogo) — é o opt-in que o watcher consulta.
- [ ] Sai um gol em jogo de liga coberta → o push chega em até 60 s.
- [ ] O mesmo gol **não** chega duas vezes (dedupe por `matchId:gol:1-0`).
- [ ] 15 min antes do apito, o lembrete de kickoff chega uma única vez.
