FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod --legacy /deploy

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
WORKDIR /app
COPY --from=build /deploy ./
EXPOSE 8787
CMD ["node", "dist/index.js"]
