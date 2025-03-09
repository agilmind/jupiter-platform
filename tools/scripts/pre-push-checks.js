#!/usr/bin/env node

/**
 * Script para ejecutar verificaciones pre-push con mejor manejo de errores y reportes
 */
const { execSync } = require('child_process');
const { join } = require('path');
const fs = require('fs');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

// Función para ejecutar comandos y manejar errores
function runCommand(command, name) {
  console.log(`${colors.cyan}${colors.bold}► Ejecutando ${name}...${colors.reset}`);

  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`${colors.green}✓ ${name} completado exitosamente${colors.reset}\n`);
    return true;
  } catch (error) {
    console.error(`${colors.red}${colors.bold}✖ Error en ${name}${colors.reset}`);
    console.error(`${colors.yellow}Comando: ${command}${colors.reset}`);
    return false;
  }
}

// Función principal
async function main() {
  console.log(`${colors.bold}${colors.magenta}=== Verificaciones Pre-Push ====${colors.reset}\n`);

  // Obtener proyectos afectados para mostrar información
  try {
    const affected = execSync('nx print-affected --type=app,lib').toString();
    const affectedObj = JSON.parse(affected);

    if (affectedObj.projects && affectedObj.projects.length > 0) {
      console.log(`${colors.yellow}Proyectos afectados (${affectedObj.projects.length}):${colors.reset} ${affectedObj.projects.join(', ')}\n`);
    } else {
      console.log(`${colors.green}No hay proyectos afectados. Todas las verificaciones pasarán automáticamente.${colors.reset}\n`);
      return true;
    }
  } catch (e) {
    console.warn(`${colors.yellow}No se pudieron determinar los proyectos afectados. Continuando de todos modos.${colors.reset}\n`);
  }

  // Ejecutar lint con correcciones
  const lintSuccess = runCommand('nx affected --target=lint --fix', 'Lint con correcciones automáticas');

  // Ejecutar tests
  const testSuccess = runCommand('nx affected --target=test', 'Tests unitarios');

  // Ejecutar compilación rápida para verificar que todo compila
  const buildSuccess = runCommand('nx affected --target=build --configuration=development', 'Compilación de verificación');

  // Mostrar resumen
  console.log(`${colors.bold}${colors.magenta}=== Resumen de Verificaciones ====${colors.reset}`);
  console.log(`${lintSuccess ? colors.green + '✓' : colors.red + '✖'} Lint: ${lintSuccess ? 'Exitoso' : 'Fallido'}${colors.reset}`);
  console.log(`${testSuccess ? colors.green + '✓' : colors.red + '✖'} Tests: ${testSuccess ? 'Exitoso' : 'Fallido'}${colors.reset}`);
  console.log(`${buildSuccess ? colors.green + '✓' : colors.red + '✖'} Build: ${buildSuccess ? 'Exitoso' : 'Fallido'}${colors.reset}`);

  // Si alguna verificación falló, mostrar instrucciones de ayuda
  if (!lintSuccess || !testSuccess || !buildSuccess) {
    console.log(`\n${colors.yellow}${colors.bold}Algunas verificaciones fallaron. Acciones recomendadas:${colors.reset}`);

    if (!lintSuccess) {
      console.log(`${colors.yellow}• Para arreglar errores de linting: ${colors.reset}npm run lint:fix`);
    }

    if (!testSuccess) {
      console.log(`${colors.yellow}• Para ver tests fallidos en detalle: ${colors.reset}nx affected --target=test --watch`);
    }

    if (!buildSuccess) {
      console.log(`${colors.yellow}• Para ver errores de compilación en detalle: ${colors.reset}nx affected --target=build --verbose`);
    }

    process.exit(1);
  }

  console.log(`\n${colors.green}${colors.bold}✓ Todas las verificaciones pasaron exitosamente${colors.reset}`);
  return true;
}

// Ejecutar el script
main().catch(error => {
  console.error(`${colors.red}${colors.bold}Error no esperado:${colors.reset}`, error);
  process.exit(1);
});
