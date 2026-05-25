# ---------- Build stage ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Build args para inyectar la URL del backend en el bundle de Vite.
# Vite reemplaza import.meta.env.VITE_* en BUILD TIME, no en runtime,
# por eso deben venir como ARG y exportarse como ENV antes de `npm run build`.
ARG VITE_API_BASE
ARG VITE_ASSETS_BASE
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_ASSETS_BASE=$VITE_ASSETS_BASE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# `serve` es un static file server liviano con fallback SPA (-s) para React Router.
RUN npm install -g serve@14.2.4

COPY --from=builder /app/dist ./dist

# Railway inyecta $PORT en runtime. Default a 8080 si no se setea.
EXPOSE 8080

CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
