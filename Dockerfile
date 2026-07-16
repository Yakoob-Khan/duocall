# syntax=docker/dockerfile:1

# ---- 1. Build the client (Vite + Tailwind) ----
FROM node:22-alpine AS client-builder
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- 2. Build the server (TypeScript -> dist) ----
FROM node:22-alpine AS server-builder
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---- 3. Runtime: install production deps only, copy artifacts ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=server-builder /app/dist ./dist
COPY --from=client-builder /app/dist ./public

EXPOSE 8080
CMD ["node", "dist/index.js"]
