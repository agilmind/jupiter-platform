document.addEventListener('DOMContentLoaded', function () {
  const messageElement = document.getElementById('message');
  const fetchButton = document.getElementById('fetchButton');

  // Función para obtener el mensaje del servidor
  async function fetchMessage() {
    messageElement.textContent = 'Cargando...';

    try {
      const response = await fetch('http://localhost:3000/api/hello');
      const data = await response.json();
      messageElement.textContent = data.message;
    } catch (error) {
      messageElement.textContent =
        'Error al conectar con el servidor. Verifica que esté ejecutándose.';
      console.error('Error:', error);
    }
  }

  // Evento de clic para el botón
  fetchButton.addEventListener('click', fetchMessage);

  // Cargar mensaje al iniciar
  fetchMessage();
});
