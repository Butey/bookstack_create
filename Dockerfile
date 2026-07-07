FROM node:20-alpine AS builder

WORKDIR /app

# Install git and other build essentials required for github dependencies (like markitdown)
RUN apk add --no-cache git openssh python3 make g++

COPY package.json package-lock.json* ./

# Clean install with cache optimization
RUN npm ci --quiet

COPY . .
RUN npm run build

# Prune devDependencies to keep node_modules production-only
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy only production files and the compiled app
COPY package.json package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Use non-root node user for security
USER node

EXPOSE 3000

CMD ["npm", "run", "start"]

