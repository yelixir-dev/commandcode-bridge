# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM deps AS build
COPY tsconfig.json tsconfig.build.json vitest.config.ts eslint.config.js .prettierrc.json ./
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts
RUN npm run verify
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=9992
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY README.md README.ko.md LICENSE .env.example ./
USER node
EXPOSE 9992
CMD ["node", "dist/index.js"]
