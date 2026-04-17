# ── Stage 1: compile TypeScript ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: runtime with mdbtools ───────────────────────────────────────────
FROM mcr.microsoft.com/azure-functions/node:4-node20-appservice

# Install mdbtools (native C Access-database parser)
RUN apt-get update && \
    apt-get install -y --no-install-recommends mdbtools && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_OPTIONS="--max-old-space-size=2800"

WORKDIR /home/site/wwwroot

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY host.json ./
