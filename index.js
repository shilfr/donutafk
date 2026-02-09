// NO DOTENV NEEDED - Reads from process.env directly
const express = require('express');
const mineflayer = require('mineflayer');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 10000;

// READ FROM ENVIRONMENT
const PANEL_SECRET = process.env.PANEL_SECRET || 'default_secret';
const MC_EMAIL = process.env.MC_EMAIL || '';
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';

// Validation
if (!MC_EMAIL) {
  console.error('❌ ERROR: MC_EMAIL not set!');
  process.exit(1);
}

// Webhook function
async function sendWebhook(embed) {
  try {
    await axios.post(WEBHOOK_URL, { embeds: [embed] }, { timeout: 5000 });
  } catch (error) {
    console.error('Webhook failed:', error.message);
  }
}

app.use(express.json());
app.use(express.static('public'));

// Bot state (Enhanced to support stats)
let botState = {
  isAlive: false,
  username: 'Not Connected',
  lastEvent: 'Starting...',
  uptime: '0m',
  stats: { health: 20, food: 20, pos: "0, 0, 0" }
};

let currentBot = null;
let eventClients = [];

// Panel authentication (Fixed hashing comparison)
app.post('/api/verify', (req, res) => {
  const hash = CryptoJS.SHA256(req.body.secret).toString();
  const expectedHash = CryptoJS.SHA256(PANEL_SECRET).toString();
  res.json({ valid: hash === expectedHash });
});

// SSE for panel
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      eventClients = eventClients.filter(client => client !== sendEvent);
    }
  };
  
  eventClients.push(sendEvent);
  sendEvent({ type: 'init', state: botState });
  
  req.on('close', () => {
    eventClients = eventClients.filter(client => client !== sendEvent);
  });
});

function startBot() {
  if (currentBot) {
    currentBot.removeAllListeners();
    currentBot.end();
  }
  
  console.log('🔄 Starting bot connection...');
  
  currentBot = mineflayer.createBot({
    host: 'donutsmp.net',
    port: 25565,
    username: MC_EMAIL,
    auth: 'microsoft',
    version: '1.20.2'
  });

  currentBot.once('spawn', () => {
    // FIX: DISABLE MOVEMENTS & PHYSICS
    currentBot.physics.enabled = false; 
    
    botState.isAlive = true;
    botState.username = currentBot.username;
    botState.lastEvent = 'Successfully joined game';
    
    console.log(`✅ JOINED GAME as ${currentBot.username}`);
    
    sendWebhook({
      color: 0x57F287,
      title: '🟢 BOT ONLINE',
      description: `**Account:** ${currentBot.username}\n**Status:** Verified in-game`,
      timestamp: new Date().toISOString()
    });
    
    eventClients.forEach(client => client({ type: 'state', data: botState }));
  });

  // FIX: API STAT FETCHING
  currentBot.on('health', () => {
    botState.stats = {
      health: Math.round(currentBot.health),
      food: Math.round(currentBot.food),
      pos: `${Math.round(currentBot.entity.position.x)}, ${Math.round(currentBot.entity.position.y)}, ${Math.round(currentBot.entity.position.z)}`
    };
    // Broadcast stats update to website
    eventClients.forEach(client => client({ type: 'stats', data: botState.stats }));
  });

  currentBot.on('messagestr', (message) => {
    if (!message.trim()) return;
    console.log(`[CHAT] ${message}`);
    
    if (message.toLowerCase().includes('disconnect')) {
      sendWebhook({
        color: 0xED4245,
        title: '⚠️ Game Alert',
        description: `\`${message}\``,
        timestamp: new Date().toISOString()
      });
    }
  });

  currentBot.on('end', (reason) => {
    botState.isAlive = false;
    botState.lastEvent = `Disconnected: ${reason}`;
    sendWebhook({
      color: 0xED4245,
      title: '🔴 BOT DISCONNECTED',
      description: `**Reason:** ${reason}\n**Reconnecting...**`,
      timestamp: new Date().toISOString()
    });
    eventClients.forEach(client => client({ type: 'state', data: botState }));
    setTimeout(startBot, 15000);
  });

  currentBot.on('error', (err) => console.error(`💥 BOT ERROR: ${err.message}`));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running on port ${PORT}`);
  setTimeout(startBot, 2000);
});
      
