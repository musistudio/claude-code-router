FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm i

COPY . .

EXPOSE 3456

CMD ["node", "index.mjs"]
