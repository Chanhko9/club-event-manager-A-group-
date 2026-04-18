FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY . .

EXPOSE 5000

CMD ["npm", "--prefix", "backend", "start"]