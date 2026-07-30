FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Matches docker-compose's service name — preserves current local-dev
# behavior with zero changes needed to docker-compose.yml. Override via the
# API_UPSTREAM app setting in any environment where "api" isn't resolvable
# (e.g. Azure), see web/nginx.conf.template.
ENV API_UPSTREAM=http://api:8000
# Deliberately NOT copied into /etc/nginx/templates/ — that directory
# triggers nginx's built-in auto-envsubst, which substitutes against the
# full container environment rather than just this one variable. Rendered
# explicitly instead via docker-entrypoint-render.sh.
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint-render.sh /docker-entrypoint.d/50-render-nginx-conf.sh
RUN chmod +x /docker-entrypoint.d/50-render-nginx-conf.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
