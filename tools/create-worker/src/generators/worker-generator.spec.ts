import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { workerGeneratorGenerator } from './worker-generator';
import { WorkerGeneratorSchema } from './schema';

// Mock para createLogger si lo estás importando de @jupiter/worker-framework
jest.mock('@jupiter/worker-framework', () => ({
  createLogger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

describe('worker-generator generator', () => {
  let tree: Tree;
  const options: WorkerGeneratorSchema = {
    name: 'test',
    directory: 'services',
    description: 'test',
    domain: 'test_domain'
  };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();

    // Crear un archivo docker-compose.yml simulado para que el generador no falle
    tree.write('docker-compose.yml', `version: '3'
services:
  # Servicios existentes
  nginx:
    image: nginx
    container_name: app_nginx
    depends_on:
      - api
      - wordpress
    networks:
      - app-network`);
  });

  it('should run successfully', async () => {
    await workerGeneratorGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test');
    expect(config).toBeDefined();
  });

  it('should create project files', async () => {
    await workerGeneratorGenerator(tree, options);

    // Verificar que los archivos principales se crean
    expect(tree.exists('services/test/src/main.ts')).toBeTruthy();
    expect(tree.exists('services/test/src/app/test.worker.ts')).toBeTruthy();
    expect(tree.exists('services/test/tsconfig.json')).toBeTruthy();
  });

  it('should update docker-compose.yml', async () => {
    await workerGeneratorGenerator(tree, options);

    // Verificar que el docker-compose.yml fue actualizado
    const content = tree.read('docker-compose.yml').toString();
    expect(content).toContain('test:');
    expect(content).toContain('dockerfile: services/test/Dockerfile');
  });
});
