# Generador de Configuración VPS (`tools/vps`)

Este directorio contiene un generador Nx (`@mi-org/vps` - ajusta el scope) para facilitar la creación y gestión de configuraciones para desplegar aplicaciones en Servidores Virtuales Privados (VPS) dentro de este monorepo.

## Objetivos

* **Scaffolding:** Generar la estructura de archivos necesaria (Nginx en Docker Compose, scripts de despliegue, configs básicas) para configurar un VPS.
* **Consistencia:** Asegurar que todas las configuraciones de VPS sigan un patrón estándar y robusto.
* **Despliegue Continuo (CD):** Integrar con GitHub Actions para automatizar el despliegue (`.github/workflows/cd-deploy.yml`) usando `nx affected`.
* **Simplicidad y Robustez:** Buscar soluciones profesionales, mantenibles y seguras, priorizando el principio de menor privilegio.

## Filosofía y Decisiones Clave

* **Desarrollo Incremental:** Avance por fases (Hello World -> Nginx/Docker -> SSL).
* **Nx `affected`:** Se usa `nx show projects --affected --with-target=deploy --json` para detectar proyectos afectados y generar una matriz dinámica en el workflow de CD.
* **Sin `sudo` para `deploy` en CD:** El usuario `deploy` opera **sin** `sudo`. Los permisos necesarios para gestionar contenedores se obtienen añadiéndolo al grupo `docker`. Las tareas que requieren root (como renovación de Certbot) se manejan por mecanismos del sistema (systemd timer, deploy hooks).
* **Containerización (Nginx):** Nginx se ejecuta dentro de un contenedor Docker gestionado por `docker-compose` para aislamiento, consistencia y gestión de permisos simplificada.
* **Control de Despliegue:** El workflow de CD apunta a un "Environment" de GitHub Actions (ej. `vps-production`) que puede configurarse con reglas de protección (Wait timer, Required reviewers) para controlar cuándo se ejecutan los despliegues reales.
* **Secrets por Proyecto:** Las credenciales SSH (Host, User, Key) se configuran como Repository Secrets en GitHub con nombres específicos por proyecto (ej. `VPS_HOSTINGER_HOST`, `VPS_HOSTINGER_USER`, `VPS_HOSTINGER_KEY`) para permitir despliegues multi-destino.

## Scripts Auxiliares de Configuración del Servidor

Se proporcionan dos scripts en `tools/vps/scripts/` para preparar un nuevo VPS Debian/Ubuntu:

1.  **`debian-harden.sh`:**
    * **Propósito:** Seguridad base del SO.
    * **Acciones:** Actualiza sistema, crea usuario *administrador* con `sudo`, configura acceso SSH *solo por clave* para ese usuario, deshabilita login root y password SSH, instala y configura firewall `ufw`, opcionalmente instala `fail2ban`.
    * **Ejecución:** Como `root` en un servidor nuevo. Interactivo (pide nombre de usuario admin y su clave pública).
2.  **`vps-initial-setup.sh`:**
    * **Propósito:** Preparar entorno para despliegue de aplicaciones/contenedores.
    * **Acciones:** Crea usuario `deploy` (sin sudo), instala `docker`, `docker-compose-plugin`, `certbot` (y plugins DNS cloudflare/digitalocean), `rsync`, añade `deploy` al grupo `docker`, crea estructura de directorios (`/home/deploy/apps`, `/var/www/letsencrypt/challenges`, etc.), configura clave SSH opcional para `deploy`, guía sobre secretos DNS para Certbot.
    * **Ejecución:** Como usuario `sudo` (el creado por `debian-harden.sh`) después del hardening inicial.

## Flujo de Trabajo Recomendado para un Nuevo VPS

