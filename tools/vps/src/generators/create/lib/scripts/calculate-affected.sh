#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados (v5 - FORZADO DEBUG)
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] DEBUG: Forcing 'hostinger' as affected project."

# --- Forzar la salida ---
AFFECTED_JSON='["hostinger"]'
export AFFECTED_JSON
# --- Fin Forzar ---

echo "[calculate-affected.sh] Forced Affected Projects JSON: $AFFECTED_JSON"

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
echo "[calculate-affected.sh] Has Affected Projects: $HAS_AFFECTED" # Debería ser true

echo "matrix=$(echo $MATRIX_OBJECT | jq -c .)" >> $GITHUB_OUTPUT
echo "has_affected=$HAS_AFFECTED" >> $GITHUB_OUTPUT

echo "[calculate-affected.sh] Outputs set for GitHub Actions (Forced)."
