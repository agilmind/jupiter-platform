# Generador de Configuración VPS (`tools/vps`)

Este directorio contiene un generador Nx (`@mi-org/vps` - ajusta el scope) para facilitar la creación y gestión de configuraciones para desplegar aplicaciones en Servidores Virtuales Privados (VPS) dentro de este monorepo.

## Objetivos

* **Scaffolding:** Generar la estructura de archivos necesaria (Nginx en Docker Compose, scripts de despliegue, configs SSL básicas) para configurar un VPS.
* **Consistencia:** Asegurar que todas las configuraciones de VPS sigan un patrón estándar y robusto.
* **Despliegue Continuo (CD):** Integrar con GitHub Actions para automatizar el despliegue (`.github/workflows/cd-deploy.yml`) usando `nx affected` (vía `nx show projects`).
* **Simplicidad y Robustez:** Buscar soluciones profesionales, mantenibles y seguras, priorizando el principio de menor privilegio.

## Filosofía y Decisiones Clave

* **Desarrollo Incremental:** Avance por fases (Hello World -> Nginx/Docker -> SSL -> Monitoring).
* **Nx `affected`:** Se usa `nx show projects --affected --with-target=deploy --json` para detectar proyectos afectados y generar una matriz dinámica en el workflow de CD.
* **Sin `sudo` para `deploy` en CD:** El usuario `deploy` opera **sin** `sudo`. Los permisos necesarios (Docker) se obtienen añadiéndolo al grupo `docker`. Las tareas root (Certbot) se manejan por mecanismos del sistema o pasos manuales iniciales documentados.
* **Containerización (Nginx):** Nginx se ejecuta dentro de un contenedor Docker (`nginx:stable-alpine`) gestionado por `docker-compose` para aislamiento y consistencia.
* **Control de Despliegue:** El workflow de CD apunta a un "Environment" de GitHub Actions (ej. `vps-production`) configurable con reglas de protección (Wait timer, Required reviewers).
* **Secrets por Proyecto:** Credenciales SSH (`VPS_<NAME>_HOST`, `VPS_<NAME>_USER`, `VPS_<NAME>_KEY`) se configuran como Repository Secrets en GitHub con nombres específicos por proyecto.
* **Gestión SSL:** Certbot se ejecuta en el **host** (disparado por `certbot.timer`). Se recomienda validación **DNS-01** para obtención inicial (requiere paso manual único). Renovaciones usan el método configurado (DNS o webroot). Nginx en contenedor monta `/etc/letsencrypt` (ro) y sirve desafíos webroot desde un volumen dedicado (`/var/www/letsencrypt/challenges`) si se usa ese método. Un `deploy_hook` manual en la config de renovación de Certbot reinicia el contenedor Nginx.

## Scripts Auxiliares de Configuración del Servidor

Ubicados en `tools/vps/scripts/`, ejecutar en orden en un VPS Debian/Ubuntu nuevo:

1.  **`debian-harden.sh` (Ejecutar como `root`):**
    * Seguridad base SO, usuario admin con `sudo`, hardening SSH (solo clave), firewall `ufw` (permite SSH, HTTP, HTTPS), opcionalmente `fail2ban`.
2.  **`vps-initial-setup.sh` (Ejecutar con `sudo`):**
    * Usuario `deploy` (sin sudo, en grupo `docker`), Docker, Docker Compose, Certbot + plugins DNS (cloudflare, digitalocean), `rsync`, directorios (`/home/deploy/apps`, `/var/www/letsencrypt/challenges`), configuración clave SSH opcional para `deploy`, guía secretos DNS Certbot.

## Flujo de Trabajo Recomendado para un Nuevo VPS

