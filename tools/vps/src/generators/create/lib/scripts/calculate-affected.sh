#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz (v5 - Use nx show projects)
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# --- Use nx show projects --affected --with-target --json ---
echo "[calculate-affected.sh] Running nx show projects --affected --with-target=deploy --json command..."
RAW_AFFECTED_OUTPUT=""
NX_EXIT_CODE=0
# Intentar obtener la configuración de los proyectos afectados con el target como JSON
RAW_AFFECTED_OUTPUT=$(npx nx show projects --affected --with-target=deploy --json --base=$NX_BASE --head=$NX_HEAD --exclude=tag:type:other-app || true)
NX_EXIT_CODE=$?

echo "[calculate-affected.sh] nx show projects exit code: $NX_EXIT_CODE"
echo "[calculate-affected.sh] Raw output from nx show projects:"
echo "--------------------- BEGIN RAW OUTPUT ---------------------"
echo "$RAW_AFFECTED_OUTPUT"
echo "---------------------- END RAW OUTPUT ----------------------"

AFFECTED_JSON="[]" # Default

# Verificar si el comando tuvo éxito y la salida no está vacía o es un objeto vacío/null
if [ $NX_EXIT_CODE -eq 0 ] && [ -n "$RAW_AFFECTED_OUTPUT" ] && [ "$RAW_AFFECTED_OUTPUT" != "{}" ] && [ "$RAW_AFFECTED_OUTPUT" != "null" ]; then
    echo "[calculate-affected.sh] Attempting to parse JSON keys (project names) with jq..."
    # Asumimos que la salida es un objeto JSON donde las CLAVES son los nombres de proyecto: {"proj1":{...}, "proj2":{...}}
    # Extraer las claves (nombres) a un array JSON
    AFFECTED_JSON=$(echo "$RAW_AFFECTED_OUTPUT" | jq -c 'keys' 2>/dev/null || echo '[]')
    JQ_EXIT_CODE=$?

    # Validar que el resultado sea un array y no esté vacío
    if ! echo "$AFFECTED_JSON" | jq -e 'type=="array" and length > 0' > /dev/null 2>&1; then
         echo "[calculate-affected.sh] WARNING: Failed to extract project names as JSON array or array is empty. jq exit code: $JQ_EXIT_CODE."
         AFFECTED_JSON="[]" # Fallback
    else
        echo "[calculate-affected.sh] Extracted project names JSON: $AFFECTED_JSON"
    fi
else
    echo "[calculate-affected.sh] WARNING: 'nx show projects' failed or produced no relevant output. Assuming no projects affected."
    AFFECTED_JSON="[]"
fi

# Exportar para Node.js
export AFFECTED_JSON

# Usar node para construir la matriz (Node script sin cambios)
MATRIX_OBJECT=$(node -e " /* ... Mismo código Node ... */ " || echo '{"include":[]}')
HAS_AFFECTED=$(node -e "try { console.log(JSON.parse(process.env.AFFECTED_JSON || '[]').length > 0 ? 'true' : 'false'); } catch { console.log('false'); }" || echo 'false')

echo "[calculate-affected.sh] Generated Matrix Object: $MATRIX_OBJECT"
echo "[calculate-affected.sh] Has Affected Projects: $HAS_AFFECTED"
echo "matrix=$(echo $MATRIX_OBJECT | jq -c .)" >> $GITHUB_OUTPUT
echo "has_affected=$HAS_AFFECTED" >> $GITHUB_OUTPUT
echo "[calculate-affected.sh] Outputs set for GitHub Actions."
