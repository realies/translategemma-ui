# Build stage
FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./

# No dependency needs an install script on Linux (only the macOS-only fsevents has one).
RUN npm ci --ignore-scripts

# GlotLID model for LANGUAGE_DETECTOR=accurate: pinned and checksum-verified.
COPY scripts/fetch-glotlid.mjs scripts/
RUN node scripts/fetch-glotlid.mjs

COPY . .

RUN npm run build

# Production stage
FROM node:lts-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# dist/server includes the language detector's worker entry (assets/engine.worker-*.js).
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/models ./models
COPY --from=builder --chown=node:node /app/production-server.mjs ./

USER node

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "production-server.mjs"]
