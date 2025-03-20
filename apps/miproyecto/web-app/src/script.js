document.addEventListener('DOMContentLoaded', function() {
  // Referencias a elementos del DOM
  const checkServerButton = document.getElementById('checkServerButton');
  const executeButton = document.getElementById('executeButton');
  const messageElement = document.getElementById('message');

  const urlInput = document.getElementById('urlInput');
  const selectorInput = document.getElementById('selectorInput');
  const removeHtmlOption = document.getElementById('removeHtmlOption');
  const maxLengthOption = document.getElementById('maxLengthOption');
  const timeoutOption = document.getElementById('timeoutOption');
  const userAgentOption = document.getElementById('userAgentOption');
  const screenshotOption = document.getElementById('screenshotOption');

  const lightMethodOption = document.getElementById('lightMethodOption');
  const browserMethodOption = document.getElementById('browserMethodOption');

  const lightStatus = document.getElementById('lightStatus');
  const lightTiming = document.getElementById('lightTiming');
  const lightResult = document.getElementById('lightResult');

  const browserStatus = document.getElementById('browserStatus');
  const browserTiming = document.getElementById('browserTiming');
  const browserResult = document.getElementById('browserResult');
  const screenshotContainer = document.getElementById('screenshotContainer');
  const screenshotImage = document.getElementById('screenshotImage');

  const jsonResult = document.getElementById('jsonResult');
  const comparisonSummary = document.getElementById('comparisonSummary');
  const comparisonData = document.getElementById('comparisonData');

  // Elementos de opciones avanzadas
  const advancedOptionsHeader = document.getElementById('advancedOptionsHeader');
  const advancedOptionsContent = document.getElementById('advancedOptionsContent');

  const antiDetectionEnabled = document.getElementById('antiDetectionEnabled');
  const randomizeUserAgent = document.getElementById('randomizeUserAgent');
  const usePlugins = document.getElementById('usePlugins');
  const evasionTechniqueCheckboxes = document.querySelectorAll('input[name="evasionTechnique"]');

  const proxyEnabled = document.getElementById('proxyEnabled');
  const proxyTypeRadios = document.querySelectorAll('input[name="proxyType"]');
  const singleProxySettings = document.getElementById('singleProxySettings');
  const rotationProxySettings = document.getElementById('rotationProxySettings');
  const proxyServer = document.getElementById('proxyServer');
  const proxyUsername = document.getElementById('proxyUsername');
  const proxyPassword = document.getElementById('proxyPassword');
  const proxyList = document.getElementById('proxyList');
  const rotationStrategyRadios = document.querySelectorAll('input[name="rotationStrategy"]');

  // API Base URL
  const API_BASE_URL = 'http://localhost:3000/api';

  // Toggle para el acordeón de opciones avanzadas
  advancedOptionsHeader.addEventListener('click', function() {
    advancedOptionsContent.classList.toggle('active');

    if (advancedOptionsContent.classList.contains('active')) {
      advancedOptionsContent.style.display = 'block';
      advancedOptionsHeader.querySelector('span').textContent = 'Opciones avanzadas ▲';
    } else {
      advancedOptionsContent.style.display = 'none';
      advancedOptionsHeader.querySelector('span').textContent = 'Opciones avanzadas ▼';
    }
  });

  // Toggle para mostrar/ocultar opciones de anti-detección
  antiDetectionEnabled.addEventListener('change', function() {
    const antiDetectionOptions = document.querySelector('.anti-detection-options');
    antiDetectionOptions.style.display = this.checked ? 'block' : 'none';
  });

  // Toggle para mostrar/ocultar opciones de proxy
  proxyEnabled.addEventListener('change', function() {
    const proxyOptions = document.querySelector('.proxy-options');
    proxyOptions.style.display = this.checked ? 'block' : 'none';
  });

  // Toggle para cambiar entre proxy único o rotación
  proxyTypeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.value === 'single') {
        singleProxySettings.style.display = 'block';
        rotationProxySettings.style.display = 'none';
      } else {
        singleProxySettings.style.display = 'none';
        rotationProxySettings.style.display = 'block';
      }
    });
  });

  // Inicializar estado de los elementos de opciones
  document.querySelector('.anti-detection-options').style.display = 'none';
  document.querySelector('.proxy-options').style.display = 'none';

  // Verificar el estado del servidor
  async function checkServerStatus() {
    messageElement.textContent = 'Verificando estado del servidor...';
    messageElement.style.color = '#3498db';

    try {
      const response = await fetch(`${API_BASE_URL}/hello`);
      const data = await response.json();

      messageElement.textContent = `Estado del servidor: OK - ${data.message}`;
      messageElement.style.color = '#27ae60';

      // Habilitar el botón de ejecutar
      executeButton.disabled = false;
    } catch (error) {
      messageElement.textContent = 'Error: No se pudo conectar con el servidor. Verifica que esté en ejecución.';
      messageElement.style.color = '#e74c3c';

      // Deshabilitar el botón de ejecutar
      executeButton.disabled = true;
    }
  }

  // Construir el cuerpo de la petición para un método específico
  function buildRequestBody(method) {
    const url = urlInput.value.trim();
    const selector = selectorInput.value.trim();

    // Opciones comunes
    const options = {
      method: method,
      removeHtml: removeHtmlOption.checked,
      maxLength: parseInt(maxLengthOption.value) || 2000,
      timeout: parseInt(timeoutOption.value) || 30000,
      screenshot: screenshotOption.checked && method === 'browser'
    };

    // Agregar user agent si se especificó
    if (userAgentOption.value.trim()) {
      options.userAgent = userAgentOption.value.trim();
    }

    // Agregar opciones avanzadas si el acordeón está activo
    if (advancedOptionsContent.classList.contains('active')) {
      // Opciones de anti-detección
      if (antiDetectionEnabled.checked && method === 'browser') {
        options.antiDetection = {
          enabled: true,
          randomizeUserAgent: randomizeUserAgent.checked,
          usePlugins: usePlugins.checked,
          evasionTechniques: Array.from(evasionTechniqueCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value)
        };
      }

      // Opciones de proxy
      if (proxyEnabled.checked && method === 'browser') {
        const proxyType = document.querySelector('input[name="proxyType"]:checked').value;

        if (proxyType === 'single') {
          if (proxyServer.value.trim()) {
            options.proxy = {
              server: proxyServer.value.trim()
            };

            if (proxyUsername.value.trim()) {
              options.proxy.username = proxyUsername.value.trim();
            }

            if (proxyPassword.value.trim()) {
              options.proxy.password = proxyPassword.value.trim();
            }
          }
        } else {
          const proxyLines = proxyList.value.trim().split('\n').filter(line => line.trim());

          if (proxyLines.length > 0) {
            options.proxyRotation = {
              enabled: true,
              proxies: proxyLines.map(line => ({ server: line.trim() })),
              rotationStrategy: document.querySelector('input[name="rotationStrategy"]:checked').value
            };
          }
        }
      }
    }

    return {
      data: {
        url: url,
        options: options
      },
      selector: selector
    };
  }

  // Ejecutar un método de scraping específico
  async function executeScraping(method) {
    // Actualizar UI basado en el método
    const statusElement = method === 'light' ? lightStatus : browserStatus;
    const timingElement = method === 'light' ? lightTiming : browserTiming;
    const resultElement = method === 'light' ? lightResult : browserResult;

    // Actualizar estado
    statusElement.textContent = 'Ejecutando...';
    statusElement.className = 'status';
    timingElement.textContent = '';
    resultElement.textContent = '';

    if (method === 'browser') {
      screenshotContainer.style.display = 'none';
    }

    const startTime = performance.now();

    try {
      // Construir cuerpo de la petición
      const requestBody = buildRequestBody(method);

      // Hacer la petición al servidor
      const response = await fetch(`${API_BASE_URL}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data && data.id) {
        // Iniciar polling para obtener resultado
        await pollForResults(data.id, method, startTime);
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (error) {
      const endTime = performance.now();
      const elapsedTime = endTime - startTime;

      // Actualizar UI con el error
      statusElement.textContent = 'Error';
      statusElement.className = 'status error';
      timingElement.textContent = `Tiempo: ${elapsedTime.toFixed(2)}ms`;
      resultElement.textContent = `Error: ${error.message}`;
    }
  }

  // Hacer polling para obtener resultados
  async function pollForResults(checkId, method, startTime, attempt = 0) {
    const maxAttempts = 30; // 30 intentos x 2 segundos = 60 segundos máximo
    const statusElement = method === 'light' ? lightStatus : browserStatus;
    const timingElement = method === 'light' ? lightTiming : browserTiming;
    const resultElement = method === 'light' ? lightResult : browserResult;

    if (attempt >= maxAttempts) {
      statusElement.textContent = 'Timeout';
      statusElement.className = 'status warning';
      timingElement.textContent = 'La operación excedió el tiempo máximo de espera';
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/check/${checkId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      // Actualizar status
      statusElement.textContent = data.status;
      statusElement.className = data.status === 'completed' ? 'status success' : 'status';

      // Si ya está completado
      if (data.status === 'completed') {
        const endTime = performance.now();
        const elapsedTime = endTime - startTime;

        // Mostrar tiempo
        timingElement.textContent = `Tiempo: ${elapsedTime.toFixed(2)}ms`;

        // Obtener y mostrar resultado
        try {
          let resultObj;
          if (typeof data.result === 'string') {
            try {
              resultObj = JSON.parse(data.result);
            } catch (e) {
              resultObj = { text: data.result };
            }
          } else {
            resultObj = data.result;
          }

          // Guardar en objeto global para comparación
          if (method === 'light') {
            window.lightResult = {
              time: elapsedTime,
              result: resultObj,
              success: true
            };
          } else {
            window.browserResult = {
              time: elapsedTime,
              result: resultObj,
              success: true
            };
          }

          // Mostrar texto procesado o texto plano
          if (resultObj.processedText) {
            resultElement.textContent = resultObj.processedText;
          } else if (resultObj.text) {
            resultElement.textContent = resultObj.text;
          } else {
            resultElement.textContent = JSON.stringify(resultObj, null, 2);
          }

          // Mostrar captura de pantalla si está disponible (solo método browser)
          if (method === 'browser' && resultObj.screenshot) {
            screenshotContainer.style.display = 'block';
            screenshotImage.src = `data:image/jpeg;base64,${resultObj.screenshot}`;
          }

          // Mostrar resultado completo en JSON
          jsonResult.textContent = JSON.stringify(resultObj, null, 2);

          // Si tenemos ambos resultados, mostrar comparación
          updateComparisonSummary();
        } catch (error) {
          resultElement.textContent = `Error procesando resultado: ${error.message}`;
        }

        return;
      }

      // Si no está completo, esperar y reintentar
      setTimeout(() => {
        pollForResults(checkId, method, startTime, attempt + 1);
      }, 2000);

    } catch (error) {
      statusElement.textContent = 'Error';
      statusElement.className = 'status error';
      resultElement.textContent = `Error: ${error.message}`;
    }
  }

  // Actualizar resumen de comparación
  function updateComparisonSummary() {
    const lightData = window.lightResult;
    const browserData = window.browserResult;

    // Solo mostrar si tenemos ambos resultados
    if (lightData && browserData) {
      comparisonSummary.style.display = 'block';

      // Calcular diferencia de tiempo
      const timeDiff = browserData.time - lightData.time;
      const percentageDiff = (timeDiff / lightData.time) * 100;

      // Comparar resultados
      const lightText = lightData.result.processedText || lightData.result.text || '';
      const browserText = browserData.result.processedText || browserData.result.text || '';

      const textMatch = lightText.trim() === browserText.trim();

      // Información adicional
      const lightStats = lightData.result.stats || {};
      const browserStats = browserData.result.stats || {};

      // Construir HTML para el resumen
      let html = '';

      html += `
        <div>
          <h4>Tiempo de ejecución</h4>
          <p>Método ligero: ${lightData.time.toFixed(2)}ms</p>
          <p>Método con navegador: ${browserData.time.toFixed(2)}ms</p>
          <p>Diferencia: ${Math.abs(timeDiff).toFixed(2)}ms ${timeDiff > 0 ? '(navegador más lento)' : '(navegador más rápido)'}</p>
          <p>Diferencia porcentual: ${Math.abs(percentageDiff).toFixed(2)}%</p>
        </div>

        <div>
          <h4>Comparación de resultados</h4>
          <p>Los textos son ${textMatch ? '<span class="success">idénticos</span>' : '<span class="error">diferentes</span>'}</p>
          <p>Longitud (Ligero): ${lightText.length} caracteres</p>
          <p>Longitud (Navegador): ${browserText.length} caracteres</p>
        </div>
      `;

      // Información de estadísticas y técnicas avanzadas si están disponibles
      html += `
        <div>
          <h4>Características utilizadas</h4>
          ${browserStats.proxyUsed === 'yes' ? '<p>Proxy: <span class="success">Sí</span></p>' : '<p>Proxy: No</p>'}
          ${browserStats.antiDetectionUsed === 'yes' ? '<p>Anti-detección: <span class="success">Sí</span></p>' : '<p>Anti-detección: No</p>'}
          <p>Método ligero: ${lightStats.method || 'light'}</p>
          <p>Método navegador: ${browserStats.method || 'browser'}</p>
        </div>
      `;

      comparisonData.innerHTML = html;
    }
  }

  // Ejecutar comparación entre métodos
  async function executeComparison() {
    // Reiniciar resultados anteriores
    window.lightResult = null;
    window.browserResult = null;
    comparisonSummary.style.display = 'none';

    // Validar URL
    const url = urlInput.value.trim();
    if (!url) {
      alert('Por favor, introduce una URL válida');
      return;
    }

    // Verificar que al menos un método está seleccionado
    if (!lightMethodOption.checked && !browserMethodOption.checked) {
      alert('Por favor, selecciona al menos un método de scraping');
      return;
    }

    // Deshabilitar botón durante ejecución
    executeButton.disabled = true;

    // Ejecutar métodos seleccionados
    const promises = [];

    if (lightMethodOption.checked) {
      lightStatus.textContent = 'Iniciando...';
      lightStatus.className = 'status';
      lightTiming.textContent = '';
      lightResult.textContent = '';

      promises.push(executeScraping('light'));
    } else {
      lightStatus.textContent = 'No seleccionado';
      lightTiming.textContent = '';
      lightResult.textContent = '';
    }

    if (browserMethodOption.checked) {
      browserStatus.textContent = 'Iniciando...';
      browserStatus.className = 'status';
      browserTiming.textContent = '';
      browserResult.textContent = '';

      promises.push(executeScraping('browser'));
    } else {
      browserStatus.textContent = 'No seleccionado';
      browserTiming.textContent = '';
      browserResult.textContent = '';
    }

    // Esperar a que todos los métodos terminen
    try {
      await Promise.all(promises);
    } finally {
      // Habilitar botón al terminar
      executeButton.disabled = false;
    }
  }

  // Configurar event listeners
  checkServerButton.addEventListener('click', checkServerStatus);
  executeButton.addEventListener('click', executeComparison);

  // Verificar el estado del servidor al cargar
  checkServerStatus();
});
