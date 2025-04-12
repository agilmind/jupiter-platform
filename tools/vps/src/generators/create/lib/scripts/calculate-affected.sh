#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz (v4 - Usa affected --plain)
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# --- Usar nx affected --plain ---
echo "[calculate-affected.sh] Running nx affected --plain command..."
AFFECTED_OUTPUT=""
NX_EXIT_CODE=0
# --- AÑADIR --verbose PARA MÁS DETALLES ---
AFFECTED_OUTPUT=$(npx nx affected --target=deploy --base=$NX_BASE --head=$NX_HEAD --plain --exclude=tag:type:other-app --verbose || true)
NX_EXIT_CODE=$?
# --- FIN CAMBIO ---

echo "[calculate-affected.sh] nx affected command finished. Exit Code: $NX_EXIT_CODE" # Informative
echo "[calculate-affected.sh] Plain output from nx affected (Verbose):"
echo "--------------------- BEGIN PLAIN OUTPUT ---------------------"
echo "$AFFECTED_OUTPUT"
echo "---------------------- END PLAIN OUTPUT ----------------------"

# --- Procesar salida de texto a JSON Array ---
AFFECTED_JSON="[]" # Default
if [ -n "$AFFECTED_OUTPUT" ] && \
   ! echo "$AFFECTED_OUTPUT" | grep -q "NX   No projects" && \
   ! echo "$AFFECTED_OUTPUT" | grep -q "NX   No tasks"; then
    echo "[calculate-affected.sh] Processing affected project list from plain output..."
    AFFECTED_JSON=$(echo "$AFFECTED_OUTPUT" | sed 's/ *$//' | jq -R . | jq -sc .)
     if ! echo "$AFFECTED_JSON" | jq -e 'type=="array"' > /dev/null 2>&1; then
        echo "[calculate-affected.sh] WARNING: Failed to create valid JSON array from plain output using jq. Output was logged above."
        AFFECTED_JSON="[]"
    else
         echo "[calculate-affected.sh] Generated JSON Array: $AFFECTED_JSON"
     fi
else
    echo "[calculate-affected.sh] No projects found in output or output indicates none affected. Setting empty list."
    AFFECTED_JSON="[]"
fi
export AFFECTED_JSON

# --- Node script para generar matriz (sin cambios) ---
MATRIX_OBJECT=$(node -e " /* ... Mismo código Node ... */ " || echo '{"include":[]}')
HAS_AFFECTED=$(node -e " /* ... Mismo código Node ... */ " || echo 'false')

echo "[calculate-affected.sh] Generated Matrix Object: $MATRIX_OBJECT"
echo "[calculate-affected.sh] Has Affected Projects: $HAS_AFFECTED"
echo "matrix=$(echo $MATRIX_OBJECT | jq -c .)" >> $GITHUB_OUTPUT
echo "has_affected=$HAS_AFFECTED" >> $GITHUB_OUTPUT
echo "[calculate-affected.sh] Outputs set for GitHub Actions."
