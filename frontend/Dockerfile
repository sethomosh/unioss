# Stage 1: builder
FROM node:20.6.0-alpine AS builder
WORKDIR /app

# accept our API_BASE as a build-arg
ARG VITE_API_BASE
# inject into the container env
ENV VITE_API_BASE=$VITE_API_BASE

# copy manifests & install
COPY package.json package-lock.json ./
# install dependencies with relaxed network settings
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set strict-ssl false && \
    npm install
# copy source & build
COPY . .
RUN npm run build

# Stage 2: serve with Nginx
FROM nginx:1.26.3-alpine
# replace default nginx.conf with our SPA + proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# copy built output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
