#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz (v4 - Usa affected --plain)
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# --- Usar nx affected --plain para obtener solo nombres ---
echo "[calculate-affected.sh] Running nx affected --plain command..."
# Capturar salida. Permitir que falle si no hay afectados (|| true)
AFFECTED_OUTPUT=""
NX_EXIT_CODE=0
AFFECTED_OUTPUT=$(npx nx affected --target=deploy --base=$NX_BASE --head=$NX_HEAD --plain --exclude=tag:type:other-app || true)
NX_EXIT_CODE=$? # Capturar código de salida real

echo "[calculate-affected.sh] nx affected command finished. Exit Code: $NX_EXIT_CODE"
echo "[calculate-affected.sh] Plain output from nx affected:"
echo "--------------------- BEGIN PLAIN OUTPUT ---------------------"
# Usar comillas para preservar saltos de línea y manejar salida vacía
echo "$AFFECTED_OUTPUT"
echo "---------------------- END PLAIN OUTPUT ----------------------"

# --- Procesar salida de texto a JSON Array ---
AFFECTED_JSON="[]" # Default

# Verificar si la salida NO está vacía y NO contiene mensajes conocidos de "nada afectado"
# (Estos mensajes pueden variar entre versiones de Nx)
if [ -n "$AFFECTED_OUTPUT" ] && \
   ! echo "$AFFECTED_OUTPUT" | grep -q "NX   No projects" && \
   ! echo "$AFFECTED_OUTPUT" | grep -q "NX   No tasks"; then

    echo "[calculate-affected.sh] Processing affected project list from plain output..."
    # Convertir la lista (asumiendo un proyecto por línea) a un array JSON usando jq
    # 1. `jq -R .`: Lee cada línea como un string JSON crudo.
    # 2. `jq -sc .`: Lee toda la secuencia de strings JSON y los agrupa en un array JSON.
    AFFECTED_JSON=$(echo "$AFFECTED_OUTPUT" | sed 's/ *$//' | # Eliminar espacios al final de líneas si los hay
                      jq -R . | jq -sc .)

    # Verificar si jq produjo un array válido
     if ! echo "$AFFECTED_JSON" | jq -e 'type=="array"' > /dev/null 2>&1; then
        echo "[calculate-affected.sh] WARNING: Failed to create valid JSON array from plain output using jq. Output was:"
        echo "$AFFECTED_OUTPUT"
        AFFECTED_JSON="[]" # Fallback a array vacío
    else
         echo "[calculate-affected.sh] Generated JSON Array: $AFFECTED_JSON"
     fi
else
    echo "[calculate-affected.sh] No projects found in output or output indicates none affected. Setting empty list."
    AFFECTED_JSON="[]"
fi

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
