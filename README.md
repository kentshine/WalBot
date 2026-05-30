# 🛒 Walmart Stock Alert Bot

Monitors a specific Walmart product for in-store pickup availability and sends **Discord notifications** when stock changes. Uses **rebrowser-playwright** (undetected Chromium) for stealth anti-bot bypass.

## Features

- 🔍 Checks product availability every 5 minutes (configurable)
- 📱 Sends Discord alerts when stock status changes
- ⏰ Hourly "still monitoring" reminders when product stays out of stock
- 🥷 Stealth Chromium via rebrowser-playwright (UC) to bypass anti-bot detection
- 🏥 Built-in health check HTTP endpoint for cloud hosting
- 🐳 Docker-ready for Railway, Render, Fly.io, etc.

## Quick Start (Local)

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/walmart-bot.git
   cd walmart-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure `.env`**
   ```bash
   cp .env.example .env  # or create .env manually
   ```
   Set your `DISCORD_WEBHOOK_URL` in the `.env` file.

4. **Run the bot**
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Default | Description |
|:---------|:--------|:------------|
| `DISCORD_WEBHOOK_URL` | *(required)* | Discord webhook URL for notifications |
| `CHECK_INTERVAL_MINUTES` | `5` | How often to check stock (in minutes) |
| `REMINDER_INTERVAL_MINUTES` | `60` | How often to send "still out of stock" reminders |
| `PORT` | `10000` | Health check server port (Railway sets this automatically) |

## Deploy to Railway

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/walmart-bot.git
   git push -u origin main
   ```

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app)
   - Click **"New Project"** → **"Deploy from GitHub Repo"**
   - Select your `walmart-bot` repository
   - Railway will auto-detect the `Dockerfile`

3. **Set Environment Variables in Railway**
   - Go to your service → **Variables** tab
   - Add:
     - `DISCORD_WEBHOOK_URL` = your Discord webhook URL
     - `CHECK_INTERVAL_MINUTES` = `5` (or your preference)
     - `REMINDER_INTERVAL_MINUTES` = `60`
   - Railway auto-sets `PORT` — you don't need to add it

4. **Deploy!**
   - Railway will build and deploy automatically
   - Check the **Logs** tab to see the bot running
   - Visit `https://your-service.up.railway.app/health` to verify

## Health Check Endpoints

| Endpoint | Response |
|:---------|:---------|
| `GET /` | `Walmart Stock Alert Bot is running 🛒` |
| `GET /health` | JSON with full bot status (stock state, uptime, checks, etc.) |

## Discord Notifications

The bot sends three types of Discord notifications:

| Type | Color | When |
|:-----|:------|:-----|
| 🟢 **In Stock Alert** | Green | Product becomes available |
| 🔴 **Out of Stock** | Red | Product goes out of stock |
| ⏰ **Hourly Reminder** | Amber | Every hour while out of stock |

## Configuration

To monitor a **different product**, edit the `CONFIG` object in `monitor.js`:

```javascript
product: {
  name: 'Your Product Name',
  id: 'WALMART_PRODUCT_ID',
  url: 'https://www.walmart.com/ip/Your-Product/PRODUCT_ID',
},
store: {
  id: 'STORE_ID',
  name: 'Your Store Name',
  address: 'Store Address',
  zipCode: '12345',
},
```

## Tech Stack

- **Node.js** — Runtime
- **rebrowser-playwright** — Stealth Chromium automation (undetected-chromedriver for JS)
- **Discord Webhooks** — Notifications
- **Docker** — Containerized deployment
