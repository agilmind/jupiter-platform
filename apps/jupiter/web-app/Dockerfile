# apps/jupiter/web-app/Dockerfile (Generated from template)

#---------------------------------------------
# Stage 1: Builder
#---------------------------------------------
# Use the Node.js version relevant for your project build tools (NX, TypeScript, etc.)
# Consider using a template variable like 22.13.1 if your generator supports it
FROM node:22.13.1 AS builder

WORKDIR /app

RUN npm install -g npm@latest

# Copy configuration files first for better layer caching
COPY package.json package-lock.json* ./
COPY tsconfig.base.json tsconfig.base.json
COPY eslint.config.mjs eslint.config.mjs
COPY nx.json nx.json
COPY .npmrc .npmrc

# Copy source code for the specific app and potentially shared libs
# Adjust these COPY commands based on actual dependencies needed for the build
COPY apps/jupiter/web-app ./apps/jupiter/web-app
COPY libs ./libs

# Install ALL dependencies (including devDependencies needed for build)
# Using npm ci for reproducible builds based on package-lock.json
RUN npm ci

# Build the specific webapp using NX
# This generates static files typically in dist/apps/jupiter/web-app/
RUN npx nx build web-app

# Optional: If you want to prune dev dependencies before copying node_modules
# RUN npm prune --omit=dev


#---------------------------------------------
# Stage 2: Production (Nginx for serving static files)
#---------------------------------------------
# Use a lightweight Nginx image
FROM nginx:stable-alpine AS production

# Copy static build artifacts from the builder stage to the Nginx web server root
COPY --from=builder /app/dist/apps/jupiter/web-app /usr/share/nginx/html

# Optional: Copy a custom Nginx configuration file if needed.
# This file would also ideally be generated from a template.
# COPY ./nginx.conf /etc/nginx/conf.d/default.conf
# Ensure you have a corresponding nginx.conf.template in your blueprint if using this.

# Expose the default Nginx port
EXPOSE 80

# Default command to start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
