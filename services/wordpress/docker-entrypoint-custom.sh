#!/bin/bash
set -euo pipefail

# Ejecutar el script de entrada original de WordPress
source /usr/local/bin/docker-entrypoint.sh

# Personalización adicional que se ejecutará después de que WordPress esté configurado
setup_wordpress_extras() {
  # Esperar a que la base de datos esté disponible
  until wp core is-installed --allow-root 2>/dev/null; do
    echo "Esperando a que WordPress esté configurado..."
    sleep 5
  done

  echo "WordPress está instalado, realizando configuraciones adicionales..."
  
  # Asegurarse de que los plugins personalizados estén activos
  if wp plugin is-installed wordfence --allow-root; then
    wp plugin activate wordfence --allow-root
  fi
  
  # Establecer configuración de permalinks
  wp rewrite structure '/%postname%/' --allow-root
  
  echo "Configuración adicional completada."
}

# Ejecutar configuraciones adicionales en segundo plano
if [ "${1}" = 'apache2-foreground' ]; then
  setup_wordpress_extras &
fi

# Ejecutar el comando solicitado
exec "$@"