FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/elysium-contracts-0.10.0.tgz ./vendor/
COPY catalog/package.json ./catalog/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY catalog/tsconfig.json ./catalog/
COPY catalog/src ./catalog/src
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/index.html ./frontend/
COPY frontend/plugins ./frontend/plugins
COPY frontend/src ./frontend/src
COPY frontend/public/fonts ./frontend/public/fonts
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEONEI_HOST=0.0.0.0
COPY package.json package-lock.json ./
COPY vendor/elysium-contracts-0.10.0.tgz ./vendor/
COPY catalog/package.json ./catalog/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --workspace catalog --workspace backend
COPY --from=build /app/catalog/dist ./catalog/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
USER node
EXPOSE 3002
CMD ["node", "backend/dist/server.js"]
