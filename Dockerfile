# Stage 1: Dependencies
FROM oven/bun:latest AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* bun.lockb* ./

# Install dependencies using Bun
RUN bun install --frozen-lockfile || bun install

# Stage 2: Builder
FROM deps AS builder
WORKDIR /app

# Copy source code
COPY . .

# Build-time commit SHA for the in-app version label. `.git` is excluded from
# the build context (see .dockerignore), so it can't be read here — pass it in:
#   docker build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) .
# Defaults to "dev" when not supplied. next.config.ts reads NEXT_PUBLIC_COMMIT_SHA.
ARG COMMIT_SHA=dev
ENV NEXT_PUBLIC_COMMIT_SHA=$COMMIT_SHA

# Build the Next.js application (with `output: "export"` Next will write
# the static export into `/app/out` as part of `next build`)
RUN bun run build

# Stage 3: Production Runtime - serve static files with nginx
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Remove default nginx content
RUN rm -rf ./*

# Copy exported static site
COPY --from=builder /app/out /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check (inside container)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

# Start nginx (default CMD is retained)
CMD ["nginx", "-g", "daemon off;"]
