#!/usr/bin/env bash
# Roda as suítes unitárias das camadas puras (sem rede, sem banco, sem build).
#
# Os módulos .ts de src/lib são transpilados numa única passada do esbuild para
# um diretório temporário; os testes .cjs rodam em paralelo contra o JS gerado.
# Se um módulo ganhar um import de runtime (db, fetch, next), o teste quebra
# aqui em vez de quebrar em produção.
#
# A checagem de tipos NÃO é feita neste script (é lenta no celular): rode
# `npm run typecheck` para isso.
#
#   ./scripts/unit-tests.sh                 # todas as suítes
#   ./scripts/unit-tests.sh forma           # só as que casam com o filtro
#   JOBS=1 ./scripts/unit-tests.sh          # sem paralelismo (output ao vivo)
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

FILTRO="${1:-}"
JOBS="${JOBS:-6}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BUILD="$TMP/build"

# nome|teste .cjs
SUITES+=(
  "formaRecente|src/lib/formaRecente.test.cjs"
  "blocoAnalises|src/lib/blocoAnalises.test.cjs"
  "h2hPalpite|src/lib/h2hPalpite.test.cjs"
  "apitou-engine|src/lib/apitou/engine.test.cjs"
  "veredito|src/lib/veredito.test.cjs"
  "mainLeagues|src/lib/mainLeagues.test.cjs"
  "trackStats|src/lib/trackStats.test.cjs"
  "accessMessage|src/lib/accessMessage.test.cjs"
  "quotaLocal|src/lib/quotaLocal.test.cjs"
  "trialCountdown|src/lib/trialCountdown.test.cjs"
  "playerPropsEngine|src/lib/playerPropsEngine.test.cjs"
  "winProb|src/lib/winProb.test.cjs"
  "comboBuilder|src/lib/comboBuilder.test.cjs"
  "comboDoDia|src/lib/comboDoDia.test.cjs"
  "alertDiff|src/lib/alertDiff.test.cjs"
  "stripePolicy|src/lib/stripePolicy.test.cjs"
  "analytics|src/lib/analytics.test.cjs"
  "duelosEngine|src/lib/duelosEngine.test.cjs"
  "h2hEngine|src/lib/h2hEngine.test.cjs"
  "vereditoEngine|src/lib/vereditoEngine.test.cjs"
  "pilares|src/lib/pilares.test.cjs"
  "valueBet|src/lib/valueBet.test.cjs"
  "acertosRecentes|src/lib/acertosRecentes.test.cjs"
  "golsLadder|src/lib/golsLadder.test.cjs"
  "momentum|src/lib/momentum.test.cjs"
  "trialPolicy|src/lib/trialPolicy.test.cjs"
  "quota|src/lib/quota.test.cjs"
  "cronAuth|src/lib/cronAuth.test.cjs"
  "semana|src/lib/semana.test.cjs"
  "arbitros|src/lib/arbitros.test.cjs"
  "oportunidadeFiltros|src/lib/oportunidadeFiltros.test.cjs"
  "rankingsEngine|src/lib/rankingsEngine.test.cjs"
  "cache|src/lib/cache.test.cjs"
  "idadeDado|src/lib/idadeDado.test.cjs"
  "particoes|src/lib/apitou/particoes.test.cjs"
  "tiebreak|src/lib/hub/tiebreak.test.cjs"
  "amostra|src/lib/hub/amostra.test.cjs"
  "seoLigas|src/lib/seoLigas.test.cjs"
  "apitou-fonte|src/lib/apitou/fonte.test.cjs"
  "apitou-analises|src/lib/apitou/analises.test.cjs"
  "nerdytips-fonte|src/lib/nerdytips/fonte.test.cjs"
  "smTempos|src/lib/smTempos.test.cjs"
  "clv|src/lib/clv.test.cjs"
  "competencia|src/lib/competencia.test.cjs"
  "espnTempos|src/lib/espnTempos.test.cjs"
  "tendencias|src/lib/tendencias.test.cjs"
  "screener|src/lib/screener.test.cjs"
  "screenerProps|src/lib/screenerProps.test.cjs"
  "searchIndex|src/lib/searchIndex.test.cjs"
)

