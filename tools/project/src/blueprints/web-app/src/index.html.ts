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
    <div class="card">
      <h2>Mensaje del servidor</h2>
      <div id="message" class="message">Cargando...</div>
      <button id="fetchButton">Obtener mensaje del servidor</button>
    </div>

    <div class="card">
      <h2>Prueba de flujo entre servicios</h2>
      <div class="input-group">
        <label for="urlInput">URL para scraping:</label>
        <input type="text" id="urlInput" placeholder="https://en.wikipedia.org/wiki/Main_Page" value="https://en.wikipedia.org/wiki/Main_Page" />
      </div>
      <button id="checkButton">Iniciar nuevo check</button>
      <p id="checkId">-</p>
      <p id="checkStatus">-</p>
      <button id="refreshButton" disabled>Refrescar estado</button>

      <div class="result-container">
        <h3>Resultado del scraping:</h3>
        <pre id="result" class="result"></pre>
      </div>
    </div>
  </div>
  <script src="script.js"></script>
</body>
</html>`;
}
