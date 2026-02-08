// ==========================================
// 1. 24/7 KEEP-ALIVE SERVER
// ==========================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('DonutSMP Live Tracker: 🟢 Active'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server running on port ${PORT}`));

// ==========================================
// 2. CONFIGURATION
// ==========================================
const mineflayer = require('mineflayer');
const https = require('https');
const url = require('url');

// YOUR DETAILS
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';
const API_KEY = '93b93228c9954e33989c0e1f049c4662';
const STATS_INTERVAL = 120000; // 2 Minutes
const CONTROLLER_NAME = "fx3r";

let initialStats = null;
const scriptStartTime = Date.now();

// ==========================================
// 3. UTILITY FUNCTIONS
// ==========================================
function formatNum(num, type = 'k') {
    if (!num) return '0';
    const n = parseFloat(num);
    if (type === 'money') {
        if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
    }
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return n.toString();
}

function formatTime(ms) {
    if (!ms) return '0m';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m`;
}
function sendWebhook(payload) {
    const data = JSON.stringify(payload);
    const urlObj = new url.URL(WEBHOOK_URL);
    const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Content-Length': Buffer.byteLength(data),
            'User-Agent': 'DonutSMP/1.0' // Added to prevent 403 errors
        }
    });
    req.on('error', (e) => console.error(`Webhook Error: ${e.message}`));
    req.write(data);
    req.end();
}

function fetchStats(username) {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.donutsmp.net',
            path: `/v1/stats/${username}`,
            method: 'GET',
            timeout: 5000,
            headers: { 
                'accept': 'application/json', 
                'Authorization': `Bearer ${API_KEY}`,
                'User-Agent': 'DonutSMP-Bot/1.0' // Added for API compliance
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ ok: true, data: JSON.parse(data) }); }
                catch { resolve({ ok: false, data: null }); }
            });
        });
        req.on('error', () => resolve({ ok: false, data: null }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, data: null }); });
        req.end();
    });
}

// ==========================================
// 4. MAIN BOT LOGIC
// ==========================================
function startBot() {
    // Clear initial stats on reconnect
    initialStats = null;
    const bot = mineflayer.createBot({
        host: 'donutsmp.net',
        port: 25565,
        username: process.env.MC_EMAIL,
        auth: 'microsoft',
        version: '1.20.2',
        hideErrors: false, // Changed to see actual errors
        checkTimeoutInterval: 60 * 1000, // Increased timeout
        connectTimeout: 30 * 1000 // Added explicit timeout
    });

    let loopInterval;
    let isAlive = false;

    // Handle successful login
    bot.once('login', () => {
        console.log(`🔑 Authenticated as ${bot.username}`);
    });

    // Handle world spawn (actual game entry)
    bot.once('spawn', () => {
        isAlive = true;
        const ign = bot.username;
        console.log(`✅ [${ign}] Joined DonutSMP!`);

        sendWebhook({
            embeds: [{
                title: `🟢 Live Tracking Started`,
                color: 0x57F287,
                description: `**Account:** ${ign}\n**Update Speed:** Every 2 mins`,
                footer: { text: 'Session Started' }
            }]
        });

        // --- STATS LOOP (Every 2 Minutes) ---
        loopInterval = setInterval(async () => {
            if (!isAlive || !bot.entity) return;

            const { ok, data } = await fetchStats(ign);
            const stats = data?.result || data || {};
            const available = ok;

            let moneyDiff = '+0';
            let shardsDiff = '+0';
            
            if (available) {
                if (!initialStats) initialStats = { money: stats.money, shards: stats.shards };
                const mGain = parseFloat(stats.money) - parseFloat(initialStats.money);
                const sGain = parseFloat(stats.shards) - parseFloat(initialStats.shards);                
                if (mGain !== 0) moneyDiff = `${mGain > 0 ? '+' : ''}${formatNum(mGain, 'money')}`;
                if (sGain !== 0) shardsDiff = `${sGain > 0 ? '+' : ''}${formatNum(sGain)}`;
            }

            const uptime = Date.now() - scriptStartTime;

            sendWebhook({
                embeds: [{
                    title: `📊 ${ign} Live Stats`,
                    color: available ? 0xFEE75C : 0xED4245,
                    fields: [
                        { name: '⏱️ Uptime', value: `\`${formatTime(uptime)}\``, inline: true },
                        { name: '📡 API', value: available ? '✅ OK' : '❌ Down', inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: '💵 Money', value: `**${formatNum(stats.money, 'money')}**\n\`${moneyDiff}/session\``, inline: true },
                        { name: '💎 Shards', value: `**${formatNum(stats.shards)}**\n\`${shardsDiff}/session\``, inline: true },
                        { name: '⌛ Playtime', value: `\`${formatTime(stats.playtime)}\``, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });
        }, STATS_INTERVAL);
    });

    // --- LIVE CHAT RELAY ---
    bot.on('messagestr', (message, messagePosition, jsonMsg) => { // Changed to messagestr
        if (!isAlive) return;
        
        // Filter out empty messages
        if (!message || message.trim().length === 0) return;
        
        // Skip whisper confirmations
        if (message.startsWith("You whispered")) return;

        sendWebhook({
            content: `💬 **[GAME]** \`${message}\``
        });
        
        console.log(`[CHAT] ${message}`);
    });

    // --- WHISPER CONTROLLER ---
    bot.on('whisper', (username, message) => {
        if (!isAlive) return;
        if (username === CONTROLLER_NAME) {
            if (message.startsWith('cmd ')) {
                const command = message.replace('cmd ', '');
                bot.chat(command);
                bot.whisper(username, `✅ Executed: ${command}`);            }
        }
    });

    // --- DISCONNECT HANDLING ---
    function handleDisconnect(reason) {
        isAlive = false;
        if (loopInterval) clearInterval(loopInterval);
        
        console.log(`❌ Disconnected: ${reason || 'Unknown reason'}`);
        
        sendWebhook({
            embeds: [{
                title: `🔴 Bot Disconnected`,
                color: 0xED4245,
                description: `Reason: ${reason || 'Connection lost'}\nReconnecting in 15s...`
            }]
        });

        // Ensure clean bot destruction
        bot.removeAllListeners();
        bot.end?.();

        setTimeout(startBot, 15000);
    }

    bot.on('end', handleDisconnect);
    bot.on('error', (err) => {
        console.error(`💥 Bot Error: ${err.message}`);
        if (err.message.includes('ECONNRESET') || err.message.includes('socket hang up')) {
            handleDisconnect('Network error');
        }
    });
    
    // Handle unexpected crashes
    bot.on('kicked', (reason) => handleDisconnect(`Kicked: ${reason}`));
}

startBot();
