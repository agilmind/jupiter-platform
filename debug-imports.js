const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(...args) {
  try {
    return originalRequire.apply(this, args);
  } catch (error) {
    if (error.message.includes('Unexpected token \'export\'')) {
      console.error('Error al importar:', args[0]);
      console.error('Desde archivo:', this.filename);
      console.error('Stack:', error.stack);
    }
    throw error;
  }
};
