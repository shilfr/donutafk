// --- Original script starts here ---
const mineflayer = require('mineflayer');
const readline = require('readline');
const mc = require('minecraft-protocol');
const https = require('https');
const url = require('url');

// Silence normal Mineflayer logs
const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// Suppress the "Chunk size" partial packet warning from both log and warn
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

  req.on('error', (err) => {
    console.error('Failed to send to Discord:', err.message);
  });

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
          console.log('API Response Status:', res.statusCode);
          console.log('API Stats fetched:', JSON.stringify(stats, null, 2));
          resolve(stats);
        } catch (err) {
          console.error('Failed to parse stats:', err.message);
          console.error('Raw response:', data);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('API request error:', err.message);
      resolve(null);
    });

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
    console.log('✅ Connected to DonutSMP');
    console.log('🟢 Live console → in-game chat enabled');
    console.log(`📝 Using username for API: ${playerUsername}`);
    
    statusInterval = setInterval(async () => {
      if (!bot.entity) return;
      
      const apiResponse = await fetchPlayerStats(playerUsername);
      const stats = apiResponse?.result || apiResponse || {};
      
      const isBotConnected = bot.entity && bot.entity.position;
      const isOnline = isBotConnected;
      const embedColor = isOnline ? 0x00ff00 : 0xff0000;
      
      const uptimeMs = Date.now() - scriptStartTime;
      const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
      const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const uptimeStr = uptimeDays > 0 
        ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`
        : `${uptimeHours}h ${uptimeMinutes}m`;
      
      const fields = [
        { name: '👤 Player', value: playerUsername, inline: true },
        { name: isOnline ? '🟢 Status' : '🔴 Status', value: isOnline ? 'Online' : 'Offline', inline: true },
        { name: '⏰ Uptime', value: uptimeStr, inline: true }
      ];
      
      if (stats && Object.keys(stats).length > 0) {
        const playtimeMs = parseInt(stats.playtime);
        const playtimeDays = Math.floor(playtimeMs / (1000 * 60 * 60 * 24));
        const playtimeHours = Math.floor((playtimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const playtimeStr = `${playtimeDays}d ${playtimeHours}h`;
        
        let moneyChange = '';
        let shardsChange = '';
        let playtimeChange = '';
        
        if (previousStats) {
          const moneyDiff = parseFloat(stats.money) - parseFloat(previousStats.money);
          if (moneyDiff !== 0) moneyChange = `\n(${moneyDiff > 0 ? '+' : ''}${(moneyDiff/1e6).toFixed(2)}M / 24h)`;
          
          const shardsDiff = parseFloat(stats.shards) - parseFloat(previousStats.shards);
          if (shardsDiff !== 0) shardsChange = `\n(${shardsDiff>0?'+':''}${(shardsDiff/1e3).toFixed(2)}K / 24h)`;
          
          const playtimeDiffMs = parseFloat(stats.playtime) - parseFloat(previousStats.playtime);
          if (playtimeDiffMs !== 0) {
            const playtimeDiffHours = Math.floor(playtimeDiffMs / (1000*60*60));
            const playtimeDiffMinutes = Math.floor((playtimeDiffMs % (1000*60*60))/(1000*60));
            playtimeChange = `\n(+${playtimeDiffHours}h ${playtimeDiffMinutes}m / 24h)`;
          }
        }
        previousStats = { ...stats };
        
        if (stats.money) fields.push({ name:'💰 Balance', value:`${(parseFloat(stats.money)/1e6).toFixed(2)}M${moneyChange}`, inline:true });
        if (stats.shards) fields.push({ name:'💎 Shards', value:`${(parseFloat(stats.shards)/1e3).toFixed(2)}K${shardsChange}`, inline:true });
        if (stats.playtime) fields.push({ name:'⏱️ Playtime', value:`${playtimeStr}${playtimeChange}`, inline:true });
      }
      
      const recentActivityStr = recentMessages.length>0 ? recentMessages.slice(-3).join('\n') : 'No activity yet';
      fields.push({ name:'💬 Recent Activity', value: recentActivityStr, inline:false });
      
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

  bot.on('chat', (username, message) => {
    const displayMsg = `[${username}] ${message}`;
    if (username !== bot.username) console.log(displayMsg);
    
    recentMessages.push(displayMsg);
    if (recentMessages.length>20) recentMessages.shift();
  });

  bot.on('end', (reason) => {
    console.log(`❌ Disconnected: ${reason}`);
    console.log('🔄 Reconnecting in 5 seconds...');
    if (statusInterval) clearInterval(statusInterval);
    setTimeout(startBot, 5000);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (input) => {
    if (!bot.entity) return;
    
    const cmdMsg = `[YOU] ${input}`;
    recentMessages.push(cmdMsg);
    if (recentMessages.length>20) recentMessages.shift();
    
    bot.chat(input);
    console.log(`→ ${input}`);
  });
}

startBot();
