import { GeneratorOptions } from '../../types';

export function srcIndexHtml(options: GeneratorOptions): string {
  const { projectName } = options;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} - Web App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>${projectName} - Web App</h1>
    <div id="message" class="message">Cargando...</div>
    <button id="fetchButton">Obtener mensaje del servidor</button>
  </div>
  <script src="script.js"></script>
</body>
</html>`;
}
