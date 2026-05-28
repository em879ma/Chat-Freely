# ────────────────────────────────────────────
# Stage 1 — install all workspace dependencies
# ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json  packages/shared/
COPY apps/web/package.json         apps/web/
COPY services/signaling/package.json services/signaling/
RUN npm ci

# ────────────────────────────────────────────
# Stage 2 — build shared, web, and signaling
# ────────────────────────────────────────────
FROM deps AS build
COPY . .

ARG VITE_SIGNALING_URL=/api
ENV VITE_SIGNALING_URL=${VITE_SIGNALING_URL}

RUN npm run build

# ────────────────────────────────────────────
# Stage 3 — production dependencies only
# ────────────────────────────────────────────
FROM deps AS prod-deps
RUN npm prune --omit=dev

# ────────────────────────────────────────────
# Target: web — nginx serving the SPA
# ────────────────────────────────────────────
FROM nginx:1.27-alpine AS web

RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ────────────────────────────────────────────
# Target: signaling — Node.js server
# ────────────────────────────────────────────
FROM node:20-alpine AS signaling
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared  ./packages/shared
COPY --from=build /app/services/signaling/dist ./services/signaling/dist
COPY --from=build /app/services/signaling/package.json ./services/signaling/
COPY --from=build /app/package.json ./

# Docker COPY follows symlinks, so the workspace link is lost — recreate it
RUN rm -rf node_modules/@chat-freely/shared && \
    mkdir -p node_modules/@chat-freely && \
    ln -s ../../packages/shared node_modules/@chat-freely/shared

WORKDIR /app/services/signaling
EXPOSE 8787
CMD ["node", "dist/index.js"]
