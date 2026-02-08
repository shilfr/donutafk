// NO DOTENV NEEDED - Reads from process.env directly
const express = require('express');
const mineflayer = require('mineflayer');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 10000;

// READ FROM ENVIRONMENT (Must be set in Render)
const PANEL_SECRET = process.env.PANEL_SECRET || 'default_secret';
const MC_EMAIL = process.env.MC_EMAIL || '';
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';
const CONTROLLER_NAME = "fx3r";

// Validate required environment variables
if (!MC_EMAIL) {
  console.error('❌ ERROR: MC_EMAIL not set in environment variables!');
  console.error('   Please set MC_EMAIL in Render dashboard');
  process.exit(1);
}

if (!PANEL_SECRET || PANEL_SECRET === 'default_secret') {
  console.error('❌ ERROR: PANEL_SECRET not set or using default!');
  console.error('   Please set PANEL_SECRET in Render dashboard');
  process.exit(1);
}

// Webhook function (with error handling)
async function sendWebhook(embed) {
  if (!WEBHOOK_URL) return;
  try {
    await axios.post(WEBHOOK_URL, { embeds: [embed] }, { timeout: 5000 });
  } catch (error) {
    console.error('Webhook failed:', error.message);
  }
}

// Express setup
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/', (req, res) => {
  res.send(botState.isAlive ? '🟢 Bot Online' : '🔴 Bot Offline');
});

// Panel authentication
app.post('/api/verify', (req, res) => {
  const hash = CryptoJS.SHA256(req.body.secret).toString();  const expectedHash = CryptoJS.SHA256(PANEL_SECRET).toString();
  res.json({ valid: hash === expectedHash });
});

// Bot state
let botState = {
  isAlive: false,
  username: 'Not Connected',
  lastEvent: 'Starting...',
  uptime: '0m'
};

let currentBot = null;
let eventClients = [];

// SSE for panel
app.get('/events', (req, res) => {
  const providedHash = req.headers['x-panel-secret'];
  const expectedHash = CryptoJS.SHA256(PANEL_SECRET).toString();
  
  if (providedHash !== expectedHash) {
    res.status(403).end();
    return;
  }
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // Client disconnected
      eventClients = eventClients.filter(client => client !== sendEvent);
    }
  };
  
  eventClients.push(sendEvent);
  sendEvent({ type: 'init', state: botState });
  
  req.on('close', () => {
    eventClients = eventClients.filter(client => client !== sendEvent);
  });
});

// Bot creation function
function startBot() {
  // Clean up previous bot
  if (currentBot) {    currentBot.removeAllListeners();
    currentBot.end?.();
  }
  
  console.log('🔄 Starting bot connection...');
  
  currentBot = mineflayer.createBot({
    host: 'donutsmp.net',
    port: 25565,
    username: MC_EMAIL,
    auth: 'microsoft',
    version: '1.20.2',
    hideErrors: false,
    connectTimeout: 30000,
    checkTimeoutInterval: 60000
  });

  // Track connection flow
  currentBot.once('login', () => {
    console.log('🔑 Authentication successful');
  });

  currentBot.once('spawn', () => {
    botState.isAlive = true;
    botState.username = currentBot.username;
    botState.lastEvent = 'Successfully joined game';
    botState.uptime = 'Just started';
    
    console.log(`✅ JOINED GAME as ${currentBot.username}`);
    
    // Send verification webhook
    sendWebhook({
      color: 0x57F287,
      title: '🟢 BOT ONLINE',
      description: `**Account:** ${currentBot.username}\n**Server:** donutsmp.net\n**Status:** Verified in-game`,
      timestamp: new Date().toISOString()
    });
    
    // Broadcast to panel
    eventClients.forEach(client => client({ type: 'state', data: botState }));
  });

  // Chat relay
  currentBot.on('messagestr', (message) => {
    if (!message.trim()) return;
    console.log(`[CHAT] ${message}`);
    
    // Relay important messages
    if (message.toLowerCase().includes('disconnect') || 
        message.toLowerCase().includes('error')) {      sendWebhook({
        color: 0xED4245,
        title: '⚠️ Game Alert',
        description: `\`${message}\``,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Disconnect handling
  currentBot.on('end', (reason) => {
    botState.isAlive = false;
    botState.lastEvent = `Disconnected: ${reason || 'Unknown'}`;
    
    console.error(`❌ DISCONNECTED: ${reason || 'No reason'}`);
    
    sendWebhook({
      color: 0xED4245,
      title: '🔴 BOT DISCONNECTED',
      description: `**Reason:** ${reason || 'Connection lost'}\n**Reconnecting...**`,
      timestamp: new Date().toISOString()
    });
    
    eventClients.forEach(client => client({ type: 'state', data: botState }));
    
    // Reconnect after delay
    setTimeout(startBot, 15000);
  });

  currentBot.on('error', (err) => {
    console.error(`💥 BOT ERROR: ${err.message}`);
    // Let 'end' event handle reconnection
  });
}

// Start everything
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🔒 Panel requires secret: ${PANEL_SECRET.substring(0, 3)}...`);
  
  // Wait 2 seconds then start bot
  setTimeout(() => {
    startBot();
  }, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  if (currentBot) {
    currentBot.end?.();  }
  process.exit(0);
});
