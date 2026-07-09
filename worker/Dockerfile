FROM node:20-bookworm-slim AS deps

WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
