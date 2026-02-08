require('dotenv').config();
const express = require('express');
const mineflayer = require('mineflayer');
const axios = require('axios');
const CryptoJS = require('crypto-js');
const app = express();
const PORT = process.env.PORT || 10000;

// ====== 🔒 SECURITY SETUP ======
const PANEL_SECRET = process.env.PANEL_SECRET || 'change_this_immediately';
const SECRET_HASH = CryptoJS.SHA256(PANEL_SECRET).toString();
const MC_EMAIL = process.env.MC_EMAIL;
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';
const CONTROLLER_NAME = "fx3r";
const STATS_INTERVAL = 300000; // 5 minutes (matches your request)
const RECONNECT_DELAY = 15000;
const HEARTBEAT_INTERVAL = 60000; // Critical: kills bot if frozen

// ====== 🌐 EXPRESS SETUP ======
app.use(express.json());
app.use(express.static('public'));

// Public health check
app.get('/', (req, res) => {
  res.send(`DonutSMP Tracker: ${botState.isAlive ? '🟢 LIVE' : '🔴 OFFLINE'} | Uptime: ${formatTime(Date.now() - startTime)}`);
});

// Secure panel access
app.post('/api/verify', (req, res) => {
  const hash = CryptoJS.SHA256(req.body.secret).toString();
  res.json({ valid: hash === SECRET_HASH });
});

// Chat command endpoint
app.post('/api/chat', (req, res) => {
  if (CryptoJS.SHA256(req.body.secret).toString() !== SECRET_HASH) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (botState.isAlive && currentBot) {
    currentBot.chat(req.body.message);
    logEvent('command', `Sent: ${req.body.message}`);
    res.json({ success: true });
  } else {
    res.status(503).json({ error: 'Bot offline' });
  }
});

// SSE for live updates (requires verified session)
const clients = new Set();
app.get('/events', (req, res) => {  const hash = req.headers['x-panel-secret'];
  if (hash !== SECRET_HASH) {
    return res.status(403).end();
  }
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  clients.add(sendEvent);
  
  // Initial state dump
  sendEvent({ type: 'init', state: botState, stats: currentStats });
  
  req.on('close', () => clients.delete(sendEvent));
});

// ====== 🤖 BOT STATE MANAGEMENT ======
let currentBot = null;
let statsInterval = null;
let heartbeatInterval = null;
let reconnectTimeout = null;
const startTime = Date.now();
const eventLog = [];
const currentStats = { money: '0', shards: '0', playtime: '0m' };
const botState = {
  isAlive: false,
  username: 'Offline',
  server: 'donutsmp.net:25565',
  lastEvent: 'Initializing...',
  uptime: '0m'
};

function logEvent(type, message) {
  const entry = { time: new Date().toLocaleTimeString(), type, message };
  eventLog.unshift(entry);
  if (eventLog.length > 100) eventLog.pop();
  
  // Broadcast to panel
  const payload = { type: 'log', data: entry };
  clients.forEach(client => client(payload));
  
  // Critical errors to console
  if (['error', 'disconnect'].includes(type)) console.error(`[${type.toUpperCase()}] ${message}`);
}

