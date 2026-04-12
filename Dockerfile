FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy standalone output + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy custom server (WebSocket proxy) + ws package it depends on
COPY --from=builder /app/server.js ./
COPY --from=builder /app/node_modules/ws ./node_modules/ws

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
