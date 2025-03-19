import { GeneratorOptions } from '../../types';

export function srcScriptJs(options: GeneratorOptions): string {
  return `document.addEventListener('DOMContentLoaded', function() {
  const messageElement = document.getElementById('message');
  const fetchButton = document.getElementById('fetchButton');
  const checkButton = document.getElementById('checkButton');
  const urlInput = document.getElementById('urlInput');
  const checkIdElement = document.getElementById('checkId');
  const checkStatusElement = document.getElementById('checkStatus');
  const refreshButton = document.getElementById('refreshButton');
  const resultElement = document.getElementById('result');

  // Variables para almacenar el ID del check actual
  let currentCheckId = null;
  let pollingInterval = null;

  // Función para obtener el mensaje del servidor
  async function fetchMessage() {
    messageElement.textContent = 'Cargando...';

    try {
      const response = await fetch('http://localhost:3000/api/hello');
      const data = await response.json();
      messageElement.textContent = data.message;
    } catch (error) {
      messageElement.textContent = 'Error al conectar con el servidor. Verifica que esté ejecutándose.';
      console.error('Error:', error);
    }
  }

  // Función para iniciar un nuevo check
  async function startCheck() {
    // Detener polling anterior si existe
    stopPolling();

    checkIdElement.textContent = 'Iniciando check...';
    checkStatusElement.textContent = '';
    resultElement.textContent = '';

    try {
      const url = urlInput.value.trim() || 'https://en.wikipedia.org/wiki/Main_Page';

      const response = await fetch('http://localhost:3000/api/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      currentCheckId = data.id;

      checkIdElement.textContent = \`ID: \${currentCheckId}\`;
      checkStatusElement.textContent = \`Estado: \${data.status}\`;

      // Habilitar el botón de refrescar
      refreshButton.disabled = false;

      // Iniciar polling automático
      startPolling();
    } catch (error) {
      checkIdElement.textContent = 'Error al iniciar el check';
      console.error('Error:', error);
    }
  }

  // Función para obtener el estado actual de un check
  async function getCheckStatus() {
    if (!currentCheckId) {
      checkStatusElement.textContent = 'Primero inicia un check';
      return;
    }

    try {
      const response = await fetch(\`http://localhost:3000/api/check/\${currentCheckId}\`);

      if (response.ok) {
        const data = await response.json();

        // Mostrar estado básico
        checkStatusElement.textContent = \`Estado: \${data.status}\`;

        // Mostrar flujo detallado si existe
        if (data.flow && data.flow.length > 0) {
          const flowDetails = data.flow.map(step =>
            \`\${step.service}: \${step.status} (\${new Date(step.timestamp).toLocaleTimeString()})\`
          ).join(' -> ');

          checkStatusElement.textContent += \`\\nFlujo: \${flowDetails}\`;
        }

        // Mostrar resultado si existe
        if (data.result) {
          resultElement.textContent = data.result;
        }

        // Si el estado es completed, detener el polling
        if (data.status === 'completed') {
          stopPolling();
        }
      } else {
        checkStatusElement.textContent = 'Check no encontrado';
      }
    } catch (error) {
      checkStatusElement.textContent = 'Error al obtener el estado del check';
      console.error('Error:', error);
    }
  }

  // Iniciar polling automático cada 2 segundos
  function startPolling() {
    // Contador para rastrear cuántos intentos llevamos
    let attempts = 0;
    const maxAttempts = 30; // 30 intentos * 2 segundos = 60 segundos máximo

    pollingInterval = setInterval(() => {
      attempts++;

      // Verificar si hemos alcanzado el máximo de intentos
      if (attempts >= maxAttempts) {
        stopPolling();
        checkStatusElement.textContent = "Se alcanzó el tiempo máximo de espera. El scraper podría no estar funcionando.";
        return;
      }

      getCheckStatus();
    }, 2000);
  }

  // Detener polling
  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // Evento de clic para el botón de hello
  fetchButton.addEventListener('click', fetchMessage);

  // Evento de clic para el botón de iniciar check
  checkButton.addEventListener('click', startCheck);

  // Evento de clic para el botón de refrescar
  refreshButton.addEventListener('click', getCheckStatus);

  // Desactivar el botón de refrescar inicialmente
  refreshButton.disabled = true;

  // Cargar mensaje al iniciar
  fetchMessage();
});`;
}
