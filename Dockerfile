# Multi-stage Dockerfile for secure production builds
# Keys should be mounted at runtime via secrets/volumes, NOT copied during build

# ==================== BUILDER STAGE ====================
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript to JavaScript
RUN npm run build

# ==================== PRODUCTION STAGE ====================
FROM node:22-slim AS production

WORKDIR /app

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Copy only production artifacts
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/build ./build

# Set proper ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Keys directory - mount at runtime!
# Example: docker run -v /path/to/keys:/app/keys:ro ...
VOLUME ["/app/keys"]

EXPOSE ${PORT:-8000}

CMD ["node", "build/server.js"]

# ==================== DEVELOPMENT STAGE ====================
FROM node:22-slim AS development

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./

# In development, keys can be mounted or copied
VOLUME ["/app/keys"]

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

EXPOSE ${PORT:-8000}

CMD ["npx", "nodemon", "-r", "tsconfig-paths/register", "--exec", "ts-node", "./src/server.ts", "--files"]