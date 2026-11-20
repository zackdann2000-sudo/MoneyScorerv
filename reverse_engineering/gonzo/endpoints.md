# Gonzo Tips 1.1.4 — superfície de rede (análise estática)

Fonte: `Gonzo+Tips_+Football+Picks_1.1.4_APKPure.xapk` (17 MB) → `com.gonzo.tips.apk` (2,7 MB base) +
`config.armeabi_v7a.apk` (13,8 MB, libs nativas).

**Descoberta central:** o app é **Flutter** e **não tem backend REST próprio**. Todo o conteúdo vem do
**Firebase / Cloud Firestore**. Não existe `api.gonzo...`, nem domínio de API no `classes.dex`.

## 1. `classes.dex` — só SDK do Google

O comando pedido (`grep -a -o 'https\?://[^" ]*' classes*.dex`) devolve apenas URLs de SDK:

```
https://accounts.google.com/o/oauth2/revoke?token=
https://app-measurement.com/a
https://app-measurement.com/s/d
https://firebaseinstallations.googleapis.com/v1/
https://pagead2.googlesyndication.com/pagead/gen_204?id=gmob-apps
https://play.google.com/store/apps/details?id=
https://play.google.com/store/search?q=otpauth&c=apps
https://www.googleadservices.com/pagead/conversion/app/deeplink?id_type=adid&sdk_version=
https://www.googleapis.com/auth/games
https://www.googleapis.com/auth/games_lite
https://www.recaptcha.net/recaptcha/api
https://developer.android.com/... (docs de integridade/review, in-app purchase)
https://firebase.google.com/support/privacy/init-options
https://developers.google.com/tink/faq/registration_errors
https://github.com/flutter/packages/blob/main/packages/in_app_purchase/...
https://issuetracker.google.com/issues/...
https://youtrack.jetbrains.com/issue/KT-55980
```

Nota de método: o grep bruto junta strings do pool do DEX (`http://localhost` + `http://ns.adobe.com/xap/1.0/`
aparecem colados), por isso a lista acima foi normalizada com `tr -d '\000'` e `sort -u`.
Nenhuma URL de produto. `strings classes.dex | grep -i betway` → vazio.

## 2. `lib/armeabi-v7a/libapp.so` — aqui está o app de verdade

Flutter compila Dart AOT para `libapp.so`. É lá que ficam as constantes:

```
https://betway-f0d42.web.app/#/     ← site oficial (Firebase Hosting, rota por hash)
mailto:tbwthebetsway@gmail.com?subject=Gonzo%20Contact
package:betway/...                  ← nome real do pacote Dart ("betway", não "gonzo")
```

## 3. Backend = Firebase

Lido de `resources.arsc` (config `google-services` compilada) e de `classes.dex` (chaves de recurso):

| chave | valor observado |
|---|---|
| `project_id` | `betway-f0d42` |
| `firebase_database_url` | `betway-f0d42.appspot.com` (legado; a URL viva seria `https://betway-f0d42-default-rtdb.<região>.firebasedatabase.app`) |
| `google_app_id` | presente |
| `gcm_defaultSenderId` | presente (FCM) |
| `google_api_key` | `AIzaSyAz6P…kHdY` (chave pública de cliente Firebase — **mascarada aqui de propósito**) |
| `google_storage_bucket` | presente |

Serviços do Firebase no APK (properties empacotadas): `firebase-analytics`, `firebase-auth`,
`firebase-database`, `firebase-firestore` (via `FirestorePigeonFirebaseApp`, `AggregateQuery`,
`MethodChannelCollectionReference`), `play-services-ads-identifier`, `recaptcha`.

### Formato do "endpoint"

Não há rota HTTP própria. O acesso é SDK direto ao Firestore, que por baixo é REST:

```
https://firestore.googleapis.com/v1/projects/betway-f0d42/databases/(default)/documents/<coleção>
https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<apiKey>   (Firebase Auth)
https://fcm.googleapis.com/v1/projects/betway-f0d42/messages:send                     (push, server-side)
```

**Coleções não confirmadas.** O `libapp.so` guarda poucas strings soltas de nome de coleção
(`user`, `subscriptions`, `history`, `version`, `premium` aparecem como palavras isoladas, mas sem
contexto de caminho). Enumeration exigiria chamar o Firestore deles sem autenticação — **não foi feito**,
por ser acesso a dado privado e não análise estática.

## 4. Modelo de dados inferido (nomes de campo reais no binário)

`tip_data_model.dart` + `user_model.dart`, campos confirmados por `grep -x` no `libapp.so`:

- tip: `homeTeam`, `awayTeam`, `date`, `probability`, `result`, `status`, `homeScore`, `awayScore`
- user: `email`, `deviceId`, `token`, `subscription`, `name`
- IAP: `gonzo_bets_weekly_subscription`, `gonzo_bets_monthly_subscription`, `gonzo_bets_yearly_subscription`

Implicação de produto: o palpite é **probabilidade + placar final**, sem odd armazenada — logo o app não
calcula EV nem ROI. Não há `odd`, `stake`, `market`, `confidence` no binário.

## 5. O que **não** existe no APK

- Sem `Retrofit`/`Dio` com baseUrl de domínio próprio, sem `supabase`, sem `execute-api`.
- Sem chave de API de terceiro (API-Football, SportMonks, etc.) — a "inteligência" é servida pronta pelo Firestore.
- Sem `firebase-functions`/`cloudfunctions.net` hardcoded.
