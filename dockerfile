FROM node:20-alpine

# Create a non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 --no-create-home --disabled-password appuser

WORKDIR /app

COPY package*.json ./
RUN npm i

COPY . .

EXPOSE 3456


# Switch to non-root user
USER appuser
CMD ["node", "index.mjs"]
