# Application: jupiter-www (www for Project jupiter)

This directory contains a simple static web application served by Nginx.

- Project Type: `static`
- Domain: `https://www.jupiter.ar`
- Source Files: Located directly in this directory (e.g., `index.html`, `style.css`). Modify or add files here.
- Docker Build: Uses the included `Dockerfile`.
- Deployment: Configured via `docker-compose-app.yml` for Traefik integration.

## Development

You can serve these files locally using a simple HTTP server (like `npx serve .`) or by building and running the Docker container:

```bash
# Build the image (run from this directory)
docker build -t jupiter-www-dev .

# Run the container
docker run -p 8080:80 --rm jupiter-www-dev
# Access at http://localhost:8080
```
