FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ wget \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY server.js db.js ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=1880
ENV DATA_DIR=/app/data

EXPOSE 1880

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:1880/health || exit 1

CMD ["node", "server.js"]
