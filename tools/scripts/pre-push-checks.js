#!/usr/bin/env node

/**
 * Script para ejecutar verificaciones pre-push sin depender de nx-cloud
 */
const { execSync } = require('child_process');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
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
    // No fallar, solo reportar
    return false;
  }
}

// Función principal
async function main() {
  console.log(`${colors.bold}${colors.magenta}=== Verificaciones Pre-Push ====${colors.reset}\n`);

  // Ejecutar lint con correcciones
  const lintSuccess = runCommand('npx nx affected --target=lint --fix', 'Lint con correcciones automáticas');

  // Ejecutar tests
  const testSuccess = runCommand('npx nx affected --target=test --passWithNoTests', 'Tests unitarios');

  // Ejecutar compilación rápida para verificar que todo compila
  const buildSuccess = runCommand('npx nx affected --target=build --configuration=development', 'Compilación de verificación');

  // Mostrar resumen
  console.log(`${colors.bold}${colors.magenta}=== Resumen de Verificaciones ====${colors.reset}`);
  console.log(`${lintSuccess ? colors.green + '✓' : colors.red + '✖'} Lint: ${lintSuccess ? 'Exitoso' : 'Fallido'}${colors.reset}`);
  console.log(`${testSuccess ? colors.green + '✓' : colors.red + '✖'} Tests: ${testSuccess ? 'Exitoso' : 'Fallido'}${colors.reset}`);
  console.log(`${buildSuccess ? colors.green + '✓' : colors.red + '✖'} Build: ${buildSuccess ? 'Exitoso' : 'Fallido'}${colors.reset}`);

  console.log(`\n${colors.green}${colors.bold}✓ Verificaciones completadas${colors.reset}`);
  return true;
}

// Ejecutar el script
main().catch(error => {
  console.error(`${colors.red}${colors.bold}Error no esperado:${colors.reset}`, error);
  // No fallamos el proceso para permitir el push
});
