FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Regenerar cliente Prisma en sync con el schema
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Copiar node_modules completo desde build: incluye prisma CLI para migrate deploy
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
USER node
EXPOSE 4000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/app/server.js"]
