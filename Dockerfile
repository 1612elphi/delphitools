# Stage 1: Dependencies
FROM oven/bun:latest AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* bun.lockb* package-lock.json* yarn.lock* ./

# Install dependencies using Bun
# Bun supports multiple lockfile formats and can work with npm/yarn/pnpm files
RUN bun install --frozen-lockfile || bun install

# Stage 2: Builder
FROM deps AS builder
WORKDIR /app

# Copy source code
COPY . .

# Build the Next.js application
RUN bun run build

# Stage 3: Production Runtime
FROM oven/bun:latest AS runner
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Copy package.json
COPY --from=builder /app/package.json ./package.json

# Copy node_modules from builder for faster layer
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Use existing 'bun' user already in the image for security
# The oven/bun image includes a non-root 'bun' user by default
USER bun

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["bun", "run", "start"]
