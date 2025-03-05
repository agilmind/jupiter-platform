// Cargar variables de entorno primero
require('dotenv').config();

// Verificar las credenciales antes de ejecutar
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  console.error('ERROR: Email credentials not found in environment variables!');
  console.error('Make sure EMAIL_USER and EMAIL_PASSWORD are set in your .env file or environment');
  process.exit(1);
}

console.log('Credentials found, starting email service...');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '********' : 'NOT SET');

// Ejecutar el servicio de email
require('./dist/apps/email-service/main.js');
