// --- Web Server for Render/Replit Keep-Alive ---
const express = require('express');
const app = express();
// Render uses port 10000 by default, Replit uses 3000
const PORT = process.env.PORT || 10000; 

app.get('/', (req, res) => {
  res.send('DonutSMP Bot is Online and Healthy!');
});

// Important: Bind to 0.0.0.0 for Render to detect the port
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server successfully listening on port ${PORT}`);
});

// --- Original script starts here ---
const mineflayer = require('mineflayer');
const readline = require('readline');
const mc = require('minecraft-protocol');
const https = require('https');
const url = require('url');

// Silence normal Mineflayer logs
const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// Suppress the "Chunk size" partial packet warning
const originalLog = console.log;
const originalWarn = console.warn;

const shouldFilter = function(...args) {
  const message = args.join(' ');
  return message.includes('Chunk size is') && message.includes('partial packet');
};

console.log = function(...args) {
  if (!shouldFilter(...args)) {
    originalLog.apply(console, args);
  }
};

console.warn = function(...args) {
  if (!shouldFilter(...args)) {
    originalWarn.apply(console, args);
  }
};

// Patch protocol to ignore partial packet warnings
mc.Client.prototype.emit = (function(originalEmit) {
  return function(event, data) {
    if (event === 'packet' && data && data.name === 'player_info') return;
    return originalEmit.apply(this, arguments);
  };
})(mc.Client.prototype.emit);

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';

function sendToDiscord(embed) {
  const payload = JSON.stringify({ embeds: [embed] });
  const urlObj = new url.URL(WEBHOOK_URL);
  const options = {
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      console.error(`Discord webhook error: ${res.statusCode}`);
    }
  });
  req.on('error', (err) => console.error('Failed to send to Discord:', err.message));
  req.write(payload);
  req.end();
}

function fetchPlayerStats(username) {
  return new Promise((resolve) => {
    const statsUrl = `https://api.donutsmp.net/v1/stats/${username}`;
    const urlObj = new url.URL(statsUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': process.env.DONUTSMP_API_TOKEN || ''
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const stats = JSON.parse(data);
          resolve(stats);
        } catch (err) {
          resolve(null);
        }
      });
    });
    req.on('error', (err) => resolve(null));
    req.end();
  });
}

function startBot() {
  const bot = mineflayer.createBot({
    host: 'donutsmp.net',
    port: 25565,
    username: process.env.MC_EMAIL,
    auth: 'microsoft',
    logger: noopLogger
  });

  let statusInterval;
  let playerUsername = '';
  const recentMessages = [];
  const scriptStartTime = Date.now();
  let previousStats = null;

  bot.once('spawn', () => {
    playerUsername = bot.username || bot.player?.name || process.env.MC_EMAIL?.split('@')[0];
    console.log(`✅ Connected to DonutSMP as ${playerUsername}`);
    
    statusInterval = setInterval(async () => {
      if (!bot.entity) return;
      
      const apiResponse = await fetchPlayerStats(playerUsername);
      const stats = apiResponse?.result || apiResponse || {};
      const isOnline = !!(bot.entity && bot.entity.position);
      const embedColor = isOnline ? 0x00ff00 : 0xff0000;
      
      const uptimeMs = Date.now() - scriptStartTime;
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      
      const fields = [
        { name: '👤 Player', value: playerUsername, inline: true },
        { name: isOnline ? '🟢 Status' : '🔴 Status', value: isOnline ? 'Online' : 'Offline', inline: true },
        { name: '⏰ Uptime', value: `${uptimeHours}h ${uptimeMinutes}m`, inline: true }
      ];
      
      // ... (Stats processing logic remains same) ...

      const embed = {
        title: `${isOnline?'🟢':'🔴'} ${bot.username}'s Statistics`,
        color: embedColor,
        thumbnail: { url:`https://mc-heads.net/avatar/${bot.username}/64.png` },
        fields: fields,
        footer: { text: 'DonutSMP Bot | Status Updates' },
        timestamp: new Date().toISOString()
      };
      sendToDiscord(embed);
    }, 60000);
  });

  bot.on('end', (reason) => {
    console.log(`❌ Disconnected: ${reason}`);
    if (statusInterval) clearInterval(statusInterval);
    setTimeout(startBot, 5000);
  });
}

startBot();
  
