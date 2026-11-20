# Gonzo Tips — recon estático (v1.1.4, code 18)

Análise **estática** do XAPK oficial de APKPure. Sem login, sem chamadas à API deles, sem descompilar
bytecode (apenas `unzip` + `strings`).

## Ficha técnica

| item | valor |
|---|---|
| package | `com.gonzo.tips` |
| versão | 1.1.4 (code 18) |
| SDK | min 24 · target 36 |
| stack | **Flutter** (Dart AOT em `libapp.so`) + Firebase |
| nome do pacote Dart | `betway` (herança de um template; o app é Gonzo) |
| base APK | `com.gonzo.tips.apk` 2,7 MB |
| libs nativas | `config.armeabi_v7a.apk` 13,8 MB (só ARMv7 — sem arm64, roda em emulação) |
| monoide | `en`, `es`, `pt`, `fr`, `de`, `it`, `ru`, `ar`, `hi`, `ja`, `ko`, `zh`, `th`, `tr`, `vi`, `in`, `my` |
| permissões | INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, **BILLING**, AD_ID, GET_INSTALL_REFERRER, READ_EXTERNAL_STORAGE |

Sem permissão de localização, câmera, contatos ou SMS. Só rede + billing + storage.

## Telas (arquivos reais em `views/screens/`)

| # | tela | função |
|---|---|---|
| S01 | `main_page.dart` | shell com navegação entre tips free/premium/conta |
| S02 | `free_tips_screen.dart` | palpites grátis do dia |
| S03 | `premium_tips_screen.dart` | palpites premium (bloqueados por assinatura) |
| S04 | `previous_tips_screen.dart` | histórico de palpites anteriores |
| S05 | `tips_screen.dart` | lista/cards de tips |
| S06 | `account_screen.dart` | conta, assinatura, rate review, logout |
| S07 | `terms_and_conditions_screen.dart` | termos + política de privacidade |

Widgets: `date_card`, `free_card`, `premium_card`, `score_card`, `team_card` — confirma a estrutura do
card: **time casa × time fora · data · probabilidade · placar**.

Views cabeadas: `AccountScreen`, `FreeTipsScreen`, `PremiumTipsScreen`, `PreviousTipsScreen`, `TipsScreen`, `TermsScreen`.

## Controllers (é aqui que mora a lógica)

`tips_controller`, `subscription_controller`, `purchase_controller`, `user_data_controller`,
`main_page_controller`, `helper_controller` + `constants/app_constants.dart` e `constants/queries.dart`.

`queries.dart` existe, mas os nomes das coleções do Firestore não sobrevivem como strings isoladas legíveis
no AOT — só palavras soltas (`user`, `subscriptions`, `history`, `version`, `premium`).

## Modelo de dados inferido

```
tip {
  homeTeam: string
  awayTeam: string
  date:     timestamp/string
  probability: number        // "confidence" numérica em %
  result:   string           // green/red/void
  status:   string
  homeScore: number?
  awayScore: number?
}

user {
  email, name, deviceId, token (FCM), subscription { status, expiry }
}
```

**Nenhum campo de odd, stake, mercado ou EV.** O produto vende probabilidade + palpite, não valor esperado.

## Monetização

- Google Play Billing only: `gonzo_bets_weekly_subscription`, `gonzo_bets_monthly_subscription`,
  `gonzo_bets_yearly_subscription`.
- Paywall binário: "Access to Premium Tips" / "Free tips are still available without subscription".
- Sem anúncios no fluxo de tips (só o SDK AdMob/AD_ID presente para analytics de instalação).
- Contato: `tbwthebetsway@gmail.com`. Site: `https://betway-f0d42.web.app/#/`.
- Claim legal repetido no app: "serviço de previsão baseado em probabilidades, não é aconselhamento",
  e "não é meio de aposta conforme a Lei 13/2011" (lei espanhola de jogo).

## Lacunas honestas

- **Nomes das coleções Firestore não observados.** Só seriam obtidos consultando o Firestore deles.
- **Regras de segurança do Firestore não observadas** (não estão no cliente).
- **Provedor dos dados estatísticos não aparece no APK** — a "IA" deles é um documento pronto no banco.
- **Preços** não são hardcoded: vêm do Play Console no momento da compra.
- Telas de estados de erro/vazio não inspecionadas (exigiria execução do app).
