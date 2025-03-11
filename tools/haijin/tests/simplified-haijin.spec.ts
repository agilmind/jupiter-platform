import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { SimpleGit, simpleGit } from "simple-git";

describe('Haijin Generator Simplified Test', () => {
  let tempDir: string;
  let git: SimpleGit;
  let originalCwd: string;
  let defaultBranch: string;

  beforeAll(async () => {
    // Guardar directorio actual
    originalCwd = process.cwd();

    // Crear directorio temporal para tests
    tempDir = path.join(os.tmpdir(), 'haijin-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Directorio temporal: ${tempDir}`);

    // Inicializar Git en el directorio temporal
    git = simpleGit(tempDir);
    await git.init();

    // Configurar usuario Git para los commits
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Habilitar rerere
    await git.addConfig('rerere.enabled', 'true');

    // Crear un archivo y commit inicial
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repository', 'utf8');
    await git.add('.');
    await git.commit('Initial commit');

    // Determinar el nombre del branch por defecto
    defaultBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    console.log(`Branch por defecto: ${defaultBranch}`);

    // Cambiar al directorio temporal
    process.chdir(tempDir);
  });

  afterAll(() => {
    // Volver al directorio original
    process.chdir(originalCwd);

    // Eliminar directorio temporal
    fs.removeSync(tempDir);
  });

  test('Verifica que los cambios en develop se preservan y las novedades se incorporan', async () => {
    // 1. CREAR ESTRUCTURA BÁSICA DE PROYECTO
    console.log('1. Creando estructura básica...');

    // Crear estructura más simple (solo los directorios necesarios)
    fs.mkdirSync('services/jupiter-server/src', { recursive: true });
    fs.mkdirSync('apps/jupiter-webapp', { recursive: true });

    // Commit con estructura básica
    await git.add('.');
    await git.commit('Add basic structure');

    // 2. CREAR BRANCHES BASE Y DEVELOP
    console.log('2. Creando branches base y develop...');
    await git.checkoutLocalBranch('base');
    await git.checkoutLocalBranch('develop');
    await git.checkout(defaultBranch);

    // 3. SIMULAR PRIMERA GENERACIÓN
    console.log('3. Simulando primera generación...');
    await git.checkout('base');

    // Generar archivos iniciales en base
    fs.writeFileSync('services/jupiter-server/src/main.ts', 'console.log("Original version");', 'utf8');
    fs.writeFileSync('apps/jupiter-webapp/hello-world.ts', 'console.log("Original webapp");', 'utf8');

    await git.add('.');
    await git.commit('Initial generation in base');

    // Merge a develop
    await git.checkout('develop');
    await git.merge(['base', '--no-ff', '-m', 'Merge initial generation from base']);

    // 4. HACER CAMBIOS EN DEVELOP
    console.log('4. Realizando cambios en develop...');

    // Modificar archivos para crear contenido diferente
    fs.writeFileSync('services/jupiter-server/src/main.ts',
      '// CUSTOM CHANGE IN DEVELOP\nconsole.log("Modified in develop");', 'utf8');
    fs.writeFileSync('apps/jupiter-webapp/hello-world.ts',
      '// WEBAPP MODIFIED IN DEVELOP\nconsole.log("Custom webapp version");', 'utf8');

    // Guardar el contenido para verificar después
    const serverContentDevelop = fs.readFileSync('services/jupiter-server/src/main.ts', 'utf8');
    const webappContentDevelop = fs.readFileSync('apps/jupiter-webapp/hello-world.ts', 'utf8');

    await git.add('.');
    await git.commit('Custom changes in develop');

    // 5. HACER CAMBIOS EN BASE (SIMULAR NUEVOS TEMPLATES)
    console.log('5. Simulando cambios en el generador (base)...');
    await git.checkout('base');

    // Modificar archivos existentes (causarán conflictos)
    fs.writeFileSync('services/jupiter-server/src/main.ts',
      '// GENERATOR NEW VERSION\nconsole.log("Generated content v2");', 'utf8');
    fs.writeFileSync('apps/jupiter-webapp/hello-world.ts',
      '// NEW GENERATOR VERSION\nconsole.log("New webapp version");', 'utf8');

    // Crear un nuevo archivo que no existe en develop (no causará conflicto)
    fs.mkdirSync('services/jupiter-server/config', { recursive: true });
    fs.writeFileSync('services/jupiter-server/config/settings.ts',
      '// NEW FILE FROM GENERATOR\nexport const settings = {\n  port: 3000,\n  debug: true\n};', 'utf8');

    // Guardar el contenido del nuevo archivo para verificar después
    const newFileContent = fs.readFileSync('services/jupiter-server/config/settings.ts', 'utf8');

    await git.add('.');
    await git.commit('New generation in base with new files');

    // 6. SIMULAR MERGE A DEVELOP (DEBERÁ CAUSAR CONFLICTOS EN ALGUNOS ARCHIVOS)
    console.log('6. Merging base a develop (esperando conflictos parciales)...');
    await git.checkout('develop');

    let hadConflicts = false;

    try {
      await git.merge(['base', '--no-ff', '-m', 'Merge new generation from base']);
      console.log('No hubo conflictos (inesperado para archivos modificados)');
    } catch (error) {
      console.log('Conflictos detectados (esperado)');
      hadConflicts = true;

      // Simular resolución de conflictos eligiendo la versión de develop
      const status = await git.status();

      for (const file of status.conflicted) {
        console.log(`Resolviendo conflicto en ${file}`);
        await git.checkout(['--ours', file]);
        await git.add(file);
      }

      // Intentar ejecutar rerere para que aprenda la resolución
      try {
        await git.raw(['rerere']);
      } catch (rerereError) {
        console.warn('Error al ejecutar rerere:', rerereError);
      }

      // Completar merge
      await git.commit('Resolved conflicts preferring develop changes');
    }

    expect(hadConflicts).toBeTruthy();

    // 7. VERIFICAR QUE LOS CAMBIOS EN DEVELOP SE PRESERVARON
    const serverContentAfter = fs.readFileSync('services/jupiter-server/src/main.ts', 'utf8');
    const webappContentAfter = fs.readFileSync('apps/jupiter-webapp/hello-world.ts', 'utf8');

    console.log('7. Verificando que los cambios en develop se preservaron...');
    expect(serverContentAfter).toBe(serverContentDevelop);
    expect(webappContentAfter).toBe(webappContentDevelop);

    // 7B. VERIFICAR QUE EL NUEVO ARCHIVO SE INCORPORÓ CORRECTAMENTE
    console.log('7B. Verificando que el nuevo archivo se incorporó...');
    const newFileExists = fs.existsSync('services/jupiter-server/config/settings.ts');
    expect(newFileExists).toBeTruthy();

    if (newFileExists) {
      const newFileContentInDevelop = fs.readFileSync('services/jupiter-server/config/settings.ts', 'utf8');
      expect(newFileContentInDevelop).toBe(newFileContent);
      console.log('✅ Nuevo archivo incorporado correctamente desde el generador');
    }

    // 8. SIMULAR OTRA GENERACIÓN PARA VERIFICAR RERERE
    console.log('8. Simulando una tercera generación...');
    await git.checkout('base');

    // Modificar archivos para simular nueva generación
    fs.writeFileSync('services/jupiter-server/src/main.ts',
      '// GENERATOR V3\nconsole.log("Generated content v3");', 'utf8');
    fs.writeFileSync('apps/jupiter-webapp/hello-world.ts',
      '// NEW GENERATOR V3\nconsole.log("New webapp version v3");', 'utf8');

    // Crear otro archivo nuevo (no causará conflicto)
    fs.writeFileSync('services/jupiter-server/config/database.ts',
      '// DATABASE CONFIG\nexport const dbConfig = {\n  host: "localhost",\n  port: 5432\n};', 'utf8');

    // Guardar el contenido del segundo archivo nuevo
    const secondNewFileContent = fs.readFileSync('services/jupiter-server/config/database.ts', 'utf8');

    await git.add('.');
    await git.commit('Third generation in base with another new file');

    // 9. MERGE FINAL A DEVELOP - DEBERÍA USAR RERERE
    console.log('9. Merge final a develop (debería usar rerere)...');
    await git.checkout('develop');

    try {
      await git.merge(['base', '--no-ff', '-m', 'Merge third generation from base']);
      console.log('No hubo conflictos (posiblemente rerere los resolvió automáticamente)');
    } catch (error) {
      console.log('Conflictos en tercer merge (rerere no funcionó como se esperaba)');

      // Resolver conflictos manualmente
      const status = await git.status();

      for (const file of status.conflicted) {
        console.log(`Resolviendo conflicto en ${file}`);
        await git.checkout(['--ours', file]);
        await git.add(file);
      }

      // Completar merge
      await git.commit('Resolved conflicts manually in third merge');
    }

    // 10. VERIFICAR QUE LOS CAMBIOS EN DEVELOP SE PRESERVARON NUEVAMENTE
    const serverContentFinal = fs.readFileSync('services/jupiter-server/src/main.ts', 'utf8');
    const webappContentFinal = fs.readFileSync('apps/jupiter-webapp/hello-world.ts', 'utf8');

    console.log('10. Verificando que los cambios en develop se mantuvieron...');
    expect(serverContentFinal).toBe(serverContentDevelop);
    expect(webappContentFinal).toBe(webappContentDevelop);

    // 10B. VERIFICAR QUE EL SEGUNDO ARCHIVO NUEVO SE INCORPORÓ CORRECTAMENTE
    console.log('10B. Verificando que el segundo archivo nuevo se incorporó...');
    const secondNewFileExists = fs.existsSync('services/jupiter-server/config/database.ts');
    expect(secondNewFileExists).toBeTruthy();

    if (secondNewFileExists) {
      const secondNewFileContentInDevelop = fs.readFileSync('services/jupiter-server/config/database.ts', 'utf8');
      expect(secondNewFileContentInDevelop).toBe(secondNewFileContent);
      console.log('✅ Segundo archivo nuevo incorporado correctamente');
    }

    console.log('Prueba completada con éxito!');
  }, 30000); // Aumentar el timeout a 30 segundos para operaciones Git
});
