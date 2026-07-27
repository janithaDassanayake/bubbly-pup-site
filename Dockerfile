# syntax=docker/dockerfile:1
# Multi-stage build → small standalone Next.js runtime image.

# 1) deps: install all deps (incl. dev) for the build
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) build: generate Prisma client + compile Next in standalone mode
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# 3) run: minimal image with only what the standalone server needs
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Prisma needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app

# Standalone server + static assets + public files.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma schema, migrations and the generated engine for migrate-on-boot.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma

USER app
EXPOSE 3000
CMD ["node", "server.js"]
