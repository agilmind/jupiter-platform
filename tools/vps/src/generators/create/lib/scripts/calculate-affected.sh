#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz (v3 - Usa print-affected)
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# --- Usar nx print-affected para obtener solo la lista JSON ---
echo "[calculate-affected.sh] Running nx print-affected command..."
# Capturar salida y manejar errores de forma más robusta
RAW_AFFECTED_OUTPUT=""
NX_EXIT_CODE=0
# Usamos --select=projects para obtener solo los nombres de los proyectos
# La salida esperada es JSON: {"projects": ["proj1", "proj2"]}
RAW_AFFECTED_OUTPUT=$(npx nx print-affected --target=deploy --select=projects --json --base=$NX_BASE --head=$NX_HEAD --exclude=tag:type:other-app) || NX_EXIT_CODE=$?

echo "[calculate-affected.sh] nx print-affected exit code: $NX_EXIT_CODE"
echo "[calculate-affected.sh] Raw output from nx print-affected:"
echo "--------------------- BEGIN RAW OUTPUT ---------------------"
echo "$RAW_AFFECTED_OUTPUT"
echo "---------------------- END RAW OUTPUT ----------------------"

# Verificar si el comando falló o la salida está vacía
if [ $NX_EXIT_CODE -ne 0 ] || [ -z "$RAW_AFFECTED_OUTPUT" ]; then
    echo "[calculate-affected.sh] WARNING: 'nx print-affected' failed or produced empty output. Assuming no projects affected."
    AFFECTED_JSON="[]"
else
    # Intentar parsear con jq la propiedad 'projects'
    echo "[calculate-affected.sh] Attempting to parse .projects from JSON output with jq..."
    AFFECTED_JSON=$(echo "$RAW_AFFECTED_OUTPUT" | jq -c '.projects' 2>/dev/null || echo '[]')
    JQ_EXIT_CODE=$?

    if [[ "$AFFECTED_JSON" == "null" || $JQ_EXIT_CODE -ne 0 ]]; then
        echo "[calculate-affected.sh] WARNING: jq failed to parse '.projects' or result was null. Raw output logged above."
        AFFECTED_JSON="[]" # Asegurar array vacío
    fi
fi

echo "[calculate-affected.sh] Parsed/Fallback Affected Projects JSON: $AFFECTED_JSON"

# Exportar para Node.js
export AFFECTED_JSON

# Usar node para construir la matriz (igual que antes)
MATRIX_OBJECT=$(node -e "
  try {
    const projects = JSON.parse(process.env.AFFECTED_JSON || '[]');
    const validProjects = projects.filter(p => typeof p === 'string' && p.length > 0);
    const includeList = validProjects.map(p => ({
      vps_name: p,
      vps_name_upper: p.toUpperCase().replace(/-/g, '_')
    }));
    console.log(JSON.stringify({ include: includeList }));
  } catch (e) {
    console.error('[NodeScript] Error processing affected projects:', e);
    console.log(JSON.stringify({ include: [] }));
  }
" || echo '{"include":[]}')

HAS_AFFECTED=$(node -e "try { console.log(JSON.parse(process.env.AFFECTED_JSON || '[]').length > 0 ? 'true' : 'false'); } catch { console.log('false'); }" || echo 'false')

echo "[calculate-affected.sh] Generated Matrix Object: $MATRIX_OBJECT"
echo "[calculate-affected.sh] Has Affected Projects: $HAS_AFFECTED"

echo "matrix=$(echo $MATRIX_OBJECT | jq -c .)" >> $GITHUB_OUTPUT
echo "has_affected=$HAS_AFFECTED" >> $GITHUB_OUTPUT

echo "[calculate-affected.sh] Outputs set for GitHub Actions."
