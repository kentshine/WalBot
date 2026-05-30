// ============================================
// Walmart Stock Alert Monitor
// ============================================
// Monitors a specific Walmart product for in-store availability
// at the Horseheads Supercenter and sends Discord alerts.
//
// Uses rebrowser-playwright (undetected Chromium) in headless
// mode for cloud deployment (Railway, Render, etc.)
// ============================================

const { chromium } = require('rebrowser-playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  product: {
    name: 'NeeDoh Nice Cube Satisfying Square-Shaped Sensory Toy, Colors May Vary',
    id: '3523128211',
    url: 'https://www.walmart.com/ip/NeeDoh-Nice-Cube-Satisfying-Square-Shaped-Sensory-Toy-Colors-May-Vary-Children-Ages-3/3523128211',
  },
  store: {
    id: '1976',
    name: 'Horseheads Supercenter',
    address: '1400 County Rd 64, Horseheads, NY 14845',
    zipCode: '14845',
  },
  checkIntervalMinutes: 5,
  reminderIntervalMinutes: 60,
  discordWebhookUrl: '',
  port: 10000,
};

// ── State Tracking ─────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, '.stock-state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (err) {
    log('⚠️  Failed to load state file, starting fresh', 'WARN');
  }
  return { lastKnownInStock: false, lastChecked: null, alertsSent: 0, lastHourlyReminder: null, totalChecks: 0 };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    log('⚠️  Failed to save state file', 'WARN');
  }
}

// ── Logging ────────────────────────────────────────────────────
function log(message, level = 'INFO') {
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const prefix = {
    INFO: '🔵',
    WARN: '🟡',
    ERROR: '🔴',
    SUCCESS: '🟢',
    ALERT: '🔔',
  };
  console.log(`[${timestamp}] ${prefix[level] || '⚪'} [${level}] ${message}`);
}

// ── Load .env file ─────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          process.env[key] = value;
        }
      }
    }
  }

  CONFIG.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
  const interval = parseInt(process.env.CHECK_INTERVAL_MINUTES, 10);
  if (!isNaN(interval) && interval > 0) {
    CONFIG.checkIntervalMinutes = interval;
  }
  const reminderInterval = parseInt(process.env.REMINDER_INTERVAL_MINUTES, 10);
  if (!isNaN(reminderInterval) && reminderInterval > 0) {
    CONFIG.reminderIntervalMinutes = reminderInterval;
  }
  const port = parseInt(process.env.PORT, 10);
  if (!isNaN(port) && port > 0) {
    CONFIG.port = port;
  }
}

