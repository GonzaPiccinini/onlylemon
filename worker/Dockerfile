FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# ESTA VARIABLE ES NECESARIA PARA PRISMA PORQUE NO EXISTE EN TIEMPO DE BUILD
ENV DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy'
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
# prisma.config.ts define datasource.url y no se compila al dist (rootDir=src)
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/app/server.js"]
