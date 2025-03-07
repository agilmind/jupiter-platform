import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import { InitHaikuGeneratorSchema } from './schema';
import * as childProcess from 'child_process';

// Mock childProcess.execSync
jest.mock('child_process', () => ({
  execSync: jest.fn((command) => {
    // Mock para diferentes comandos de Git
    if (command === 'git rev-parse --abbrev-ref HEAD') {
      return Buffer.from('main');
    }
    if (command === 'git status --porcelain') {
      return Buffer.from('');
    }
    if (command === 'git branch') {
      return Buffer.from('  main\n* develop');
    }
    // Para otros comandos, retorna un string vacío
    return Buffer.from('');
  }),
}));

// Acceso tipado al mock
const execSyncMock = childProcess.execSync as jest.Mock;

// Importamos el generador después de los mocks
import { initHaikuGenerator } from './init-haiku';

describe('init-haiku generator', () => {
  let tree: Tree;
  const options: InitHaikuGeneratorSchema = {
    initReact: false,
    initReactNative: false,
    initApolloPrisma: false
  };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    // Resetear los mocks entre pruebas
    jest.clearAllMocks();

    // Configuración predeterminada: en main, sin cambios
    execSyncMock.mockImplementation((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return Buffer.from('main');
      }
      if (command === 'git status --porcelain') {
        return Buffer.from('');
      }
      if (command === 'git branch') {
        return Buffer.from('  main');
      }
      return Buffer.from('');
    });
  });

  it('should run successfully with minimal options', async () => {
    await initHaikuGenerator(tree, options);
    // Verificar que se verificó el branch
    expect(execSyncMock).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', expect.any(Object));
    // Verificar que se verificó el estado
    expect(execSyncMock).toHaveBeenCalledWith('git status --porcelain', expect.any(Object));
    // Verificar que se verificaron los branches existentes
    expect(execSyncMock).toHaveBeenCalledWith('git branch', expect.any(Object));
    // Verificar que se creó el branch base
    expect(execSyncMock).toHaveBeenCalledWith('git checkout -b base', expect.any(Object));
  });

  it('should handle React app initialization', async () => {
    const reactOptions = {
      ...options,
      initReact: true,
      reactAppName: 'my-react-app'
    };

    await initHaikuGenerator(tree, reactOptions);

    // Verificar que se ejecutó el comando para generar la app React
    expect(execSyncMock).toHaveBeenCalledWith('npx nx g @nx/react:app my-react-app', expect.any(Object));
  });

  it('should handle React Native app initialization', async () => {
    const reactNativeOptions = {
      ...options,
      initReactNative: true,
      reactNativeAppName: 'my-rn-app'
    };

    await initHaikuGenerator(tree, reactNativeOptions);

    // Verificar que se ejecutó el comando para generar la app React Native
    expect(execSyncMock).toHaveBeenCalledWith('npx nx g @nx/react-native:app my-rn-app', expect.any(Object));
  });

  it('should handle Apollo-Prisma service initialization', async () => {
    const apolloOptions = {
      ...options,
      initApolloPrisma: true,
      apolloPrismaServiceName: 'my-api'
    };

    await initHaikuGenerator(tree, apolloOptions);

    // Verificar que se ejecutó el comando para generar el servicio
    expect(execSyncMock).toHaveBeenCalledWith('npx nx g @nx/node:app my-api --directory=services', expect.any(Object));
  });

  it('should handle multiple project types', async () => {
    const multiOptions = {
      initReact: true,
      reactAppName: 'my-react',
      initReactNative: true,
      reactNativeAppName: 'my-mobile',
      initApolloPrisma: true,
      apolloPrismaServiceName: 'my-backend'
    };

    await initHaikuGenerator(tree, multiOptions);

    // Verificar que se ejecutaron todos los comandos necesarios
    expect(execSyncMock).toHaveBeenCalledWith('npx nx g @nx/react:app my-react', expect.any(Object));
    expect(execSyncMock).toHaveBeenCalledWith('npx nx g @nx/react-native:app my-mobile', expect.any(Object));
    expect(execSyncMock).toHaveBeenCalledWith('npx nx g @nx/node:app my-backend --directory=services', expect.any(Object));
  });

  it('should fail if not on main branch', async () => {
    // Mock para simular que estamos en otro branch
    execSyncMock.mockImplementation((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return Buffer.from('develop');
      }
      return Buffer.from('');
    });

    await initHaikuGenerator(tree, options);

    // Verificar que no se ejecutaron comandos de generación
    expect(execSyncMock).not.toHaveBeenCalledWith(expect.stringMatching(/npx nx g/), expect.any(Object));
  });

  it('should fail if there are pending changes', async () => {
    // Mock para simular cambios pendientes
    execSyncMock.mockImplementation((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return Buffer.from('main');
      }
      if (command === 'git status --porcelain') {
        return Buffer.from(' M file.txt');
      }
      return Buffer.from('');
    });

    await initHaikuGenerator(tree, options);

    // Verificar que no se ejecutaron comandos de generación
    expect(execSyncMock).not.toHaveBeenCalledWith(expect.stringMatching(/npx nx g/), expect.any(Object));
  });

  it('should use existing base branch if it exists', async () => {
    // Mock para simular que ya existe el branch base
    execSyncMock.mockImplementation((command) => {
      if (command === 'git branch') {
        return Buffer.from('  main\n  base');
      }
      return command === 'git rev-parse --abbrev-ref HEAD' ? Buffer.from('main') : Buffer.from('');
    });

    await initHaikuGenerator(tree, options);

    // Verificar que no se intentó crear el branch base
    expect(execSyncMock).not.toHaveBeenCalledWith('git checkout -b base', expect.any(Object));
  });

  it('should create develop branch if it does not exist', async () => {
    // Mock para simular que no existe el branch develop
    execSyncMock.mockImplementation((command) => {
      if (command === 'git branch') {
        return Buffer.from('  main\n  base');
      }
      return command === 'git rev-parse --abbrev-ref HEAD' ? Buffer.from('main') : Buffer.from('');
    });

    await initHaikuGenerator(tree, options);

    // Verificar que se creó el branch develop
    expect(execSyncMock).toHaveBeenCalledWith('git checkout -b develop', expect.any(Object));
  });

  it('should switch to develop branch if it exists', async () => {
    // Mock para simular que ya existe el branch develop
    execSyncMock.mockImplementation((command) => {
      if (command === 'git branch') {
        return Buffer.from('  main\n  base\n  develop');
      }
      return command === 'git rev-parse --abbrev-ref HEAD' ? Buffer.from('main') : Buffer.from('');
    });

    await initHaikuGenerator(tree, options);

    // Verificar que se cambió al branch develop existente
    expect(execSyncMock).toHaveBeenCalledWith('git checkout develop', expect.any(Object));
  });
});
