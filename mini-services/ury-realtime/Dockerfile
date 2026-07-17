# URY Realtime — WebSocket Service Dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3003

ENV PORT=3003
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "run", "index.ts"]
