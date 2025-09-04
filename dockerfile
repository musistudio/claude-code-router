FROM node:20-alpine

WORKDIR /app

# Copy all files
COPY . .

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Fix rollup optional dependencies issue
RUN cd ui && npm install

# Build the entire project including UI
RUN pnpm run build

# Expose port
EXPOSE 3456

# Start the router service
CMD ["node", "dist/cli.js", "start"]
