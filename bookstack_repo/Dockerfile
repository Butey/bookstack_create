FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Copy package data and install only production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the built frontend app and server
COPY --from=builder /app/dist ./dist

# Environment Variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