1.  **Crea VPS** (Debian/Ubuntu).
2.  **Acceso Inicial** (root).
3.  **Ejecuta `debian-harden.sh`**. Verifica acceso con nuevo usuario sudo y clave.
4.  **Ejecuta `vps-initial-setup.sh`** (con sudo). Proporciona clave pública para `deploy` (recomendado). Configura secretos DNS si aplica.
5.  **Genera Configuración Nx** (local): `nx g @mi-org/vps:create <nombre> --domains=<lista-dominios>`.
6.  **Configura Secrets GitHub:** `VPS_<NOMBRE_UPPER>_HOST/USER/KEY` (KEY es la clave *privada* de despliegue).
7.  **Configura Environment GitHub:** Crea `vps-production`, añade reglas (Wait timer / Reviewers). Desactiva bypass de admin.
8.  **Obtén Certificado Inicial (Manual en VPS):** Conéctate como admin y ejecuta `sudo certbot certonly --dns-[provider] ...` listando todos los dominios (ver README generado en `apps/<nombre>/README.md` para comando exacto).
9.  **Configura Deploy Hook (Manual en VPS):** Edita `/etc/letsencrypt/renewal/<dominio_ppal>.conf` (con sudo) y añade la línea `deploy_hook` para reiniciar el contenedor Nginx (ver README generado).
10. **Commit y Push:** Sube los archivos generados a `main`.
11. **Monitoriza/Aprueba Despliegue:** Observa GitHub Actions. Aprueba o espera el timer. El CD copiará archivos y ejecutará `deploy.sh`.
12. **Verifica:** Accede a `https://<tu-dominio>`.

## Gestionar Dominios (Post-Creación)

Para añadir o eliminar dominios/subdominios de una configuración existente (`<nombre>`):

1.  **Actualiza DNS:** Añade/elimina los registros DNS necesarios para los nuevos/viejos dominios.
2.  **Regenera Configuración Nx:** Ejecuta `nx g @mi-org/vps:create <nombre> --domains=<NUEVA_lista_completa_dominios> --forceOverwrite`. Esto actualizará `apps/<nombre>/nginx-conf/default.conf`.
3.  **Actualiza Certificado (Manual en VPS):** Conéctate como admin y ejecuta `sudo certbot certonly --cert-name <dominio_ppal> --dns-[provider] ...` listando **todos** los dominios que debe cubrir el certificado actualizado (incluyendo los nuevos, omitiendo los eliminados). Usa `--cert-name` para modificar el existente. Certbot actualizará los archivos y la configuración de renovación (preservando el hook).
4.  **Commit y Push:** Sube el `default.conf` modificado. El CD desplegará la nueva configuración Nginx, que usará el certificado actualizado.

## Estrategia de Gestión de Certificados (Let's Encrypt)

* **Renovación:** Automática vía `certbot.timer` (host) + `deploy_hook` (en `/etc/letsencrypt/renewal/*.conf`) para reiniciar contenedor Nginx.
* **Obtención Inicial:** **Manual** vía `sudo certbot certonly --dns-[provider] ...` en el host.
* **Método Webroot (Para Renovación si no se usa DNS):** Certbot (host) escribe en `/var/www/letsencrypt/challenges/`. Docker monta este directorio en `/var/www/letsencrypt/challenges-in-container:ro`. Nginx (contenedor) usa `alias /var/www/letsencrypt/challenges-in-container/;` en el bloque `location /.well-known/acme-challenge/`.
* **Método DNS:** Requiere plugins y credenciales API en `/home/deploy/.secrets/*.ini` (propietario root, modo 600).
* **Instalación:** Nginx (contenedor) monta `/etc/letsencrypt:/etc/letsencrypt:ro` y usa los certificados directamente. Certbot (host) no necesita `installer`.

## Estado Actual (2025-04-14)

* **Fase 1 (Hello World):** Completada.
* **Fase 2 (Nginx/Docker Básico):** Completada.
* **Fase 3 (SSL/HTTPS Básico):** Completada.
    * Generador acepta `--domains`.
    * Templates Nginx generan configuración HTTPS funcional.
    * Documentación (generada y principal) incluye pasos manuales para Certbot inicial y deploy hook.
    * Workflow CD validado (incluyendo detección de afectados y environment/timer).
* **Pendiente (Próximos Pasos):**
    * **Fase 4: Monitoring:** Implementar stack de monitoreo (Prometheus, Grafana, Loki, etc.).
    * **Mejoras:** Proxy inverso para múltiples dominios independientes, manejo de variables de entorno para apps, bases de datos, etc.
    * Pruebas exhaustivas.

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
