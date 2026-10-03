FROM node:24-alpine AS build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig*.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY config/providers.json /app/config/providers.json
USER node
CMD ["node", "dist/index.js"]
