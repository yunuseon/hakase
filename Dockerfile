# syntax=docker/dockerfile:1

# Debian slim rather than Alpine: Vite 8 pulls in Rolldown, whose native binaries
# are far better tested against glibc than musl.
ARG NODE_VERSION=22-bookworm-slim

# --- base -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
WORKDIR /app
RUN chown node:node /app
USER node

# --- deps -------------------------------------------------------------------
# Dependencies only, so this layer is reused until package-lock.json changes.
# The install happens inside Linux, which matters: Rolldown and esbuild ship
# platform-specific binaries that a macOS node_modules cannot provide.
FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# --- dev --------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
COPY --chown=node:node . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- build ------------------------------------------------------------------
FROM deps AS build
COPY --chown=node:node . .
RUN npm run build

# --- export -----------------------------------------------------------------
# Nothing but the built assets, so `--output type=local` lands dist/ on the host
# without dragging node_modules along with it.
FROM scratch AS export
COPY --from=build /app/dist /

# --- runtime ----------------------------------------------------------------
# Static output only; nothing from Node ends up in the served image.
FROM nginx:1.29-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
