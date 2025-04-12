#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz (v6 - Correct jq for array output)
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# --- Use nx show projects --affected --with-target --json ---
echo "[calculate-affected.sh] Running nx show projects --affected --with-target=deploy --json command..."
RAW_AFFECTED_OUTPUT=""
NX_EXIT_CODE=0
RAW_AFFECTED_OUTPUT=$(npx nx show projects --affected --with-target=deploy --json --base=$NX_BASE --head=$NX_HEAD --exclude=tag:type:other-app || true)
NX_EXIT_CODE=$?

echo "[calculate-affected.sh] nx show projects exit code: $NX_EXIT_CODE"
echo "[calculate-affected.sh] Raw output from nx show projects:"
echo "--------------------- BEGIN RAW OUTPUT ---------------------"
echo "$RAW_AFFECTED_OUTPUT"
echo "---------------------- END RAW OUTPUT ----------------------"

AFFECTED_JSON="[]" # Default

# Validar que el comando tuvo éxito Y que la salida es un array JSON no vacío
if [ $NX_EXIT_CODE -eq 0 ] && [ -n "$RAW_AFFECTED_OUTPUT" ] && echo "$RAW_AFFECTED_OUTPUT" | jq -e 'type=="array" and length > 0' > /dev/null 2>&1; then
    echo "[calculate-affected.sh] Output is a valid non-empty JSON array. Assigning directly."
    # La salida ya es el array JSON que necesitamos, ej: ["hostinger"]
    AFFECTED_JSON="$RAW_AFFECTED_OUTPUT"
else
    echo "[calculate-affected.sh] WARNING: 'nx show projects' failed, produced empty/invalid output, or no projects affected. Assuming empty list."
    if [ $NX_EXIT_CODE -ne 0 ]; then echo "[calculate-affected.sh] nx exit code was: $NX_EXIT_CODE"; fi
    AFFECTED_JSON="[]" # Asegurar fallback
fi

echo "[calculate-affected.sh] Final Affected Projects JSON: $AFFECTED_JSON"

# Exportar para Node.js
export AFFECTED_JSON

# Usar node para construir la matriz (Node script sin cambios)
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