// ── Discord Notification ───────────────────────────────────────
function sendDiscordAlert(inStock) {
  return new Promise((resolve) => {
    if (
      !CONFIG.discordWebhookUrl ||
      CONFIG.discordWebhookUrl === 'YOUR_DISCORD_WEBHOOK_URL_HERE'
    ) {
      log('⚠️  Discord webhook URL not configured. Skipping notification.', 'WARN');
      log('   Edit the .env file and set DISCORD_WEBHOOK_URL', 'WARN');
      resolve(false);
      return;
    }

    const now = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const embed = {
      title: inStock ? '🟢 IN STOCK ALERT!' : '🔴 Out of Stock Update',
      description: inStock
        ? '**The item you are monitoring is now IN STOCK!**\nGo grab it before it sells out!'
        : 'The item is currently out of stock at your store.',
      color: inStock ? 0x00ff00 : 0xff0000,
      fields: [
        {
          name: '🏷️ Product',
          value: CONFIG.product.name,
          inline: false,
        },
        {
          name: '🏬 Store',
          value: `${CONFIG.store.name}\n${CONFIG.store.address}`,
          inline: true,
        },
        {
          name: '🔗 Product Link',
          value: `[View on Walmart.com](${CONFIG.product.url})`,
          inline: true,
        },
        {
          name: '⏰ Checked At',
          value: now,
          inline: false,
        },
      ],
      footer: { text: 'Walmart Stock Alert Bot' },
      timestamp: new Date().toISOString(),
    };

    const payload = JSON.stringify({
      username: 'Walmart Stock Alert',
      avatar_url: 'https://i.imgur.com/AfFp7pu.png',
      embeds: [embed],
    });

    const url = new URL(CONFIG.discordWebhookUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const req = protocol.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            log('✅ Discord alert sent successfully!', 'SUCCESS');
            resolve(true);
          } else {
            log(`❌ Discord webhook returned status ${res.statusCode}: ${body}`, 'ERROR');
            resolve(false);
          }
        });
      }
    );

    req.on('error', (err) => {
      log(`❌ Failed to send Discord alert: ${err.message}`, 'ERROR');
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// ── Hourly Reminder Notification ───────────────────────────────
function sendHourlyReminder(state) {
  return new Promise((resolve) => {
    if (
      !CONFIG.discordWebhookUrl ||
      CONFIG.discordWebhookUrl === 'YOUR_DISCORD_WEBHOOK_URL_HERE'
    ) {
      log('⚠️  Discord webhook URL not configured. Skipping reminder.', 'WARN');
      resolve(false);
      return;
    }

    const now = new Date();
    const nowFormatted = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // Calculate how long the bot has been monitoring
    const monitoringSince = state.monitoringStartedAt
      ? new Date(state.monitoringStartedAt)
      : now;
    const uptimeMs = now - monitoringSince;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptimeStr = uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes}m`
      : `${uptimeMinutes}m`;

    const embed = {
      title: '⏰ Hourly Status — Still Out of Stock',
      description:
        '**Your bot is still running and actively monitoring.**\n' +
        'The product has not been listed yet. You will be notified immediately when it becomes available.',
      color: 0xffaa00, // amber
      fields: [
        {
          name: '🏷️ Product',
          value: CONFIG.product.name,
          inline: false,
        },
        {
          name: '🏬 Store',
          value: `${CONFIG.store.name}\n${CONFIG.store.address}`,
          inline: true,
        },
        {
          name: '📊 Stats',
          value: `Uptime: **${uptimeStr}**\nChecks performed: **${state.totalChecks || 0}**`,
          inline: true,
        },
        {
          name: '🔗 Product Link',
          value: `[View on Walmart.com](${CONFIG.product.url})`,
          inline: false,
        },
        {
          name: '⏰ Last Checked',
          value: nowFormatted,
          inline: true,
        },
        {
          name: '🔄 Next Reminder',
          value: `In ${CONFIG.reminderIntervalMinutes} minutes`,
          inline: true,
        },
      ],
      footer: { text: 'Walmart Stock Alert Bot — Hourly Reminder' },
      timestamp: now.toISOString(),
    };

    const payload = JSON.stringify({
      username: 'Walmart Stock Alert',
      avatar_url: 'https://i.imgur.com/AfFp7pu.png',
      embeds: [embed],
    });

    const url = new URL(CONFIG.discordWebhookUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const req = protocol.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            log('✅ Hourly reminder sent successfully!', 'SUCCESS');
            resolve(true);
          } else {
            log(`❌ Hourly reminder webhook returned status ${res.statusCode}: ${body}`, 'ERROR');
            resolve(false);
          }
        });
      }
    );

    req.on('error', (err) => {
      log(`❌ Failed to send hourly reminder: ${err.message}`, 'ERROR');
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// ── Helpers ────────────────────────────────────────────────────
function randomDelay(minMs, maxMs) {
  return new Promise((resolve) =>
    setTimeout(resolve, minMs + Math.random() * (maxMs - minMs))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Stealth Browser Launch ─────────────────────────────────────
const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function launchStealthBrowser() {
  log('   Launching stealth Chromium (headless)...', 'INFO');

  const browser = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 42.1678, longitude: -76.8261 }, // Horseheads, NY
    permissions: ['geolocation'],
    // Extra headers to look more human
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  });

  log('   Stealth Chromium ready!', 'SUCCESS');
  return { browser, context };
}

// ── Stock Check ────────────────────────────────────────────────
async function checkStock() {
  log(`Checking stock for: ${CONFIG.product.name}`);
  log(`Store: ${CONFIG.store.name} (ID: ${CONFIG.store.id})`);

  let browser = null;

  try {
    // Launch stealth browser
    const launched = await launchStealthBrowser();
    browser = launched.browser;
    const context = launched.context;

    // Set store location cookies
    log('   Setting store location cookies...', 'INFO');
    await context.addCookies([
      {
        name: 'assortmentStoreId',
        value: CONFIG.store.id,
        domain: '.walmart.com',
        path: '/',
      },
      {
        name: 'com.wm.reflector',
        value: `reflectorid:0:${CONFIG.store.id}`,
        domain: '.walmart.com',
        path: '/',
      },
      {
        name: 'hasLocData',
        value: '1',
        domain: '.walmart.com',
        path: '/',
      },
      {
        name: 'locGuestData',
        value: encodeURIComponent(
          JSON.stringify({
            intent: 'STORE_INTENT',
            isDefault: false,
            storeId: CONFIG.store.id,
            postalCode: CONFIG.store.zipCode,
            city: 'Horseheads',
            state: 'NY',
            isExplicitIntent: true,
          })
        ),
        domain: '.walmart.com',
        path: '/',
      },
    ]);

    // Create a new page
    const page = await context.newPage();

    // Navigate to the product page
    log('   Navigating to product page...', 'INFO');
    await page.goto(CONFIG.product.url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for dynamic content
    await randomDelay(5000, 8000);

    // Check for bot detection
    const title = await page.title();
    if (title.toLowerCase().includes('robot') || title.toLowerCase().includes('human')) {
      log('   ⚠️ Bot challenge detected! Running in headless mode — cannot solve manually.', 'WARN');
      log('   Will retry next cycle. rebrowser-playwright stealth should reduce these.', 'INFO');

      // Wait a short while in case it auto-resolves (some challenges do)
      try {
        await page.waitForFunction(
          () => {
            const t = document.title.toLowerCase();
            return !t.includes('robot') && !t.includes('human');
          },
          { timeout: 15000 }
        );
        log('   ✅ Bot challenge auto-resolved!', 'SUCCESS');
        await randomDelay(3000, 5000);
      } catch {
        log('   ❌ Bot challenge persists. Skipping this cycle.', 'WARN');
        await browser.close();
        return null;
      }
    }

    // Grab page data
    const nextDataText = await page.evaluate(() => {
      const script = document.getElementById('__NEXT_DATA__');
      return script ? script.textContent : null;
    });
    const pageText = await page.evaluate(() => document.body?.innerText || '');
    const pageContent = await page.content();

    // Close browser entirely (each check gets a fresh browser to avoid memory leaks)
    await browser.close();
    browser = null;

    // Run extraction strategies
    let stockResult = tryNextDataExtraction(nextDataText);
    if (stockResult === null) stockResult = tryPageTextExtraction(pageText);
    if (stockResult === null) stockResult = tryHtmlExtraction(pageContent);

    if (stockResult === null) {
      log('⚠️  Could not determine stock status', 'WARN');
      // Show a snippet for debugging
      const snippet = pageText.substring(0, 500).replace(/\s+/g, ' ').trim();
      log(`   Page snippet: ${snippet.substring(0, 200)}...`, 'INFO');
    }

    return stockResult;
  } catch (err) {
    log(`❌ Error checking stock: ${err.message}`, 'ERROR');
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    return null;
  }
}

// ── Extraction Strategy 1: __NEXT_DATA__ ───────────────────────
function tryNextDataExtraction(nextDataText) {
  try {
    if (!nextDataText) {
      log('   [Strategy 1] __NEXT_DATA__ not found', 'INFO');
      return null;
    }

    let data;
    try {
      data = JSON.parse(nextDataText);
    } catch {
      log('   [Strategy 1] Failed to parse __NEXT_DATA__', 'WARN');
      return null;
    }

    const result = deepSearchAvailability(data);
    if (result !== null) {
      log(
        `   [Strategy 1] Result: ${result ? 'IN STOCK ✅' : 'OUT OF STOCK ❌'}`,
        result ? 'SUCCESS' : 'INFO'
      );
    } else {
      log('   [Strategy 1] Data found but no stock fields located', 'INFO');
    }
    return result;
  } catch (err) {
    log(`   [Strategy 1] Error: ${err.message}`, 'WARN');
    return null;
  }
}

function deepSearchAvailability(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;

  // Check fulfillmentOptions
  if (Array.isArray(obj.fulfillmentOptions)) {
    for (const opt of obj.fulfillmentOptions) {
      const type = (opt.type || opt.fulfillmentType || '').toUpperCase();
      if (['STORE', 'PICKUP', 'IN_STORE', 'INSTORE'].includes(type)) {
        return (
          opt.available === true ||
          (opt.availabilityStatus || '').toUpperCase() === 'AVAILABLE' ||
          (opt.status || '').toUpperCase() === 'AVAILABLE' ||
          opt.pickupable === true
        );
      }
    }
  }

  if (typeof obj.fulfillmentBadge === 'string') {
    const badge = obj.fulfillmentBadge.toUpperCase();
    if (badge.includes('PICKUP') || badge.includes('STORE')) return true;
  }

  if (typeof obj.availabilityStatusV2 === 'string') {
    const s = obj.availabilityStatusV2.toUpperCase();
    if (s === 'IN_STOCK' || s === 'AVAILABLE') return true;
    if (s === 'OUT_OF_STOCK' || s === 'NOT_AVAILABLE') return false;
  }

  if (obj.availabilityStatus) {
    const s = (
      typeof obj.availabilityStatus === 'string'
        ? obj.availabilityStatus
        : obj.availabilityStatus.status || ''
    ).toUpperCase();
    if (s === 'IN_STOCK' || s === 'AVAILABLE') return true;
    if (s === 'OUT_OF_STOCK' || s === 'NOT_AVAILABLE') return false;
  }

  for (const key of ['storeOffer', 'pickupOffer']) {
    if (obj[key]) {
      const o = obj[key];
      if (o.available === true || (o.availabilityStatus || '').toUpperCase() === 'AVAILABLE') return true;
      if (o.available === false || (o.availabilityStatus || '').toUpperCase() === 'NOT_AVAILABLE') return false;
    }
  }

  const skip = new Set(['breadCrumb', 'seo', 'analytics', 'reviews', 'images', 'longDescription', 'idml']);
  for (const key of Object.keys(obj)) {
    if (skip.has(key) || key.startsWith('__')) continue;
    const val = obj[key];
    if (val && typeof val === 'object') {
      const r = deepSearchAvailability(val, depth + 1);
      if (r !== null) return r;
    }
  }
  return null;
}

// ── Extraction Strategy 2: Page Text ───────────────────────────
function tryPageTextExtraction(pageText) {
  try {
    const lower = pageText.toLowerCase();

    const oosPatterns = [
      'out of stock',
      'currently unavailable',
      'sold out',
      'not available at this store',
      'out of stock at your store',
      'out of stock at nearby stores',
      'this item is out of stock',
      'not in stock',
    ];

    const isPatterns = [
      'pickup today',
      'pickup tomorrow',
      'free pickup',
      'available for pickup',
      'pickup available',
      'in stock at',
    ];

    for (const p of oosPatterns) {
      if (lower.includes(p)) {
        log(`   [Strategy 2] OOS text: "${p}"`, 'INFO');
        return false;
      }
    }

    for (const p of isPatterns) {
      if (lower.includes(p)) {
        log(`   [Strategy 2] In-stock text: "${p}"`, 'SUCCESS');
        return true;
      }
    }

    if (lower.includes('add to cart')) {
      log('   [Strategy 2] "Add to cart" found', 'SUCCESS');
      return true;
    }

    log('   [Strategy 2] No clear indicators', 'INFO');
    return null;
  } catch (err) {
    log(`   [Strategy 2] Error: ${err.message}`, 'WARN');
    return null;
  }
}

// ── Extraction Strategy 3: HTML patterns ───────────────────────
function tryHtmlExtraction(html) {
  try {
    const lower = html.toLowerCase();

    const oosHtml = [
      '"availabilitystatus":"not_available"',
      '"availabilitystatus":"out_of_stock"',
      '"storeavailability":"out_of_stock"',
      '"pickupable":false',
      'data-testid="out-of-stock"',
      'data-testid="fulfillment-oos"',
    ];

    const isHtml = [
      '"availabilitystatus":"available"',
      '"availabilitystatus":"in_stock"',
      '"storeavailability":"in_stock"',
      '"pickupable":true',
      'data-testid="add-to-cart-btn"',
      'data-testid="fulfillment-pickup"',
      '"fulfillmenttype":"store"',
      '"fulfillmenttype":"pickup"',
    ];

    for (const p of oosHtml) {
      if (lower.includes(p)) {
        log(`   [Strategy 3] OOS pattern: "${p}"`, 'INFO');
        return false;
      }
    }

    for (const p of isHtml) {
      if (lower.includes(p)) {
        log(`   [Strategy 3] In-stock pattern: "${p}"`, 'SUCCESS');
        return true;
      }
    }

    log('   [Strategy 3] No patterns matched', 'INFO');
    return null;
  } catch (err) {
    log(`   [Strategy 3] Error: ${err.message}`, 'WARN');
    return null;
  }
}

// ── Health Check HTTP Server ───────────────────────────────────
let botState = null; // Will be set in runMonitor

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/health/') {
      const state = botState || loadState();
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'running',
        product: CONFIG.product.name,
        store: CONFIG.store.name,
        lastChecked: state.lastChecked,
        lastKnownInStock: state.lastKnownInStock,
        totalChecks: state.totalChecks || 0,
        alertsSent: state.alertsSent,
        uptime: `${uptimeHours}h ${uptimeMinutes}m`,
        checkInterval: `${CONFIG.checkIntervalMinutes} minutes`,
      }, null, 2));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Walmart Stock Alert Bot is running 🛒');
    }
  });

  server.listen(CONFIG.port, () => {
    log(`Health check server running on port ${CONFIG.port}`, 'SUCCESS');
    log(`   GET / → status message`, 'INFO');
    log(`   GET /health → JSON status`, 'INFO');
  });

  return server;
}

// ── Main Loop ──────────────────────────────────────────────────
async function runMonitor() {
  loadEnv();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              🛒  WALMART STOCK ALERT MONITOR  🛒               ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Product:  ${CONFIG.product.name.substring(0, 51).padEnd(51)} ║`);
  console.log(`║  Store:    ${CONFIG.store.name.padEnd(51)} ║`);
  console.log(`║  Address:  ${CONFIG.store.address.padEnd(51)} ║`);
  console.log(`║  Interval: Every ${(CONFIG.checkIntervalMinutes + ' minutes').padEnd(44)} ║`);
  console.log(`║  Reminder: Every ${(CONFIG.reminderIntervalMinutes + ' min (if out of stock)').padEnd(44)} ║`);
  console.log(`║  Mode:     Stealth Chromium (rebrowser-playwright)${' '.repeat(14)}║`);
  console.log(`║  Health:   http://localhost:${String(CONFIG.port).padEnd(37)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  ℹ️  Running in headless mode — optimized for cloud deployment.');
  console.log('  ℹ️  Using rebrowser-playwright stealth to bypass anti-bot detection.');
  console.log('');

  if (
    !CONFIG.discordWebhookUrl ||
    CONFIG.discordWebhookUrl === 'YOUR_DISCORD_WEBHOOK_URL_HERE'
  ) {
    log('⚠️  Discord webhook URL not configured!', 'WARN');
    log('   Edit .env and set DISCORD_WEBHOOK_URL', 'WARN');
    log('   Stock checks will still run and log to console.', 'WARN');
    console.log('');
  }

  // Start health check server
  startHealthServer();

  const state = loadState();
  botState = state; // Make accessible to health endpoint
  // Record when monitoring session started (for uptime tracking)
  if (!state.monitoringStartedAt) {
    state.monitoringStartedAt = new Date().toISOString();
  }
  log(`Previous state: ${state.lastKnownInStock ? 'IN STOCK' : 'OUT OF STOCK'}`);
  log(`Alerts sent: ${state.alertsSent}`);
  log(`Hourly reminders: enabled (every ${CONFIG.reminderIntervalMinutes} min while out of stock)`);
  console.log('');

  // First check
  await performCheck(state);

  // Recurring checks
  const intervalMs = CONFIG.checkIntervalMinutes * 60 * 1000;
  log(`Next check in ${CONFIG.checkIntervalMinutes} minute(s)...`);
  console.log('');

  setInterval(async () => {
    log('━'.repeat(55));
    await performCheck(state);
    log(`Next check in ${CONFIG.checkIntervalMinutes} minute(s)...`);
    console.log('');
  }, intervalMs);
}

async function performCheck(state) {
  const inStock = await checkStock();

  if (inStock === null) {
    log('Could not determine stock status. Will retry next cycle.', 'WARN');
    return;
  }

  state.lastChecked = new Date().toISOString();
  state.totalChecks = (state.totalChecks || 0) + 1;

  if (inStock && !state.lastKnownInStock) {
    log('🎉 STOCK CHANGE DETECTED: Now IN STOCK!', 'ALERT');
    await sendDiscordAlert(true);
    state.lastKnownInStock = true;
    state.alertsSent += 1;
    // Reset reminder timer when stock is found
    state.lastHourlyReminder = new Date().toISOString();
  } else if (!inStock && state.lastKnownInStock) {
    log('Item is now OUT OF STOCK again.', 'INFO');
    state.lastKnownInStock = false;
    // Start the reminder timer from now
    state.lastHourlyReminder = new Date().toISOString();
  } else if (inStock) {
    log('Still in stock. No new alert needed.', 'SUCCESS');
  } else {
    log('Still out of stock. Monitoring continues...', 'INFO');

    // ── Hourly Reminder Logic ──
    const now = new Date();
    const lastReminder = state.lastHourlyReminder
      ? new Date(state.lastHourlyReminder)
      : null;
    const reminderIntervalMs = CONFIG.reminderIntervalMinutes * 60 * 1000;

    if (!lastReminder || (now - lastReminder) >= reminderIntervalMs) {
      log(`⏰ ${CONFIG.reminderIntervalMinutes}-minute reminder: Product still not listed.`, 'ALERT');
      await sendHourlyReminder(state);
      state.lastHourlyReminder = now.toISOString();
    } else {
      const nextReminderIn = Math.ceil((reminderIntervalMs - (now - lastReminder)) / 60000);
      log(`   Next reminder in ~${nextReminderIn} minute(s)`, 'INFO');
    }
  }

  saveState(state);
}

// ── Graceful Shutdown ──────────────────────────────────────────
process.on('SIGINT', () => {
  log('Shutting down...', 'INFO');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down...', 'INFO');
  process.exit(0);
});

// ── Entry Point ────────────────────────────────────────────────
runMonitor().catch((err) => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err);
  process.exit(1);
});
