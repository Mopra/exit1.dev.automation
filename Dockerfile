# exit1.dev.automation — webhook receiver → X publisher
FROM node:22-alpine

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY src ./src

# Runtime state lives here; mount a named volume over it in production
# so open incidents + the post-budget ledger survive restarts.
RUN mkdir -p /app/data && chown -R node:node /app
ENV STATE_FILE=/app/data/state.json
ENV NODE_ENV=production

# Drop root — this service parses untrusted webhook bodies and makes
# outbound calls. node:alpine ships an unprivileged `node` user (uid 1000).
USER node

EXPOSE 3000

# Healthcheck hits the receiver's /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/webhook-receiver/server.js"]
