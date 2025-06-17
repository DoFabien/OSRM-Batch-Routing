# Multi-stage build for Node.js + Angular application

# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Build Node.js backend  
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Stage 2.5: Install production dependencies only
FROM node:20-alpine AS backend-prod-deps

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production

# Stage 3: Production image
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Use existing node user (UID 1000) instead of creating new user

WORKDIR /app

# Copy backend built files and dependencies
COPY --from=backend-builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=backend-prod-deps --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=node:node /app/backend/package.json ./backend/
COPY --from=backend-builder --chown=node:node /app/backend/src/data ./backend/dist/data
COPY --from=backend-builder --chown=node:node /app/backend/src/resources ./backend/dist/resources

# Copy frontend built files
COPY --from=frontend-builder --chown=node:node /app/frontend/dist/frontend ./frontend/dist/browser

# Create necessary directories with correct permissions
RUN mkdir -p uploads logs results && \
    chown -R node:node uploads logs results && \
    chmod -R 775 uploads logs results

# Switch to non-root user
USER node

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/dist/server.js"]