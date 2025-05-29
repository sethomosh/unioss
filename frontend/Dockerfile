# Stage 1: builder
FROM node:20-alpine AS builder
WORKDIR /app

# 1) accept our API_BASE as a build-arg
ARG VITE_API_BASE
# 2) inject into the container env
ENV VITE_API_BASE=$VITE_API_BASE

# Copy manifests & install
COPY package.json package-lock.json ./
RUN npm ci

# Copy source & build
COPY . .
RUN npm run build

# Stage 2: serve with Nginx
FROM nginx:stable-alpine
# Replace the default nginx.conf with our SPA + proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy built output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
