# Production Dockerfile for football-betting-app
# Builds the app (including optional frontend build) and runs server.js
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies (including devDeps for frontend build if present)
COPY package.json package-lock.json ./
RUN npm ci --silent

# Copy source
COPY . .

# Build frontend if present (vite). Allow failure so image still builds if no frontend build exists.
RUN npm run build --if-present || true

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Runtime image
FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=base /app ./

ENV NODE_ENV=production
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
