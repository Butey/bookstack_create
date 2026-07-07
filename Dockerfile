FROM node:20-alpine AS builder

WORKDIR /app

# Ограничиваем использование RAM для Node.js во время сборки
ENV NODE_OPTIONS="--max-old-space-size=450"

COPY package.json package-lock.json* ./

# Устанавливаем git (необходим для github-зависимости markitdown), запускаем чистую сборку npm ci,
# удаляем git и принудительно очищаем кэш в один шаг, чтобы не раздувать слои Docker
RUN apk add --no-cache git && \
    npm ci --quiet --no-audit --no-fund --preferred-offline && \
    apk del git && \
    npm cache clean --force

COPY . .
RUN npm run build

# Удаляем dev-зависимости (включая тяжелые react, vite, mermaid, d3 из production node_modules) и очищаем кэш повторно
RUN npm prune --omit=dev && npm cache clean --force

FROM node:20-alpine AS runner

WORKDIR /app

# Ограничиваем использование RAM для Node.js в рантайме (150MB достаточно для Express, остальное отдаем системе)
ENV NODE_OPTIONS="--max-old-space-size=150"

# Устанавливаем окружение
ENV NODE_ENV=production
ENV PORT=3000

# Копируем только необходимые файлы для запуска, минимизируя размер итогового образа
COPY package.json package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Используем безопасного не-root пользователя node
USER node

EXPOSE 3000

CMD ["npm", "run", "start"]

