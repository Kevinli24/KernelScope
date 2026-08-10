FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json api/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --workspace api --include-workspace-root
COPY api api
RUN npm run build --workspace api

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json api/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --omit=dev --workspace api --include-workspace-root && npm cache clean --force
COPY --from=build /app/api/dist api/dist
USER node
CMD ["node", "api/dist/index.js"]