# --- 1. Seleciona as suítes -------------------------------------------------
SELECIONADAS=()
for suite in "${SUITES[@]}"; do
  nome="${suite%%|*}"
  if [ -n "$FILTRO" ] && [[ "$nome" != *"$FILTRO"* ]]; then continue; fi
  SELECIONADAS+=("$suite")
done

if [ "${#SELECIONADAS[@]}" -eq 0 ]; then
  echo "Nenhuma suíte casa com o filtro '$FILTRO'"
  exit 1
fi

# --- 2. Transpila src/lib inteiro de uma vez --------------------------------
# Compilar a árvore toda (e não só os fontes citados) resolve as dependências
# transitivas sem precisar declará-las à mão.
FONTES=()
while IFS= read -r f; do FONTES+=("$f"); done < <(find src/lib -name "*.ts" ! -name "*.d.ts")

ESBUILD="node_modules/.bin/esbuild"
if [ -x "$ESBUILD" ]; then
  if ! "$ESBUILD" "${FONTES[@]}" --outbase=src --outdir="$BUILD" \
      --format=cjs --platform=node --target=node20 \
      --log-level=warning >"$TMP/build.log" 2>&1; then
    echo "❌ falha ao transpilar os módulos"
    cat "$TMP/build.log"
    exit 1
  fi
else
  # fallback sem esbuild: tsc em lote
  echo "⚠ esbuild não encontrado, usando tsc (mais lento)"
  TSC="node_modules/.bin/tsc"
  [ -x "$TSC" ] || TSC="npx tsc"
  if ! "$TSC" "${FONTES[@]}" --rootDir src --outDir "$BUILD" \
      --target es2022 --module commonjs --skipLibCheck >"$TMP/build.log" 2>&1; then
    echo "❌ falha ao compilar os módulos"
    cat "$TMP/build.log"
    exit 1
  fi
fi

# --- 3. Copia cada teste para perto do JS que ele requer --------------------
mkdir -p "$TMP/out"
for i in "${!SELECIONADAS[@]}"; do
  IFS='|' read -r nome teste <<<"${SELECIONADAS[$i]}"
  rel="${teste#src/}"                       # lib/foo.test.cjs
  destino="$BUILD/$(dirname "$rel")"
  mkdir -p "$destino"
  cp "$teste" "$destino/"
  # testes que leem fixtures: o teste usa __dirname, então a pasta viaja junto
  fixdir="$(dirname "$teste")/__fixtures__"
  if [ -d "$fixdir" ]; then cp -r "$fixdir" "$destino/"; fi
done

# --- 4. Roda em paralelo, guardando saída e código de cada suíte ------------
rodar() {
  local i="$1" nome="$2" teste="$3"
  local rel="${teste#src/}"
  local alvo="$BUILD/$(dirname "$rel")/$(basename "$teste")"
  node "$alvo" >"$TMP/out/$i.log" 2>&1
  echo $? >"$TMP/out/$i.rc"
  return 0
}

# em lotes de $JOBS: evita spam de forks com `jobs` e não afoga o celular
lote=0
for i in "${!SELECIONADAS[@]}"; do
  IFS='|' read -r nome teste <<<"${SELECIONADAS[$i]}"
  rodar "$i" "$nome" "$teste" &
  lote=$((lote + 1))
  if [ "$lote" -ge "$JOBS" ]; then wait; lote=0; fi
done
wait

# --- 5. Relatório -----------------------------------------------------------
FALHAS=0
OK=0
for i in "${!SELECIONADAS[@]}"; do
  IFS='|' read -r nome teste <<<"${SELECIONADAS[$i]}"
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "▶ $nome"
  echo "════════════════════════════════════════════════════════════"
  cat "$TMP/out/$i.log"
  if [ "$(cat "$TMP/out/$i.rc" 2>/dev/null || echo 1)" = "0" ]; then
    OK=$((OK + 1))
  else
    FALHAS=$((FALHAS + 1))
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
if [ "$FALHAS" -eq 0 ]; then
  echo "✅ $OK suíte(s) verde(s)"
  exit 0
fi
echo "❌ $FALHAS suíte(s) com falha, $OK verde(s)"
exit 1
