#!/bin/bash
# update-haiku.sh

# Capturar el directorio del proyecto NX (donde estás ejecutando el script)
PROJECT_DIR=$(pwd)
echo "Directorio del proyecto: $PROJECT_DIR"

# Directorio temporal
TMP_DIR=$(mktemp -d)
echo "Usando directorio temporal: $TMP_DIR"

# Clonar el repositorio
git clone https://github.com/garciafido/haiku-generator.git "$TMP_DIR/haiku-generator"
cd "$TMP_DIR/haiku-generator"

# Instalar dependencias y compilar
echo "Instalando dependencias..."
npm install

echo "Compilando..."
npm run build

# Verificar que exista el directorio build
if [ ! -d "./build" ]; then
  echo "Error: No se encontró el directorio build después de la compilación"
  exit 1
fi

# Copiar los archivos compilados
echo "Copiando archivos compilados a node_modules..."
mkdir -p "$PROJECT_DIR/node_modules/haiku-generator/build"
cp -R build/* "$PROJECT_DIR/node_modules/haiku-generator/build/"

echo "Actualización completada con éxito"
