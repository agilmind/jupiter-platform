#!/bin/sh
# ===========================================================================
# Utilidades para manejo de archivos en etapas de Docker build
# Este script consolida las funciones de copy-if-exists.sh y copy-files.sh
# ===========================================================================

# Función para copiar archivos si existen
copy_if_exists() {
  src_pattern="$1"
  dest="$2"

  echo "🔍 Buscando archivos que coincidan con el patrón: $src_pattern"

  # Verificar si el patrón coincide con algún archivo
  if ls $src_pattern 1> /dev/null 2>&1; then
    echo "✅ Encontrados archivos para copiar a $dest"
    mkdir -p "$dest"
    cp -r $src_pattern "$dest"
    echo "✅ Copia completada"
  else
    echo "⚠️ No se encontraron archivos que coincidan con $src_pattern"
  fi
}

# Función para copiar archivos evitando recursión
copy_files_safely() {
  src_pattern="$1"
  dest_dir="$2"

  # Asegurar que el directorio destino existe
  mkdir -p $dest_dir

  echo "🔍 Buscando archivos que coincidan con el patrón: $src_pattern"

  # Intentar encontrar archivos que coincidan con el patrón
  files=$(ls $src_pattern 2>/dev/null || echo "")

  if [ -n "$files" ]; then
    echo "✅ Encontrados archivos para copiar a $dest_dir:"
    for file in $files; do
      if [ -e "$file" ]; then
        # Verificar que no estamos intentando copiar un directorio a sí mismo
        if [ "$(dirname $file)" != "$dest_dir" ]; then
          echo "  📋 Copiando $file"
          cp -r $file $dest_dir
        else
          echo "  ⚠️ Se evitó la recursión al copiar $file a $dest_dir"
        fi
      fi
    done
    echo "✅ Copia completada"
  else
    echo "⚠️ No se encontraron archivos para copiar desde $src_pattern"
  fi
}

# Manejo de parámetros de línea de comandos
CMD="$1"
case "$CMD" in
  copy-if-exists)
    copy_if_exists "$2" "$3"
    ;;
  copy-files)
    copy_files_safely "$2" "$3"
    ;;
  *)
    echo "Uso: $0 {copy-if-exists|copy-files} src_pattern dest_dir"
    echo ""
    echo "Comandos disponibles:"
    echo "  copy-if-exists: Copia archivos si existen"
    echo "  copy-files: Copia archivos evitando recursión"
    exit 1
    ;;
esac

exit 0
