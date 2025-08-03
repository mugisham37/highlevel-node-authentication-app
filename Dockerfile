# Multi-stage Dockerfile for Enterprise Auth Backend
# Stage 1: Base image with common dependencies
FROM node:18-alpine AS base

# Install security updates and system dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Stage 2: Dependencies installation
FROM base AS deps

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --only=production=false && \
    npm cache clean --force

# Stage 3: Build stage
FROM deps AS builder

# Copy configuration files
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Remove dev dependencies and clean up
RUN npm prune --production && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/tmp/*

# Stage 4: Production runtime
FROM base AS runtime

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Copy built application and production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Create necessary directories
RUN mkdir -p logs tmp && \
    chown -R nodejs:nodejs logs tmp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check with improved configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Stage 5: Development stage
FROM deps AS development

# Install additional development tools
RUN apk add --no-cache git openssh-client

# Copy all source files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port for development
EXPOSE 3000

# Switch to non-root user
USER nodejs

# Development command
CMD ["npm", "run", "dev"]