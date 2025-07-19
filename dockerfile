FROM node:20-alpine

# Create non-root user
RUN adduser --system --no-create-home --disabled-login --group appuser
RUN adduser --system --no-create-home --disabled-login appuser

WORKDIR /app

COPY package*.json ./
RUN npm i

COPY . .

EXPOSE 3456

# Switch to non-root user
USER appuser

CMD ["node", "index.mjs"]
USER appuser
