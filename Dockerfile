FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm install

COPY src ./src/

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run prisma:seed && npm start"]
