# Build stage
FROM node:lts-alpine AS builder

WORKDIR /app

# GlotLID model for LANGUAGE_DETECTOR=accurate: pinned and checksum-verified. Fetched before the
# dependencies so a package change does not download it again.
COPY scripts/fetch-glotlid.mjs scripts/
RUN node scripts/fetch-glotlid.mjs

COPY package*.json ./

# No dependency needs an install script on Linux (only the macOS-only fsevents has one).
RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

# Production stage
FROM node:lts-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder --chown=node:node /app/dist ./dist
# The language detector's worker and GlotLID model, read from the working directory.
COPY --from=builder --chown=node:node /app/src/languageDetector/engine.worker.mjs ./src/languageDetector/
COPY --from=builder --chown=node:node /app/models ./models
COPY --from=builder --chown=node:node /app/production-server.mjs ./

USER node

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "production-server.mjs"]
