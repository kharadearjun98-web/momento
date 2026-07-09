# Build stage
FROM node:20.18-alpine@sha256:053c1d99e608fe9fa0db6821edd84276277c0a663cd181f4a3e59ee20f5f07ea AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci
ENV NODE_ENV=production

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Production stage
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN sed -i 's|pid        /run/nginx.pid;|pid        /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && sed -i 's|error_log  /var/log/nginx/error.log notice;|error_log  /tmp/nginx-error.log notice;|' /etc/nginx/nginx.conf \
    && sed -i 's|access_log  /var/log/nginx/access.log  main;|access_log  /tmp/nginx-access.log  main;|' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /var/run /run

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["nginx", "-e", "/tmp/nginx-error.log", "-g", "daemon off;"]
