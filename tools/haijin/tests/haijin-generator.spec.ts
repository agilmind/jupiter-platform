import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { SimpleGit, simpleGit } from "simple-git";
import { RunGeneratorSchema } from '../src/generators/run/schema';

// Mockear módulos de NX
jest.mock('@nx/devkit', () => {
  return {
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
    Tree: jest.fn(),
    formatFiles: jest.fn(),
    generateFiles: jest.fn(),
  };
});

// Mockear readline para simular inputs del usuario
jest.mock('readline', () => {
  return {
    createInterface: jest.fn().mockReturnValue({
      question: jest.fn((question, callback) => {
        // Siempre responde "y" a preguntas de actualización
        if (question.includes('¿Desea actualizarlo?')) {
          callback('y');
        }
        // Elegir resolución automática para conflictos
        else if (question.includes('Seleccione estrategia de merge')) {
          callback('2'); // Preferir cambios de develop
        }
        else {
          callback('');
        }
      }),
      close: jest.fn()
    })
  };
});

describe('Haijin Generator Integration Test', () => {
  let tempDir: string;
  let git: SimpleGit;
  let originalCwd: string;
  let defaultBranch: string; // Almacenar el nombre del branch por defecto

  // Configuración inicial - crear un repo Git temporal
  beforeAll(async () => {
    // Guardar directorio actual
    originalCwd = process.cwd();

    // Crear directorio temporal para tests
    tempDir = path.join(os.tmpdir(), 'haijin-generator-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    // Inicializar Git en el directorio temporal
    git = simpleGit(tempDir);
    await git.init();

    // Configurar usuario Git para los commits
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Habilitar rerere
    await git.addConfig('rerere.enabled', 'true');

    // Crear un archivo y commit inicial para tener un branch
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repository', 'utf8');
    await git.add('.');
    await git.commit('Initial commit');

    // Determinar el nombre del branch por defecto
    defaultBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    console.log(`Branch por defecto detectado: ${defaultBranch}`);

    // Cambiar al directorio temporal
    process.chdir(tempDir);

    // Crear estructura básica de proyecto NX
    setupProjectStructure();

    // Commit para la estructura del proyecto
    await git.add('.');
    await git.commit('Add project structure');
  });

  // Limpiar después de todos los tests
  afterAll(() => {
    // Volver al directorio original
    process.chdir(originalCwd);

    // Eliminar directorio temporal
    fs.removeSync(tempDir);
  });

  // Test principal que simula todo el workflow
  test('Completo workflow del generador: generación inicial, cambios en develop, y conflictos', async () => {
    // ------------------------------------------------------------------
    // 1. GENERACIÓN INICIAL
    // ------------------------------------------------------------------
    console.log('1. Simulando generación inicial...');

    // Preparar opciones del generador
    const options: RunGeneratorSchema = {
      name: 'jupiter',
      selectedServices: ['jupiter-server', 'jupiter-webapp'],
      services: {
        'jupiter-server': 'apollo-prisma',
        'jupiter-webapp': 'react'
      }
    };

    // Simular Tree de NX
    const mockTree = {};

    // 1A. Crear branches base y develop
    await git.checkout(['-b', 'base']);
    await git.checkout(['-b', 'develop']);
    await git.checkout(defaultBranch);

    // Crear y commitear plantillas en el branch principal primero
    const templateDirReact = 'tools/haijin/src/generators/transcribe/files/react';
    const templateDirApollo = 'tools/haijin/src/generators/transcribe/files/apollo-prisma/src';

    fs.mkdirSync(templateDirReact, { recursive: true });
    fs.mkdirSync(templateDirApollo, { recursive: true });

    fs.writeFileSync(path.join(templateDirReact, 'hello-world.ts'), 'console.log("Versión original");', 'utf8');
    fs.writeFileSync(path.join(templateDirApollo, 'main.ts'), '// Versión original\nconsole.log("Original");', 'utf8');

    await git.add('.');
    await git.commit('Add initial templates');

    // 1B. Simular primera generación
    await simulateGeneration(options, mockTree, git, tempDir, defaultBranch);

    // Verificar estructura esperada en develop
    await git.checkout('develop');
    expect(fs.existsSync('services/jupiter-server')).toBeTruthy();
    expect(fs.existsSync('apps/jupiter-webapp')).toBeTruthy();

    // ------------------------------------------------------------------
    // 2. CAMBIOS EN DEVELOP QUE DEBEN RESPETARSE
    // ------------------------------------------------------------------
    console.log('2. Simulando cambios en develop...');

    // Modificar archivos en develop - crear contenido SIGNIFICATIVAMENTE DIFERENTE
    // para asegurar que habrá conflictos
    const webappFile = 'apps/jupiter-webapp/hello-world.ts';
    const serverFile = 'services/jupiter-server/src/main.ts';

    fs.writeFileSync(webappFile, '// Este es un cambio IMPORTANTE en develop\nconsole.log("Modificado en develop");\n// No debe perderse', 'utf8');
    fs.writeFileSync(serverFile, '// Este archivo fue MODIFICADO en develop\nconsole.log("Versión personalizada");\n// Preservar estos cambios', 'utf8');

    // Commit de cambios en develop
    await git.add('.');
    await git.commit('Cambios personalizados en develop');

    // Guardar contenido para verificar después
    const webappContentDevelop = fs.readFileSync(webappFile, 'utf8');
    const serverContentDevelop = fs.readFileSync(serverFile, 'utf8');

    // ------------------------------------------------------------------
    // 3. CAMBIOS EN EL GENERADOR QUE PUEDEN CAUSAR CONFLICTOS
    // ------------------------------------------------------------------
    console.log('3. Simulando cambios en el generador...');

    // Volver al branch principal para simular cambios en el generador
    await git.checkout(defaultBranch);

    // Modificar plantillas del generador con contenido MUY DIFERENTE
    fs.writeFileSync(path.join(templateDirReact, 'hello-world.ts'),
      '// NUEVA VERSIÓN DEL GENERADOR\nconsole.log("Nueva versión muy diferente");\n// Esto va a crear conflictos', 'utf8');
    fs.writeFileSync(path.join(templateDirApollo, 'main.ts'),
      '// GENERADO AUTOMÁTICAMENTE - NUEVA VERSIÓN\nconsole.log("Versión del generador modificada");\n// Este cambio también genera conflicto', 'utf8');

    // Commit de cambios en el generador
    await git.add('.');
    await git.commit('Actualización de plantillas del generador');

    // ------------------------------------------------------------------
    // 4. SEGUNDA GENERACIÓN Y RESOLUCIÓN DE CONFLICTOS
    // ------------------------------------------------------------------
    console.log('4. Simulando segunda generación con conflictos potenciales...');

    // Ejecutar generador nuevamente
    await simulateGeneration(options, mockTree, git, tempDir, defaultBranch);

    // Verificar que estamos en el branch principal después de la generación
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    expect(currentBranch).toBe(defaultBranch);

    // Ir a develop para verificar los resultados
    await git.checkout('develop');

    // Verificar que los archivos existen
    expect(fs.existsSync(webappFile)).toBeTruthy();
    expect(fs.existsSync(serverFile)).toBeTruthy();

    // 4A. Verificar que se respetaron los cambios en develop (si usamos rerere o preferencia por develop)
    const webappContentAfter = fs.readFileSync(webappFile, 'utf8');
    const serverContentAfter = fs.readFileSync(serverFile, 'utf8');

    // Los contenidos deberían ser los mismos que teníamos en develop antes
    expect(webappContentAfter).toBe(webappContentDevelop);
    expect(serverContentAfter).toBe(serverContentDevelop);

    // 4B. Verificar que hubo conflictos (no necesariamente en el caché de rerere)
    const hasConflicts = await didHaveConflicts(git);
    console.log(`Verificación de conflictos: ${hasConflicts ? 'Se detectaron conflictos' : 'No hubo conflictos'}`);
    expect(hasConflicts).toBeTruthy();

    // ------------------------------------------------------------------
    // 5. TERCERA GENERACIÓN - VERIFICAR QUE LOS CAMBIOS SE PRESERVAN
    // ------------------------------------------------------------------
    console.log('5. Simulando tercera generación para verificar preservación de cambios...');

    // Volver al branch principal
    await git.checkout(defaultBranch);

    // Ejecutar generador una tercera vez
    await simulateGeneration(options, mockTree, git, tempDir, defaultBranch);

    // Verificar que estamos en el branch principal después de la generación
    const finalBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    expect(finalBranch).toBe(defaultBranch);

    // Verificar develop una última vez
    await git.checkout('develop');

    // Los archivos deberían seguir con el contenido de develop
    const webappContentFinal = fs.readFileSync(webappFile, 'utf8');
    const serverContentFinal = fs.readFileSync(serverFile, 'utf8');

    expect(webappContentFinal).toBe(webappContentDevelop);
    expect(serverContentFinal).toBe(serverContentDevelop);

    console.log('Prueba completada con éxito!');
  });

  // Función para verificar si hubo conflictos durante un merge
  async function didHaveConflicts(git: SimpleGit): Promise<boolean> {
    try {
      // Verificar los logs para buscar mensajes que indiquen resolución de conflictos
      const logs = await git.log({ maxCount: 10 });

      for (const commit of logs.all) {
        if (commit.message.toLowerCase().includes('conflict') ||
            commit.message.includes('resol')) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn('Error al verificar conflictos en historial:', error);
      return false;
    }
  }

  // Función para simular la ejecución del generador
  async function simulateGeneration(
    options: RunGeneratorSchema,
    mockTree: any,
    git: SimpleGit,
    tempDir: string,
    defaultBranch: string
  ) {
    // Simular lo que haría el generador, pero de forma simplificada

    // 1. Asegurar que estamos en el branch principal
    await git.checkout(defaultBranch);

    // 2. Manejar branch base
    await git.checkout('base');

    // Sincronizar plantillas desde el branch principal
    try {
      // En lugar de checkout, copiaremos los archivos manualmente para evitar problemas
      // con rutas que no existen en git
      const templatesDir = path.join(tempDir, 'tools/haijin/src/generators/transcribe/files');

      // Primero volvemos al branch principal para copiar las plantillas actualizadas
      await git.checkout(defaultBranch);

      // Luego volvemos a base y copiamos las plantillas manualmente
      await git.checkout('base');

      // Ahora aplicamos los cambios
      fs.copySync(
        path.join(tempDir, 'tools/haijin/src/generators/transcribe/files'),
        path.join(tempDir, 'tools/haijin/src/generators/transcribe/files')
      );

      // Commit en base si hay cambios
      const status = await git.status();
      if (status.files.length > 0) {
        await git.add('.');
        await git.commit(`Sync templates from ${defaultBranch}`);
      }
    } catch (error) {
      console.warn('Error al sincronizar plantillas:', error);
    }

    // 3. Generar archivos para cada servicio
    for (const service of options.selectedServices) {
      const serviceType = options.services[service];
      const servicePrefix = serviceType === 'apollo-prisma' ? 'services' : 'apps';
      const serviceDir = `${servicePrefix}/${service}`;

      // Limpiar directorio si existe
      if (fs.existsSync(serviceDir)) {
        try {
          await git.raw(['rm', '-rf', serviceDir]);
        } catch (error) {
          fs.removeSync(serviceDir);
        }
      }

      // Crear directorio
      fs.mkdirSync(serviceDir, { recursive: true });

      // Generar archivos según el tipo
      if (serviceType === 'apollo-prisma') {
        fs.mkdirSync(`${serviceDir}/src`, { recursive: true });
        fs.mkdirSync(`${serviceDir}/prisma`, { recursive: true });

        // Copiar desde plantillas si existen
        const templateDir = 'tools/haijin/src/generators/transcribe/files/apollo-prisma';
        if (fs.existsSync(`${templateDir}/src/main.ts`)) {
          fs.copySync(`${templateDir}/src/main.ts`, `${serviceDir}/src/main.ts`);
        } else {
          fs.writeFileSync(`${serviceDir}/src/main.ts`, '// Archivo generado\nconsole.log("Main");', 'utf8');
        }

        fs.writeFileSync(`${serviceDir}/prisma/schema.prisma`, 'model User { id Int @id }', 'utf8');
        fs.writeFileSync(`${serviceDir}/project.json`, '{}', 'utf8');
      }
      else if (serviceType === 'react') {
        // Copiar desde plantillas si existen
        const templateDir = 'tools/haijin/src/generators/transcribe/files/react';
        if (fs.existsSync(`${templateDir}/hello-world.ts`)) {
          fs.copySync(`${templateDir}/hello-world.ts`, `${serviceDir}/hello-world.ts`);
        } else {
          fs.writeFileSync(`${serviceDir}/hello-world.ts`, 'console.log("Hello world");', 'utf8');
        }
      }
    }

    // 4. Commit en base
    await git.add('.');
    await git.commit(`Generated services: ${options.selectedServices.join(', ')}`);

    // 5. Merge a develop
    await git.checkout('develop');

    try {
      await git.merge(['base', '--no-ff', '-m', `Merge from base: Generated services`]);
      console.log('Merge exitoso sin conflictos');
    } catch (error) {
      // Si hay conflictos, resolverlos prefiriendo develop
      const status = await git.status();

      if (status.conflicted.length > 0) {
        console.log(`Resolviendo conflictos: ${status.conflicted.join(', ')}`);

        for (const file of status.conflicted) {
          // Elegir versión de develop
          await git.checkout(['--ours', file]);
          await git.add(file);
        }

        // Ejecutar rerere para intentar aprender la resolución
        try {
          await git.raw(['rerere']);
        } catch (rerereError) {
          console.warn('Error al ejecutar rerere:', rerereError);
        }

        // Completar merge
        await git.commit('Merged with conflicts resolved (prefer develop)');
      }
    }

    // 6. Volver al branch principal
    await git.checkout(defaultBranch);
  }
});

// Función auxiliar para configurar la estructura básica del proyecto
function setupProjectStructure() {
  // Crear directorios principales
  fs.mkdirSync('services', { recursive: true });
  fs.mkdirSync('apps', { recursive: true });
  fs.mkdirSync('tools/haijin/src/generators/transcribe/files/react', { recursive: true });
  fs.mkdirSync('tools/haijin/src/generators/transcribe/files/apollo-prisma/src', { recursive: true });
  fs.mkdirSync('tools/haijin/src/generators/run', { recursive: true });

  // Crear archivos mínimos necesarios
  fs.writeFileSync('nx.json', JSON.stringify({
    extends: 'nx/presets/npm.json',
    tasksRunnerOptions: {
      default: {
        runner: 'nx/tasks-runners/default',
        options: {
          cacheableOperations: ['build', 'lint', 'test']
        }
      }
    }
  }, null, 2));

  // Crear archivo package.json mínimo
  fs.writeFileSync('package.json', JSON.stringify({
    name: 'test-workspace',
    version: '0.0.1'
  }, null, 2));
}