1.  **Crea el VPS:** (Debian 12 / Ubuntu LTS recomendado).
2.  **Acceso Inicial:** Conéctate como `root`.
3.  **Ejecuta Hardening:** Copia y ejecuta `debian-harden.sh`. Sigue los pasos, crea tu usuario `sudo` (`tu_admin_user`) y configura su clave. **Verifica el acceso SSH con clave para `tu_admin_user` antes de desconectar la sesión root.**
4.  **Ejecuta Setup Entorno:** Conéctate como `tu_admin_user`. Copia y ejecuta `vps-initial-setup.sh` usando `sudo`. Proporciona la clave pública para el usuario `deploy` (recomendado, usa una clave dedicada, ej. `github_actions_deploy_key.pub`). Configura los archivos de secretos DNS si usarás validación DNS.
5.  **Genera Configuración Nx:** En tu máquina local: `nx g @mi-org/vps:create nombre-vps [--directory=...] [--tags=...]`. Usa `--forceOverwrite` si necesitas regenerar sobre una configuración existente.
6.  **Configura Secrets GitHub:** Ve a `Settings > Secrets and variables > Actions` en tu repo y crea los secrets `VPS_<NOMBRE_VPS_UPPER>_HOST`, `VPS_<NOMBRE_VPS_UPPER>_USER`, `VPS_<NOMBRE_VPS_UPPER>_KEY` (la clave *privada* generada para despliegue, ej. el contenido de `github_actions_deploy_key`).
7.  **Configura Environment GitHub:** Ve a `Settings > Environments`, crea `vps-production` (o el nombre usado en el workflow) y configura reglas de protección (ej. Wait timer de 5-15 min, revisores si aplica). Desactiva "Allow administrators to bypass..." si quieres que las reglas siempre apliquen.
8.  **Commit y Push:** Sube los archivos generados (`apps/<nombre-vps>/`, `.github/workflows/cd-deploy.yml`) a la rama `main`.
9.  **Monitoriza/Aprueba Despliegue:** Ve a la pestaña "Actions". El workflow se ejecutará. Si configuraste aprobación/timer, el job `deploy` pausará. Una vez aprobado/esperado, los archivos se copiarán vía `rsync` y se ejecutará `deploy.sh` en el servidor usando `docker compose`.
10. **Verifica:** Accede a la IP/Dominio de tu VPS para ver el resultado.

## Estrategia de Gestión de Certificados (Let's Encrypt)

* **Renovación:** Automatizada por `certbot renew` ejecutado por el **timer de systemd** (`certbot.timer`) en el servidor VPS (configurado por `vps-initial-setup.sh`).
* **Método Preferido (Webroot):**
    * **Directorio Host:** Certbot (corriendo como root) escribe desafíos en `/var/www/letsencrypt/challenges/`.
    * **Config Certbot Host:** Los archivos `/etc/letsencrypt/renewal/*.conf` deben usar `authenticator = webroot` y `webroot_path = /var/www/letsencrypt/challenges`.
    * **Montaje Docker:** El volumen `- /var/www/letsencrypt/challenges:/var/www/letsencrypt/challenges-in-container:ro` se define en `docker-compose.vps.yml`.
    * **Config Nginx (Contenedor):** El bloque `location /.well-known/acme-challenge/ { alias /var/www/letsencrypt/challenges-in-container/; }` en `default.conf` sirve los desafíos.
* **Método Alternativo (DNS-01 - para Wildcards):**
    * Requiere plugins (`python3-certbot-dns-*`) y credenciales de API (guardadas de forma segura en `/home/deploy/.secrets/*.ini` con permisos `600 root:root`). El script `vps-initial-setup.sh` prepara los archivos placeholder y da instrucciones.
* **Instalación/Hook:** Certbot **NO** instala certificados automáticamente (`installer = None` implícito o explícito en `.conf`). El contenedor Nginx monta `/etc/letsencrypt:/etc/letsencrypt:ro`. Se usa un `deploy_hook` en los `.conf` de Certbot para reiniciar el contenedor Nginx (`docker compose -f /ruta/compose restart nginx`) después de una renovación exitosa.

## Estado Actual (2025-04-14)

* **Fase 1 Completada.**
* **Fase 2 Completada.**
* **Fase 3 Completada (Funcionalidad Base):**
    * Generador `vps:create` acepta opción `--domains`.
    * Templates Nginx generan configuración HTTP y HTTPS (usando `primaryDomain` para rutas de certs, `include` para opciones SSL, `ssl_dhparam`).
    * Template `README.md` generado incluye instrucciones detalladas para obtención inicial de certificado (manual vía DNS-01) y configuración del `deploy_hook` de Certbot.
    * Script `debian-harden.sh` ahora abre puertos 80/443 en UFW.
    * Log final del generador recuerda los pasos manuales de Certbot.
* **Pendiente:**
    * Refinamientos opcionales (manejo de errores, logs más detallados).
    * Considerar arquitectura de Proxy Inverso si se necesita alojar múltiples dominios independientes en el mismo VPS.
    * Pruebas exhaustivas en diferentes escenarios.
    * 
