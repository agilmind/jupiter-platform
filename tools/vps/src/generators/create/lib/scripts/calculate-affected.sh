#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Calcula Proyectos Afectados y Genera Matriz
# ==============================================================================
set -euo pipefail

echo "[calculate-affected.sh] Calculating affected projects with target 'deploy'..."
echo "[calculate-affected.sh] Base SHA: $NX_BASE | Head SHA: $NX_HEAD"

# Obtener proyectos afectados como JSON array de strings.
# Usamos jq para parsear y || echo '[]' para manejar el caso de error o ningún afectado.
# Excluir otros tipos de apps si se desea con --exclude=tag:type:other-app
AFFECTED_JSON=$(npx nx affected --target=deploy --base=$NX_BASE --head=$NX_HEAD --json --exclude=tag:type:other-app | jq -c '.projects' || echo '[]')
echo "[calculate-affected.sh] Affected Projects JSON: $AFFECTED_JSON"

# Exportar para que Node.js lo pueda leer desde el entorno
export AFFECTED_JSON

# Usar node para construir el objeto de matriz 'include' de forma segura
# Esto evita problemas con caracteres especiales en nombres de proyecto
MATRIX_OBJECT=$(node -e "
  try {
    const projects = JSON.parse(process.env.AFFECTED_JSON || '[]');
    // Filtrar por si acaso viene algo inesperado (null, etc.)
    const validProjects = projects.filter(p => typeof p === 'string' && p.length > 0);
    const includeList = validProjects.map(p => ({
      vps_name: p,
      // Generar nombre para secrets/variables (uppercase, guiones bajos)
      vps_name_upper: p.toUpperCase().replace(/-/g, '_')
    }));
    // Salida como JSON compacto en una sola línea
    console.log(JSON.stringify({ include: includeList }));
  } catch (e) {
    console.error('[NodeScript] Error processing affected projects:', e);
    // Salida segura en caso de error
    console.log(JSON.stringify({ include: [] }));
  }
" || echo '{"include":[]}') # Fallback si Node falla

# Determinar si hay afectados
HAS_AFFECTED=$(node -e "try { console.log(JSON.parse(process.env.AFFECTED_JSON || '[]').length > 0 ? 'true' : 'false'); } catch { console.log('false'); }" || echo 'false')

echo "[calculate-affected.sh] Generated Matrix Object: $MATRIX_OBJECT"
echo "[calculate-affected.sh] Has Affected Projects: $HAS_AFFECTED"

# Pasar al output de GitHub Actions
# Usar jq -c para asegurar formato JSON compacto y válido
echo "matrix=$(echo $MATRIX_OBJECT | jq -c .)" >> $GITHUB_OUTPUT
echo "has_affected=$HAS_AFFECTED" >> $GITHUB_OUTPUT

echo "[calculate-affected.sh] Outputs set for GitHub Actions."
