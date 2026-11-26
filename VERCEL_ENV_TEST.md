# Teste de Environment Variables na Vercel

Arquivo criado **de propósito** para forçar um build novo, sem cache de build,
e provar qual conjunto de variáveis a Vercel realmente injeta em Production.

## Por que um commit novo e não o botão "Redeploy"

O "Redeploy" da Vercel reaproveita o build cacheado do deployment anterior
quando nada no código mudou. Variáveis `NEXT_PUBLIC_*` são **inlinadas no bundle
em tempo de build** — se o build é reaproveitado, o bundle antigo volta com os
valores antigos (ou seja: vazios). Um commit novo invalida o cache e força o
build do zero. Este arquivo existe só para isso.

## As 8 variáveis que o código espera

Servidor (envio do push — não são as públicas):

| Nome | Onde é usada |
| --- | --- |
| `FCM_PROJECT_ID` | `src/lib/fcm.ts` |
| `FCM_CLIENT_EMAIL` | `src/lib/fcm.ts` |
| `FCM_PRIVATE_KEY` | `src/lib/fcm.ts` |

Cliente (gerar o token no navegador — inlinadas no build):

| Nome | Onde é usada |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `src/lib/firebaseClient.ts` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `src/lib/firebaseClient.ts` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `src/lib/firebaseClient.ts` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `src/lib/firebaseClient.ts` |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | `src/lib/firebaseClient.ts` |

Todas em **escopo Production**. Nenhum valor secreto é registrado aqui.

## Blindagem aplicada no código

1. `.trim()` em **todo** valor lido (`src/lib/fcm.ts` e `src/lib/firebaseClient.ts`),
   com contagem de quantos caracteres invisíveis foram removidos.
2. O diagnóstico passou a comparar o **comprimento após o `.trim()`**, não
   `Boolean(valor)` — `Boolean(" ")` é `true` e escondia variável vazia.
3. `/api/push/status` agora audita os **nomes** das variáveis: quais o runtime
   recebeu, quais estão ausentes e quais vieram com espaço/quebra no nome
   (esse caso nenhum `.trim()` de valor conserta — tem que regravar na Vercel).

## Como validar depois do deploy

```bash
curl -s "https://SEU-DOMINIO/api/push/status?secret=$CRON_SECRET" | jq '.envs, .servidor.espacosRemovidos, .cliente'
```

Leitura do resultado:

- `envs.nomesPresentes` — os nomes reais que chegaram ao processo. Se faltar
  algum, o problema é de painel/escopo, não de código.
- `envs.nomesComEspacoOculto` — precisa vir `[]`. Se tiver item, regrave a
  variável na Vercel (copie o nome do README acima, não do painel).
- `envs.nomesAusentes` — precisa vir `[]`.
- `envs.espacosRemovidosNoValor` — se aparecer, o `.trim()` salvou o deploy;
  opcionalmente limpe o valor no painel.
- `servidor.chaveAssina` — `true` significa que a `FCM_PRIVATE_KEY` é um PEM
  válido que assina de verdade, não só uma string preenchida.

## Checklist de causa raiz na Vercel

- A variável está em **Production**, e o commit foi para a branch de produção
  (`main`) — variável de Preview não vale no domínio principal.
- O nome não tem espaço no início/fim (copiar do painel arrasta espaço).
- Para `FCM_PRIVATE_KEY`: valor contém `-----BEGIN PRIVATE KEY-----` e
  `-----END PRIVATE KEY-----`; `\n` literais e JSON inteiro da service account
  são aceitos e normalizados.
- Sensitive/Encrypted está OK para `FCM_PRIVATE_KEY`; só não dá para reler o
  valor depois — para conferir nome e escopo use `vercel env ls production`.
