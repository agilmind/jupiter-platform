import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

import * as webApp from '../../blueprints/web-app';

export function generateWebApp(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const webAppDir = path.join(projectRoot, 'web-app');

  // Crear nginx.conf
  tree.write(
    path.join(webAppDir, 'nginx.conf'),
    webApp.nginxConf(options)
  );

  // Crear Dockerfile
  tree.write(
    path.join(webAppDir, 'Dockerfile'),
    webApp.dockerfile(options)
  );

  // Crear archivos de frontend
  tree.write(
    path.join(webAppDir, 'src', 'index.html'),
    webApp.srcIndexHtml(options)
  );

  tree.write(
    path.join(webAppDir, 'src', 'style.css'),
    webApp.srcStyleCss(options)
  );

  tree.write(
    path.join(webAppDir, 'src', 'script.js'),
    webApp.srcScriptJs(options)
  );
}
