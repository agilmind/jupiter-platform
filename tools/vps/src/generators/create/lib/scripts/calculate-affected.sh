#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz (v2 Debug)
# ==============================================================================
set -euo pipefail # Mantenemos pipefail, pero capturaremos errores

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# --- Paso de Depuración: Capturar y mostrar salida cruda ---
echo "[calculate-affected.sh] Running nx affected command..."
# Ejecutar comando y capturar salida y código de error por separado
# Usamos || true para que el script no falle aquí si nx affected devuelve error, queremos analizarlo
RAW_AFFECTED_OUTPUT=$(npx nx affected --target=deploy --base=$NX_BASE --head=$NX_HEAD --json --exclude=tag:type:other-app || true)
NX_EXIT_CODE=$? # Capturar código de salida real (puede ser 0 incluso si hubo output de error)

echo "[calculate-affected.sh] nx affected command finished." # Código de salida no fiable aquí si usamos || true
echo "[calculate-affected.sh] Raw output from nx affected command:"
echo "--------------------- BEGIN RAW OUTPUT ---------------------"
echo "$RAW_AFFECTED_OUTPUT"
echo "---------------------- END RAW OUTPUT ----------------------"
# --- Fin Paso de Depuración ---

# Intentar parsear con jq, pero ser más robustos
echo "[calculate-affected.sh] Attempting to parse JSON with jq..."
# Usamos <<< para pasar el string a jq, y manejamos el error de jq explícitamente
AFFECTED_JSON=$(jq -c '.projects' <<< "$RAW_AFFECTED_OUTPUT" 2>/dev/null || echo '[]') # Redirigir error de jq a /dev/null, fallback a []
JQ_EXIT_CODE=$?

if [[ "$AFFECTED_JSON" == "null" || -z "$AFFECTED_JSON" || $JQ_EXIT_CODE -ne 0 ]]; then
    echo "[calculate-affected.sh] WARNING: jq parsing failed or result was null/empty. Treating as no affected projects."
    if [[ $JQ_EXIT_CODE -ne 0 ]]; then
        echo "[calculate-affected.sh] jq exit code: $JQ_EXIT_CODE"
    fi
    AFFECTED_JSON="[]" # Asegurar que sea un array vacío válido
fi

echo "[calculate-affected.sh] Parsed/Fallback Affected Projects JSON: $AFFECTED_JSON"

# Exportar para Node.js
export AFFECTED_JSON

# Usar node para construir la matriz (igual que antes)
MATRIX_OBJECT=$(node -e "
  try { /* ... Mismo código Node ... */ console.log(JSON.stringify({ include: includeList })); } catch (e) { /* ... */ console.log(JSON.stringify({ include: [] })); }
" || echo '{"include":[]}')

HAS_AFFECTED=$(node -e "try { console.log(JSON.parse(process.env.AFFECTED_JSON || '[]').length > 0 ? 'true' : 'false'); } catch { console.log('false'); }" || echo 'false')

echo "[calculate-affected.sh] Generated Matrix Object: $MATRIX_OBJECT"
echo "[calculate-affected.sh] Has Affected Projects: $HAS_AFFECTED"

echo "matrix=$(echo $MATRIX_OBJECT | jq -c .)" >> $GITHUB_OUTPUT
echo "has_affected=$HAS_AFFECTED" >> $GITHUB_OUTPUT

echo "[calculate-affected.sh] Outputs set for GitHub Actions."

# Opcional: si quieres que el paso falle si nx/jq fallaron gravemente antes
# if [ $NX_EXIT_CODE -ne 0 ] || [ $JQ_EXIT_CODE -ne 0 ]; then
#   echo "[calculate-affected.sh] Exiting with error due to previous failures."
#   exit 1
# fi
