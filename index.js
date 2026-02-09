// NO DOTENV NEEDED - Reads from process.env directly
const express = require('express');
const mineflayer = require('mineflayer');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 10000;

// CONFIGURATION
const PANEL_SECRET = process.env.PANEL_SECRET || 'default_secret';
const MC_EMAIL = process.env.MC_EMAIL || '';
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';

// Validation
if (!MC_EMAIL) {
  console.error('❌ ERROR: MC_EMAIL not set!');
  process.exit(1);
}

// Global State
let botState = {
  isAlive: false,
  username: 'Not Connected',
  startTime: Date.now(),
  stats: {
    health: 20,
    food: 20,
    pos: "0, 0, 0",
    money: 0,
    shards: 0,
    startMoney: 0,
    startShards: 0
  }
};

let currentBot = null;
let eventClients = [];

// Helper: SHA256 Hash
const getHash = (str) => CryptoJS.SHA256(str).toString();

// Webhook
async function sendWebhook(embed) {
  try {
    await axios.post(WEBHOOK_URL, { embeds: [embed] });
  } catch (error) {
    console.error('Webhook Error:', error.message);
  }
}

app.use(express.json());
app.use(express.static('public'));

// --- API ENDPOINTS ---

// Verify Password
app.post('/api/verify', (req, res) => {
  const valid = getHash(req.body.secret) === getHash(PANEL_SECRET);
  res.json({ valid });
});

// Send Chat/Command
app.post('/api/chat', (req, res) => {
  const { secret, message } = req.body;
  if (getHash(secret) !== getHash(PANEL_SECRET)) return res.status(403).json({ error: 'Invalid Secret' });
  
  if (currentBot && botState.isAlive) {
    currentBot.chat(message);
    res.json({ success: true });
  } else {
    res.status(503).json({ error: 'Bot offline' });
  }
});

// SSE Stream (Stats + Console)
app.get('/events', (req, res) => {
  const secret = req.query.secret; // Allow generic auth query if needed, or rely on frontend logic
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  eventClients.push(send);
  
  // Send initial state immediately
  send({ type: 'init', state: botState });
  
  req.on('close', () => eventClients = eventClients.filter(c => c !== send));
});

// --- BOT LOGIC ---

function startBot() {
  if (currentBot) currentBot.quit();

  console.log('🔄 Connecting to DonutSMP...');
  
  currentBot = mineflayer.createBot({
    host: 'donutsmp.net',
    port: 25565,
    username: MC_EMAIL,
    auth: 'microsoft',
    version: '1.20.2',
    hideErrors: false
  });

  currentBot.once('spawn', () => {
    // 1. FREEZE MOVEMENT
    currentBot.physics.enabled = false;
    
    botState.isAlive = true;
    botState.username = currentBot.username;
    botState.startTime = Date.now();
    
    console.log(`✅ Logged in as ${currentBot.username}`);
    
    sendWebhook({
      color: 0x57F287,
      title: '🟢 Bot Online',
      description: `**User:** ${currentBot.username}\n**Mode:** Passive (No Movement)`,
      timestamp: new Date().toISOString()
    });

    broadcast({ type: 'state', state: botState });
  });

  // 2. LIVE CONSOLE RELAY
  currentBot.on('messagestr', (message) => {
    if (!message.trim()) return;
    console.log(`[CHAT] ${message}`);
    
    // Send to web console
    broadcast({ type: 'console', line: message });

    // Webhook for alerts
    if (message.toLowerCase().includes('disconnect') || message.toLowerCase().includes('server restart')) {
      sendWebhook({ color: 0xED4245, description: `⚠️ **Alert:** ${message}` });
    }
  });

  // 3. STATS & SCOREBOARD PARSER
  currentBot.on('physicsTick', () => {
    // Update basic stats
    if (currentBot.entity) {
      botState.stats.health = Math.round(currentBot.health);
      botState.stats.food = Math.round(currentBot.food);
      const pos = currentBot.entity.position;
      botState.stats.pos = `${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
    }

    // Parse Scoreboard for Money/Shards (DonutSMP specific format)
    if (currentBot.scoreboards) {
      Object.values(currentBot.scoreboards).forEach(board => {
        if (!board.items) return;
        Object.values(board.items).forEach(item => {
          const text = item.displayName.toString().toLowerCase();
          // Regex to find numbers (strip commas)
          // Adjust these keywords if DonutSMP changes their sidebar text
          if (text.includes('money') || text.includes('$')) {
            const money = parseInt(text.replace(/[^0-9]/g, '')) || 0;
            botState.stats.money = money;
            if (botState.stats.startMoney === 0) botState.stats.startMoney = money;
          }
          if (text.includes('shards')) {
            const shards = parseInt(text.replace(/[^0-9]/g, '')) || 0;
            botState.stats.shards = shards;
            if (botState.stats.startShards === 0) botState.stats.startShards = shards;
          }
        });
      });
    }

    // Broadcast updates every 2 seconds roughly (to save bandwidth)
    if (Math.random() < 0.05) { 
      broadcast({ type: 'stats', data: botState.stats });
    }
  });

  currentBot.on('end', (reason) => {
    botState.isAlive = false;
    console.log(`❌ Disconnected: ${reason}`);
    broadcast({ type: 'state', state: botState });
    
    // Auto Reconnect
    setTimeout(startBot, 15000);
  });

  currentBot.on('error', (err) => console.log(`Error: ${err.message}`));
}

function broadcast(data) {
  eventClients.forEach(client => client(data));
}

app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  setTimeout(startBot, 3000);
});
      
