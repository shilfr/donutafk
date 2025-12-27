// ==========================================
// 1. WEB CONTROL ROOM & 24/7 SERVER
// ==========================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// SECURITY: Your private URL password
const SECRET_KEY = "$2a$10$nF6aAokZD1gSVtf48826.O2yijAFd0DzQ.IBn5dtPQT4cIimyHZdS"; 

let chatHistory = []; // Stores last 10 messages for the web view

app.use(express.urlencoded({ extended: true }));

// The Mobile Control Room UI
app.get(`/${SECRET_KEY}`, (req, res) => {
    const chatHtml = chatHistory.map(m => `<div style="border-bottom:1px solid #444;padding:8px;font-size:14px;">${m}</div>`).join('');
    res.send(`
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Control Room</title>
            </head>
            <body style="background: #2c2f33; color: white; font-family: sans-serif; text-align: center; padding: 15px;">
                <h2 style="color: #7289da;">🎮 DonutSMP Control</h2>
                
                <div style="background: #23272a; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
                    <form action="/${SECRET_KEY}/send" method="POST">
                        <input type="text" name="cmd" placeholder="Type command (e.g. /spawn 1)" required 
                               style="padding: 12px; width: 100%; border-radius: 8px; border: none; font-size: 16px; margin-bottom: 10px; box-sizing: border-box;">
                        <button type="submit" 
                                style="padding: 12px; width: 100%; background: #57F287; color: black; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
                            Execute Command
                        </button>
                    </form>
                </div>

                <div style="background: #23272a; padding: 15px; border-radius: 12px; text-align: left; max-height: 250px; overflow-y: auto; box-shadow: inset 0 0 10px #000;">
                    <b style="color: #7289da; display: block; margin-bottom: 10px;">📜 Recent Chat History:</b>
                    <div style="color: #dcddde;">${chatHtml || 'Waiting for messages...'}</div>
                </div>
                
                <p style="font-size: 0.8em; color: #99aab5; margin-top: 15px;">🟢 Status: Connected | Refresh to update chat</p>
            </body>
        </html>
    `);
});

// Command Execution Logic
app.post(`/${SECRET_KEY}/send`, (req, res) => {
    if (global.botInstance) {
        global.botInstance.chat(req.body.cmd);
        res.send(`<script>alert("Command Sent!"); window.location.href="/${SECRET_KEY}";</script>`);
    } else {
        res.send("Bot is not ready yet.");
    }
});

app.get('/', (req, res) => res.send('Bot Status: 24/7 Active.'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web Server active on port ${PORT}`));

// ==========================================
// 2. BOT LOGIC & DISCORD RELAY
// ==========================================
const mineflayer = require('mineflayer');
const https = require('https');
const url = require('url');

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';
const API_KEY = '93b93228c9954e33989c0e1f049c4662';

let initialStats = null;
const scriptStartTime = Date.now();

// Formatter for Money/Shards
function formatNum(num, isMoney = false) {
    if (!num) return '0';
    const n = parseFloat(num);
    if (isMoney) return n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : `${(n/1e3).toFixed(1)}K`;
    return n >= 1e3 ? `${(n/1e3).toFixed(1)}k` : n.toString();
}

// Discord Webhook Function
function sendWebhook(payload) {
    const data = JSON.stringify(payload);
    const urlObj = new url.URL(WEBHOOK_URL);
    const req = https.request({
        hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    });
    req.on('error', (e) => console.error('Webhook Error:', e));
    req.write(data);
    req.end();
}

function startBot() {
    const bot = mineflayer.createBot({
        host: 'donutsmp.net',
        port: 25565,
        username: process.env.MC_EMAIL,
        auth: 'microsoft',
        version: '1.20.1'
    });

    global.botInstance = bot;
    let statsLoop;

    bot.once('spawn', () => {
        const ign = bot.username;
        console.log(`✅ [${ign}] In-game!`);
        sendWebhook({ embeds: [{ title: `🟢 Bot Online: ${ign}`, color: 0x57F287, timestamp: new Date() }] });

        // Stats tracking loop (Every 2 minutes)
        statsLoop = setInterval(() => {
            if (!bot.entity) return;
            
            https.get({
                hostname: 'api.donutsmp.net',
                path: `/v1/stats/${ign}`,
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            }, (res) => {
                let body = '';
                res.on('data', d => body += d);
                res.on('end', () => {
                    try {
                        const stats = JSON.parse(body).result || JSON.parse(body);
                        
                        // Session calculations
                        if (!initialStats) initialStats = { money: stats.money, shards: stats.shards };
                        const mGain = parseFloat(stats.money) - parseFloat(initialStats.money);
                        const sGain = parseFloat(stats.shards) - parseFloat(initialStats.shards);
                        const uptime = Date.now() - scriptStartTime;

                        sendWebhook({
                            embeds: [{
                                title: `📊 Live Stats: ${ign}`,
                                color: 0x3498DB,
                                fields: [
                                    { name: '👤 Player', value: `\`${ign}\``, inline: true },
                                    { name: '⏰ Uptime', value: `\`${Math.floor(uptime/3600000)}h ${Math.floor((uptime%3600000)/60000)}m\``, inline: true },
                                    { name: '💰 Money', value: `**$${formatNum(stats.money, true)}**\n\`+${formatNum(mGain, true)}/session\``, inline: true },
                                    { name: '💎 Shards', value: `**${formatNum(stats.shards)}**\n\`+${formatNum(sGain)}/session\``, inline: true },
                                    { name: '⌛ Playtime', value: `\`${Math.floor(stats.playtime/3600000)}h ${Math.floor((stats.playtime%3600000)/60000)}m\``, inline: true }
                                ],
                                timestamp: new Date()
                            }]
                        });
                    } catch (e) { console.log("API Error."); }
                });
            });
        }, 120000);
    });

    // Chat Relay (Game -> Web History & Discord)
    bot.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString().trim();
        if (msg.length > 1) {
            sendWebhook({ content: `💬 \`${msg}\`` });
            chatHistory.unshift(msg); // Add message to start of history
            if (chatHistory.length > 10) chatHistory.pop(); // Keep only last 10
        }
    });

    // Auto-Reconnect
    bot.on('end', (reason) => {
        console.log(`❌ Disconnected: ${reason}. Restarting...`);
        clearInterval(statsLoop);
        sendWebhook({ embeds: [{ title: `🔴 Bot Disconnected`, description: `Reason: ${reason}`, color: 0xED4245 }] });
        setTimeout(startBot, 15000);
    });

    bot.on('error', (err) => console.log('Bot Error:', err.message));
}

startBot();
                                     
