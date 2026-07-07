FROM node:20-alpine AS builder

WORKDIR /app

# Ограничиваем использование RAM для Node.js, предотвращая падение и зависание на слабых VPS
ENV NODE_OPTIONS="--max-old-space-size=450"

# Устанавливаем только git (необходим для github-зависимостей вроде markitdown)
# Удаляем тяжелые python3, make, g++, openssh для экономии места на диске (~200MB)
RUN apk add --no-cache git

COPY package.json package-lock.json* ./

# npm ci с оптимизацией кэша, отключением аудита/фонда и принудительной очисткой кэша для минимизации места на диске
RUN npm ci --quiet --no-audit --no-fund --preferred-offline && npm cache clean --force

COPY . .
RUN npm run build

# Удаляем dev-зависимости и очищаем кэш повторно
RUN npm prune --omit=dev && npm cache clean --force

FROM node:20-alpine AS runner

WORKDIR /app

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

