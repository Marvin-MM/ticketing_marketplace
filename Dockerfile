# Multi-stage build for production
FROM node:18-alpine AS base

# Install dependencies required for native modules and PDFKit
RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    gif-dev \
    librsvg-dev \
    python3 \
    make \
    g++ \
    dumb-init \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create directories for uploads and logs
RUN mkdir -p /app/uploads/tickets /app/uploads/images /app/logs
RUN chown -R nodejs:nodejs /app/uploads /app/logs /app

# Production API stage
FROM base AS production

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/app.js"]

# Development stage
FROM base AS development

# Switch back to root to install dev dependencies
USER root

# Install all dependencies (including dev)
RUN npm ci && npm cache clean --force

# Switch back to non-root user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start development server
CMD ["npm", "run", "dev"]

# Worker stage for background processing
FROM base AS worker

# Switch to non-root user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start worker processes
CMD ["node", "src/workers/index.js"]
