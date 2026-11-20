#!/usr/bin/env bash
# Roda as suítes unitárias das camadas puras (sem rede, sem banco, sem build).
#
# Cada módulo .ts é compilado sozinho para um diretório temporário e o teste
# .cjs correspondente roda contra o JS gerado. É de propósito: se o módulo
# ganhar um import de runtime (db, fetch, next), o teste quebra aqui em vez de
# quebrar em produção.
#
#   ./scripts/unit-tests.sh          # todas as suítes
#   ./scripts/unit-tests.sh forma    # só as que casam com o filtro
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

FILTRO="${1:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FALHAS=0
OK=0
SUITES=()

# nome|arquivos .ts a compilar|teste .cjs
SUITES+=(
  "formaRecente|src/lib/formaRecente.ts|src/lib/formaRecente.test.cjs"
  "blocoAnalises|src/lib/blocoAnalises.ts src/lib/formaRecente.ts|src/lib/blocoAnalises.test.cjs"
  "h2hPalpite|src/lib/h2hPalpite.ts|src/lib/h2hPalpite.test.cjs"
  "apitou-engine|src/lib/apitou/engine.ts src/lib/formaRecente.ts|src/lib/apitou/engine.test.cjs"
  "veredito|src/lib/veredito.ts src/lib/formaRecente.ts|src/lib/veredito.test.cjs"
  "mainLeagues|src/lib/mainLeagues.ts|src/lib/mainLeagues.test.cjs"
  "trackStats|src/lib/trackStats.ts|src/lib/trackStats.test.cjs"
  "accessMessage|src/lib/accessMessage.ts|src/lib/accessMessage.test.cjs"
  "trialCountdown|src/lib/trialCountdown.ts|src/lib/trialCountdown.test.cjs"
  "playerPropsEngine|src/lib/playerPropsEngine.ts|src/lib/playerPropsEngine.test.cjs"
  "duelosEngine|src/lib/duelosEngine.ts src/lib/playerPropsEngine.ts|src/lib/duelosEngine.test.cjs"
  "h2hEngine|src/lib/h2hEngine.ts|src/lib/h2hEngine.test.cjs"
  "vereditoEngine|src/lib/vereditoEngine.ts src/lib/h2hEngine.ts src/lib/model.ts src/lib/formWeight.ts|src/lib/vereditoEngine.test.cjs"
  "trialPolicy|src/lib/trialPolicy.ts|src/lib/trialPolicy.test.cjs"
  "cronAuth|src/lib/cronAuth.ts|src/lib/cronAuth.test.cjs"
)

for suite in "${SUITES[@]}"; do
  IFS='|' read -r nome fontes teste <<<"$suite"
  if [ -n "$FILTRO" ] && [[ "$nome" != *"$FILTRO"* ]]; then continue; fi

  dir="$TMP/$nome"
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "▶ $nome"
  echo "════════════════════════════════════════════════════════════"

  if ! npx tsc $fontes --target es2022 --module commonjs --outDir "$dir" --skipLibCheck >"$dir.tsc.log" 2>&1; then
    echo "❌ $nome: falha ao compilar"
    cat "$dir.tsc.log"
    FALHAS=$((FALHAS + 1))
    continue
  fi

  # O tsc preserva a estrutura a partir do diretório comum dos fontes, então o
  # teste é copiado para perto do JS que ele requer.
  base="$(dirname "$teste")"
  destino="$dir"
  if [ ! -f "$dir/$(basename "${fontes%% *}" .ts).js" ]; then
    # casos com subpasta (apitou): o output fica em <dir>/apitou/
    if [ -f "$dir/apitou/$(basename "${fontes%% *}" .ts).js" ]; then destino="$dir/apitou"; fi
  fi
  cp "$teste" "$destino/"

  if node "$destino/$(basename "$teste")"; then
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
