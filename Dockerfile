# Multi-stage Dockerfile for DEXScreener Top Gainers & Trap Inspector
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public
COPY index.json ./
COPY architecture.md ./

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
