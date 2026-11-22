FROM node:20-alpine

# FFmpeg does the actual video compositing
RUN apk add --no-cache ffmpeg \
 && mkdir -p /data /branding \
 && chown -R node:node /data

WORKDIR /app
COPY package.json render.js server.js ./
COPY tools ./tools

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    BRANDING_DIR=/branding

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "server.js"]