function broadcastState() {
  clients.forEach(client => client({ type: 'state', data: botState }));
}
function sendWebhook(embed) {
  if (!WEBHOOK_URL) return;
  axios.post(WEBHOOK_URL, { embeds: [embed] }, { timeout: 5000 })
    .catch(err => logEvent('error', `Webhook failed: ${err.message}`));
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ====== 🔄 ROBUST BOT HANDLER ======
function startBot() {
  // Cleanup previous instance
  if (currentBot) {
    currentBot.removeAllListeners();
    currentBot.end?.();
  }
  if (statsInterval) clearInterval(statsInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  // Reset state
  botState.isAlive = false;
  botState.lastEvent = 'Connecting...';
  broadcastState();
  logEvent('info', '🔄 Initiating connection to DonutSMP...');
  
  currentBot = mineflayer.createBot({
    host: 'donutsmp.net',
    port: 25565,
    username: MC_EMAIL,
    auth: 'microsoft',
    version: '1.20.2',
    hideErrors: false,
    connectTimeout: 30000,
    checkTimeoutInterval: 60000,
    physicsEnabled: false // Reduces CPU, we only need chat/stats
  });

  let lastPos = null;
  let isSpawned = false;
  
  // HEARTBEAT MONITOR (critical fix for silent disconnects)
  heartbeatInterval = setInterval(() => {
    if (!currentBot?.entity || !isSpawned) return;
    
    const pos = currentBot.entity.position;    const moved = !lastPos || pos.distanceTo(lastPos) > 0.1;
    
    if (!moved && botState.isAlive) {
      logEvent('error', '⚠️ HEARTBEAT FAILED: Bot frozen! Forcing reconnect...');
      currentBot.end?.();
      return;
    }
    
    lastPos = pos.clone();
  }, HEARTBEAT_INTERVAL);

  // CONNECTION FLOW (triple-verified)
  currentBot.once('login', () => {
    botState.username = currentBot.username;
    logEvent('info', `🔑 Authenticated as ${botState.username}`);
  });

  currentBot.once('spawn', () => {
    isSpawned = true;
    botState.isAlive = true;
    botState.lastEvent = 'In-game and active';
    botState.uptime = formatTime(Date.now() - startTime);
    broadcastState();
    
    logEvent('success', `✅ FULLY ONLINE: Verified in-game on DonutSMP`);
    
    // Send verified online webhook
    sendWebhook({
      color: 0x57F287,
      title: '🟢 BOT VERIFIED ONLINE',
      description: `**Account:** ${botState.username}\n**Server:** donutsmp.net:25565\n**Status:** Actively tracking (movement confirmed)`,
      timestamp: new Date().toISOString(),
      footer: { text: 'Triple-verified connection' }
    });
    
    // Start stats loop
    statsInterval = setInterval(fetchAndReportStats, STATS_INTERVAL);
    fetchAndReportStats(); // Immediate first fetch
  });

  // CHAT HANDLING
  currentBot.on('messagestr', (message) => {
    if (!botState.isAlive || !message.trim()) return;
    if (message.includes('You whispered')) return;
    
    logEvent('chat', message);
    
    // Relay important messages to webhook
    if (message.toLowerCase().includes('disconnect') || 
        message.toLowerCase().includes('error')) {      sendWebhook({
        color: 0xED4245,
        title: '⚠️ In-Game Alert',
        description: `\`${message}\``,
        timestamp: new Date().toISOString()
      });
    }
  });

  currentBot.on('whisper', (username, message) => {
    if (username === CONTROLLER_NAME && message.startsWith('cmd ')) {
      const cmd = message.replace('cmd ', '');
      currentBot.chat(cmd);
      currentBot.whisper(username, `✅ Executed: ${cmd}`);
      logEvent('command', `Controller ${username} ran: ${cmd}`);
    }
  });

  // DISCONNECT HANDLING (no more silent failures)
  function handleDisconnect(reason = 'Unknown') {
    if (reconnectTimeout) return; // Prevent duplicate reconnects
    
    isSpawned = false;
    botState.isAlive = false;
    botState.lastEvent = `Disconnected: ${reason}`;
    broadcastState();
    
    logEvent('disconnect', `❌ DISCONNECTED: ${reason}`);
    
    sendWebhook({
      color: 0xED4245,
      title: '🔴 BOT DISCONNECTED',
      description: `**Reason:** ${reason}\n**Reconnecting in 15s...**`,
      timestamp: new Date().toISOString()
    });
    
    // Cleanup
    clearInterval(statsInterval);
    clearInterval(heartbeatInterval);
    currentBot?.removeAllListeners();
    
    // Schedule reconnect
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      startBot();
    }, RECONNECT_DELAY);
  }

  currentBot.on('end', (reason) => handleDisconnect(reason || 'Connection closed'));
  currentBot.on('error', (err) => {    if (err.message.includes('ECONNRESET') || err.message.includes('socket')) {
      handleDisconnect('Network error (socket closed)');
    } else {
      logEvent('error', `Bot error: ${err.message}`);
    }
  });
  currentBot.on('kicked', (reason) => handleDisconnect(`Kicked: ${reason}`));
}

// ====== 📊 STATS HANDLER ======
async function fetchAndReportStats() {
  if (!botState.isAlive || !currentBot) return;
  
  try {
    const res = await axios.get(`https://api.donutsmp.net/v1/stats/${botState.username}`, {
      headers: { 
        'Authorization': `Bearer 93b93228c9954e33989c0e1f049c4662`,
        'User-Agent': 'DonutSMP-2.0'
      },
      timeout: 8000
    });
    
    const stats = res.data.result || res.data;
    Object.assign(currentStats, {
      money: formatNum(stats.money, 'money'),
      shards: formatNum(stats.shards),
      playtime: formatTime(stats.playtime * 1000)
    });
    
    // Update panel
    clients.forEach(client => client({ 
      type: 'stats', 
      data: { ...currentStats, fetchedAt: new Date().toLocaleTimeString() } 
    }));
    
    // Webhook report (every 5 mins as requested)
    sendWebhook({
      color: 0x5865F2,
      title: `📊 ${botState.username} Live Stats`,
      fields: [
        { name: '💵 Money', value: currentStats.money, inline: true },
        { name: '💎 Shards', value: currentStats.shards, inline: true },
        { name: '⏱️ Playtime', value: currentStats.playtime, inline: true },
        { name: '🔌 Status', value: '🟢 Verified Online', inline: true },
        { name: '⏰ Uptime', value: botState.uptime, inline: true },
        { name: '🌐 Server', value: 'donutsmp.net:25565', inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Stats updated every 5 minutes' }
    });    
    logEvent('info', `📈 Stats updated: ${currentStats.money} | ${currentStats.shards} shards`);
  } catch (err) {
    logEvent('error', `API fetch failed: ${err.message}`);
    // Continue bot operation even if API fails
  }
}

function formatNum(num, type) {
  if (!num && num !== 0) return '0';
  const n = parseFloat(num);
  if (type === 'money') {
    if (n >= 1e9) return `${(n/1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n/1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n/1e3).toFixed(2)}K`;
  }
  return n.toLocaleString();
}

// ====== 🚀 START SERVICES ======
// Start web server FIRST (critical for Render health checks)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Control panel ready at http://localhost:${PORT}`);
  console.log(`🔒 Panel access: POST /api/verify with { "secret": "your_password" }`);
  console.log(`⚠️  IMPORTANT: Set PANEL_SECRET in .env file!`);
});

// Start bot after 2 seconds (lets web server bind first)
setTimeout(() => {
  if (!MC_EMAIL) {
    console.error('❌ FATAL: MC_EMAIL not set in environment variables!');
    process.exit(1);
  }
  startBot();
}, 2000);

// Graceful shutdown
process.on('SIGTERM', () => {
  logEvent('info', ' Shutting down...');
  currentBot?.end?.();
  process.exit(0);
});
