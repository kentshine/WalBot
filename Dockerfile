FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose the health check port
EXPOSE 10000

# Start the bot
CMD ["node", "monitor.js"]
