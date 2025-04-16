# Infraestructura VPS: hostinger

Este directorio contiene los archivos de configuración generados para el stack de infraestructura base (Proxy Inverso Traefik + Stack de Monitoreo) para la instancia llamada **`hostinger`**.

Estos archivos fueron generados por el generador `@mi-org/vps:create` (ajusta scope según tu config Nx).

## Archivos de Configuración Clave

- `docker-compose-infra.yml`: Define los servicios Docker (Traefik, Grafana, Prometheus, Loki, Promtail, Node Exporter).
- `traefik.yml`: Configuración estática de Traefik (entrypoints con redirección HTTPS, provider Docker, resolvedor ACME Let's Encrypt por defecto).
- `.env.template`: Plantilla para variables de entorno. **Debes crear `.env` en el servidor.**
- `prometheus.yml`: Configuración de scrapeo para Prometheus.
- `loki-config.yml`: Configuración de Loki.
- `promtail-config.yml`: Configuración de Promtail.
- `.gitignore`: Ignora el archivo `.env`.
- `README.md`: Este mismo archivo.
- `project.json`: Configuración para Nx.

**Archivos Requeridos Manualmente en el Servidor (NO en Git):**

- `/home/deploy/infra/.env`: Creado a partir de `.env.template`. Contiene secretos como la contraseña de Grafana y, opcionalmente, tokens de API para el desafío ACME DNS-01.
- `/home/deploy/infra/traefik-auth/.htpasswd`: Contiene el usuario y contraseña (hasheada) para acceder al Dashboard de Traefik.

## Prerrequisitos Indispensables

Antes de intentar desplegar esta configuración:

1.  **Servidor VPS Preparado:** El servidor VPS de destino **debe** haber sido inicializado usando los scripts del repositorio:
    - `tools/vps/scripts/debian-harden.sh` (ejecutado como `root`)
    - `tools/vps/scripts/vps-initial-setup.sh` (ejecutado con `sudo`)
      (Consulta `tools/vps/README.md` para más detalles).
2.  **Acceso SSH como `deploy`:** Debes poder conectarte al VPS mediante SSH como usuario `deploy` usando autenticación por clave (sin contraseña).
3.  **Repositorio Git Actualizado:** Todos los archivos generados dentro de este directorio (`infra/hostinger/`) **deben** estar comiteados y pusheados a la rama principal de tu repositorio Git.
4.  **Registros DNS Creados:** Los registros DNS para los subdominios de infraestructura deben existir y apuntar a la IP pública del VPS **antes** de intentar el despliegue.
    - `traefik.jupiter.ar` -> `IP_DEL_VPS`
    - `grafana.jupiter.ar` -> `IP_DEL_VPS`
5.  **Secretos de GitHub Actions:** Asegúrate de que los secretos necesarios para el workflow `cd-infra.yml` existan en la configuración de tu repositorio GitHub. Basado en el `infraName` **`hostinger`**, el workflow esperará secretos llamados:
    - `VPS_HOSTINGER_HOST`: IP o Hostname del VPS.
    - `VPS_HOSTINGER_USER`: Usuario SSH (debería ser `deploy`).
    - `VPS_HOSTINGER_KEY`: Clave privada SSH para el usuario `deploy`.

## Pasos para el Primer Despliegue (y Únicos Pasos Manuales Necesarios)

El despliegue se realiza mediante el workflow de GitHub Actions `Deploy VPS Infrastructure Stack (Manual)`, pero requiere que los archivos `.env` y `.htpasswd` existan previamente en el servidor.

1.  **Preparar Archivos de Secretos en el Servidor:**

    - Conéctate al VPS como usuario `deploy`: `ssh deploy@<IP_o_HOSTNAME_VPS>`
    - Navega al directorio de infraestructura: `cd /home/deploy/infra/`
    - **Copiar `.env.template` (si no existe):** Si es la primera vez y el directorio está vacío, copia el template desde tu máquina local o desde el repo Git (ej. usando `scp` o `wget` si el repo es público/accesible). `scp ruta/local/a/infra/hostinger/.env.template deploy@<IP_o_HOSTNAME_VPS>:/home/deploy/infra/`
    - **Crear y Editar `.env`:**
      - `cp .env.template .env`
      - `nano .env`
      - Rellena los valores:
        - `GF_ADMIN_PASSWORD`: **Obligatorio.** Cambia `changeme` por una contraseña segura para Grafana.
        - `CF_DNS_API_TOKEN`, `DO_AUTH_TOKEN`, etc.: **Opcional.** Solo si usas el desafío DNS-01 para Let's Encrypt en `traefik.yml`. Descomenta y añade tus credenciales.
      - Guarda y cierra (`Ctrl+O`, `Enter`, `Ctrl+X`).
    - **Crear Directorio y Archivo `.htpasswd`:**
      - `mkdir -p traefik-auth`
      - Instala `htpasswd` si no existe: `sudo apt update && sudo apt install -y apache2-utils`
      - Genera la contraseña para el usuario `admin` (o el que prefieras) y guárdala:
        ```bash
        # Reemplaza 'tu-password-segura-aqui' con tu contraseña real
        htpasswd -cb traefik-auth/.htpasswd admin 'tu-password-segura-aqui'
        ```
        - (`-c` crea el archivo, úsalo solo la primera vez. Para añadir/modificar usuarios después, omite `-c`).
      - Ajusta permisos (recomendado): `chmod 600 traefik-auth/.htpasswd`

2.  **Ejecutar el Workflow de Despliegue:**

    - Ve a la sección **Actions** de tu repositorio en GitHub.
    - Selecciona el workflow `Deploy VPS Infrastructure Stack (Manual)` en el panel izquierdo.
    - Haz clic en el botón **"Run workflow"**.
    - En el desplegable **"Select the Infrastructure project name"**, elige **`hostinger`**.
    - Haz clic en el botón verde **"Run workflow"**.
    - El workflow se ejecutará: sincronizará los archivos de configuración desde Git (excluyendo `.env` y `.htpasswd`), y luego ejecutará `docker compose up -d` en el servidor.

3.  **Verificación:**
    - Espera unos minutos. Puedes seguir los logs en el servidor con: `ssh deploy@<IP_o_HOSTNAME_VPS> "cd /home/deploy/infra && docker compose logs -f traefik"`
    - Una vez que Traefik haya obtenido los certificados, prueba a acceder en tu navegador:
      - `https://traefik.jupiter.ar` (Debería pedir autenticación Basic Auth: `admin` / `tu-password-segura-aqui`).
      - `https://grafana.jupiter.ar` (Login: `admin` / la contraseña que pusiste en `.env`).
    - Si todo funciona, ¡la infraestructura base está lista! Las actualizaciones futuras se hacen simplemente volviendo a ejecutar el workflow (Paso 2).

## Próximos Pasos

- Desplegar aplicaciones usando tu generador `project:create` (o similar) y el workflow `cd-deploy.yml`.
- Asegúrate de que las aplicaciones desplegadas usen la red `webproxy` y definan las `labels` correctas de Traefik para su exposición.
- Si habilitaste el monitoreo, configura Prometheus/Loki/Promtail para recoger métricas/logs de tus aplicaciones y crea dashboards en Grafana.
