# Stage 1: builder (unchanged)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve with Nginx
FROM nginx:stable-alpine
# Replace the default nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
