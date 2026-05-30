FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || true

# Copy source code
COPY . .

# Expose the health check port
EXPOSE 10000

# Start the bot
CMD ["node", "monitor.js"]
