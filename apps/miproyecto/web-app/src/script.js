document.addEventListener('DOMContentLoaded', function() {
  // Referencias a elementos del DOM
  const checkServerButton = document.getElementById('checkServerButton');
  const executeButton = document.getElementById('executeButton');
  const messageElement = document.getElementById('message');

  // API Base URL - Importante: usar ruta relativa para que funcione con nginx
  const API_BASE_URL = '/api';

  // Mostrar información de configuración
  console.log('🔧 Configuración de API:');
  console.log('URL Base API (relativa): ' + API_BASE_URL);
  console.log('URL Base API (absoluta): ' + window.location.origin + API_BASE_URL);
  console.log('Host actual: ' + window.location.host);

  // Verificar el estado del servidor con diagnóstico mejorado
  async function checkServerStatus() {
    messageElement.textContent = 'Verificando estado del servidor...';
    messageElement.style.color = '#3498db';

    try {
      console.log('Intentando conectar a ' + API_BASE_URL + '/hello');

      // Primero intentamos con fetch normal
      const response = await fetch(`${API_BASE_URL}/hello`, {
        // Importante: Estas opciones ayudan a diagnosticar problemas CORS
        mode: 'cors',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json'
        },
        // Mostrar que se está haciendo un diagnóstico
        cache: 'no-cache'
      });

      console.log('Respuesta recibida:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Datos recibidos:', data);

      messageElement.textContent = `Estado del servidor: OK - ${data.message}`;
      messageElement.style.color = '#27ae60';

      // Habilitar el botón de ejecutar
      executeButton.disabled = false;
    } catch (error) {
      console.error('Error en fetch:', error);

      // Intento alternativo con XMLHttpRequest para diagnóstico
      messageElement.textContent = 'Error con fetch, intentando con XMLHttpRequest...';

      // Segundo intento usando XMLHttpRequest para mejor diagnóstico
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', `${API_BASE_URL}/hello`);
          xhr.setRequestHeader('Accept', 'application/json');

          xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                console.log('Datos recibidos (XMLHttpRequest):', data);
                messageElement.textContent = `Estado del servidor: OK - ${data.message}`;
                messageElement.style.color = '#27ae60';
                executeButton.disabled = false;
                resolve();
              } catch (e) {
                reject(new Error('Error parseando respuesta: ' + e.message));
              }
            } else {
              reject(new Error(`Error HTTP (XMLHttpRequest): ${xhr.status} ${xhr.statusText}`));
            }
          };

          xhr.onerror = function() {
            console.error('Error en XMLHttpRequest:', xhr.statusText);
            reject(new Error('Error de red o CORS'));
          };

          xhr.send();
        });
      } catch (xhrError) {
        console.error('Error en XMLHttpRequest:', xhrError);

        // Intento #3: Verificar si podemos al menos acceder al servidor web
        try {
          await fetch('/network-test');
          messageElement.textContent = 'Error: Servidor web accesible, pero API no responde. Posible problema en backend.';
        } catch (e) {
          messageElement.textContent = 'Error: No se pudo conectar con el servidor. Verificar backend y configuración de red.';
        }

        messageElement.style.color = '#e74c3c';
        executeButton.disabled = true;
      }
    }
  }

  // Rest of your code (buildRequestBody, executeScraping, etc.)

  // Configurar event listeners
  checkServerButton.addEventListener('click', checkServerStatus);

  // Verificar el estado del servidor al cargar
  checkServerStatus();
});
