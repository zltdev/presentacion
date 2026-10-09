# Imagen de la web app. Contexto de build = raíz del repo (necesita index.html y brochures/).
FROM node:22-bookworm-slim AS web
WORKDIR /repo/app/web
COPY app/web/package.json app/web/package-lock.json ./
RUN npm ci
COPY app/web/ ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo/app/server
COPY app/server/package.json app/server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY app/server/src ./src
COPY app/server/migrations ./migrations
COPY --from=web /repo/app/web/dist /repo/app/web/dist
# La web base: la app la lee, nunca la escribe
COPY index.html /repo/index.html
COPY brochures /repo/brochures
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
