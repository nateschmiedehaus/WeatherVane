# WeatherVane MCP Server - Containerized
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/

# Build TypeScript
RUN npm run build

# Create necessary directories
RUN mkdir -p /workspace/state \
    /workspace/docs \
    /workspace/logs \
    && chmod -R 755 /workspace

# Set resource limits via environment
ENV MAX_CONCURRENT_PROCESSES=10
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV WVO_DRY_RUN=0
ENV WVO_OTEL_ENABLED=0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Run as non-root user for security
RUN useradd -m -u 1000 weathervane && \
    chown -R weathervane:weathervane /app /workspace
USER weathervane

# Default command (can be overridden)
CMD ["node", "dist/index.js"]