## Continuidad del Chat con Gemini

Para retomar este trabajo en una nueva sesión de chat con Gemini, sigue estos pasos:

1.  **Indica el Objetivo:** Comienza diciendo algo como: "Hola Gemini, estamos continuando el desarrollo de un generador Nx llamado 'vps' para configurar y desplegar sitios en VPS con Docker y Nginx. El estado actual está documentado en el README que te proporcionaré."
2.  **Proporciona el Contexto Principal (Este Archivo):** Copia y pega el **contenido completo** de este archivo (`tools/vps/README.md`) en el chat.
3.  **Prepárate para Proporcionar Código Clave:** Menciona que puedes proporcionar el contenido de archivos específicos si es necesario. Los más relevantes probablemente serán:
    * `tools/vps/src/generators/create/generator.ts`
    * `tools/vps/src/generators/create/lib/update-cd-workflow.ts`
    * `tools/vps/src/generators/create/lib/scripts/calculate-affected.sh`
    * `tools/vps/scripts/debian-harden.sh`
    * `tools/vps/scripts/vps-initial-setup.sh`
    * Templates de `tools/vps/src/blueprints/` (`docker-compose.vps.yml.template`, `nginx-conf/default.conf.template`, `deploy.sh.template`)
    * El `.github/workflows/cd-deploy.yml` generado.
4.  **Indica el Siguiente Paso:** Di claramente qué quieres hacer a continuación (ej. "Implementemos la configuración SSL/HTTPS (Fase 3)").

## Troubleshooting / Diagnóstico Básico

Si el despliegue falla o el sitio no está accesible después de un despliegue exitoso, aquí hay algunos comandos útiles para ejecutar en el servidor VPS:

**1. Verificar Contenedores Docker:**
   * Conéctate como usuario `deploy`.
   * Ve al directorio de la app: `cd /home/deploy/apps/<vps-name>/`
   * Comprueba estado: `docker compose -f docker-compose.vps.yml ps` (¿Está 'running'?)
   * Mira logs (especialmente si está en 'Restarting'): `docker compose -f docker-compose.vps.yml logs nginx`

**2. Verificar Firewall (UFW):**
   * Conéctate como usuario admin (con sudo).
   * `sudo ufw status verbose` (Asegúrate que 80/tcp y 443/tcp estén 'ALLOW IN').
   * Si faltan: `sudo ufw allow http && sudo ufw allow https`

**3. Verificar Puertos en Escucha:**
   * Conéctate como usuario admin (con sudo).
   * `sudo ss -tlpn | grep -E ':80|:443'` (Deberías ver `docker-proxy` escuchando).

**4. Probar Nginx Localmente:**
   * Conéctate como admin o deploy.
   * `curl -v http://localhost`
   * `curl -v --insecure https://localhost` (Debería devolver el HTML o un error de Nginx).

**5. Error "Permission denied (publickey)" en el Workflow:**
   * Verifica que el contenido del secret `VPS_<NAME>_KEY` en GitHub coincida EXACTAMENTE con tu clave privada de despliegue.
   * Verifica que la clave pública correspondiente esté EXACTAMENTE igual en `/home/deploy/.ssh/authorized_keys` en el servidor.
   * Verifica permisos: `sudo stat -c "%a %U:%G" /home/deploy/.ssh /home/deploy/.ssh/authorized_keys` (Deberían ser `700 deploy:deploy` y `600 deploy:deploy` respectivamente).

**6. Error "PasswordAuthentication yes" / Login con Contraseña Aún Activo:**
   * Verifica `/etc/ssh/sshd_config` y asegúrate que `PasswordAuthentication no` esté descomentado.
   * Revisa archivos en `/etc/ssh/sshd_config.d/` (especialmente los de `cloud-init`) por si están sobrescribiendo la configuración. Edita esos archivos si es necesario.
   * Reinicia SSH: `sudo systemctl restart sshd`.

**7. Problemas con Renovación o Certificados SSL:**
   * Verifica certificados existentes: `sudo certbot certificates`
   * Prueba renovación manual: `sudo certbot renew --dry-run`
   * Revisa configuración de renovación y hook: `sudo cat /etc/letsencrypt/renewal/tudominio.com.conf`
   * Revisa configuración Nginx para SSL (`apps/<vps-name>/nginx-conf/default.conf`).


---
*Este es un documento vivo y se actualizará a medida que el proyecto evolucione.*
