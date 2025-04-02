# apps/jupiter/worker-sample/Dockerfile (Generated from template)

#---------------------------------------------
# Stage 1: Builder
#---------------------------------------------
# Use the Node.js version relevant for your project build tools
# Consider using a template variable like 22.13.1
FROM node:20 AS builder

WORKDIR /app

# Copy configuration files first
COPY package.json package-lock.json* ./
COPY tsconfig.base.json tsconfig.base.json
# COPY eslint.config.mjs eslint.config.mjs
# COPY .npmrc .npmrc

# Copy source code for the specific worker and potentially shared libs
# Adjust these COPY commands based on actual dependencies needed for the build
COPY apps/jupiter/worker-sample ./apps/jupiter/worker-sample
COPY libs ./libs

# Install ALL dependencies
RUN npm ci

# Build the specific worker application using NX
RUN npx nx build worker-sample

# Remove development dependencies after build is complete
RUN npm prune --omit=dev


#---------------------------------------------
# Stage 2: Production (Node Alpine)
#---------------------------------------------
# Use a lightweight Node.js Alpine image for the final stage
# Consider using a template variable like 22.13.1
FROM node:20-alpine AS production

WORKDIR /app

# Create a non-root user and group for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copy necessary artifacts from the builder stage
# Copy package.json first (potentially package-lock too if needed by runtime deps)
COPY --from=builder /app/package.json ./
# Copy pruned node_modules
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
# Copy the built application code
COPY --from=builder --chown=nodejs:nodejs /app/dist/apps/jupiter/worker-sample ./dist/apps/jupiter/worker-sample

# Switch to the non-root user
USER nodejs

# Expose the port the worker listens on (if any)
# Consider using a template variable like 3001
# EXPOSE 3001

# Define the command to run the worker application
# Adjust the path to main.js if necessary based on your build output
CMD [ "node", "dist/apps/jupiter/worker-sample/main.js" ]
