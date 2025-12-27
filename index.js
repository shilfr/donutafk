// ==========================================
// 1. ADVANCED CONTROL PANEL (AIO + SESSION)
// ==========================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = "ConsulOfNATO"; 

let chatHistory = [];
let lastCommand = "None";
let lastStats = { money: "0", shards: "0.00" };
const scriptStartTime = Date.now(); // Starts the session timer

app.use(express.urlencoded({ extended: true }));

// Helper to calculate session time
function getSessionTime() {
    const uptimeMs = Date.now() - scriptStartTime;
    const h = Math.floor(uptimeMs / 3600000);
    const m = Math.floor((uptimeMs % 3600000) / 60000);
    return `${h}h ${m}m`;
}

app.get(`/${SECRET_KEY}`, (req, res) => {
    const chatHtml = chatHistory.map(m => `<div style="border-bottom:1px solid #333;padding:8px;font-size:13px;color:#ccc;word-break:break-all;">${m}</div>`).join('');
    
    res.send(`
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Donut AIO Panel</title>
                <style>
                    body { background: #0f0f11; color: #e1e1e1; font-family: -apple-system, sans-serif; margin: 0; padding: 15px; }
                    .card { background: #1c1c1f; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #2d2d31; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
                    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .stat-box { background: #121214; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #333; }
                    .stat-label { font-size: 0.7em; color: #7289da; text-transform: uppercase; font-weight: bold; }
                    .stat-value { font-size: 1.1em; font-weight: bold; margin-top: 5px; }
                    input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #000; color: #fff; box-sizing: border-box; font-size: 16px; margin-bottom: 10px; }
                    .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; }
                    .btn-cmd { background: #57F287; color: #000; }
                    .btn-util { background: #3498db; color: #fff; margin-bottom: 8px; }
                    #chat-box { height: 200px; overflow-y: auto; background: #000; padding: 10px; border-radius: 8px; border: 1px solid #333; margin-top: 10px; }
                    h3 { margin: 0 0 10px 0; font-size: 0.9em; color: #7289da; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <h2 style="text-align:center; color:#fff; margin-bottom:20px;">🍩 Donut AIO</h2>
                
                <div class="card">
                    <div class="stats-grid">
                        <div class="stat-box"><div class="stat-label">Money</div><div class="stat-value">$${lastStats.money}</div></div>
                        <div class="stat-box"><div class="stat-label">Shards</div><div class="stat-value">${lastStats.shards}</div></div>
                        <div class="stat-box"><div class="stat-label">Session</div><div class="stat-value">${getSessionTime()}</div></div>
                        <div class="stat-box"><div class="stat-label">Last Cmd</div><div style="font-size:0.8em; margin-top:5px; color:#aaa;">${lastCommand}</div></div>
                    </div>
                </div>

                <div class="card">
                    <h3>🎮 Remote Console</h3>
                    <form action="/send-cmd" method="POST">
                        <input type="hidden" name="key" value="${SECRET_KEY}">
                        <input type="text" name="cmd" placeholder="e.g. /spawn 1" required>
                        <button class="btn btn-cmd">Execute Command</button>
                    </form>
                </div>

                <div class="card">
                    <h3>🛠️ Intelligence Tools</h3>
                    <button class="btn btn-util" onclick="location.href='/${SECRET_KEY}/tab'">👥 Scan Tab List</button>
                    <button class="btn btn-util" onclick="location.href='/${SECRET_KEY}/describe'">👁️ Describe Scene</button>
                    <button class="btn" style="background:#444; color:white;" onclick="location.reload()">🔄 Refresh Stats</button>
                </div>

                <div class="card">
                    <h3>📜 Live Game Logs</h3>
                    <div id="chat-box">${chatHtml || 'Awaiting messages...'}</div>
                </div>
            </body>
        </html>
    `);
});

// --- COMMAND & TOOL HANDLERS ---
app.post('/send-cmd', (req, res) => {
    if (req.body.key === SECRET_KEY && global.botInstance) {
        const command = req.body.cmd;
        global.botInstance.chat(command);
        lastCommand = command.length > 15 ? command.substring(0, 12) + "..." : command;
        res.send(`<script>alert("Sent!"); window.location.href="/${SECRET_KEY}";</script>`);
    } else { res.status(403).send("Bot Offline"); }
});

app.get(`/${SECRET_KEY}/tab`, (req, res) => {
    if (!global.botInstance) return res.send("Bot offline");
    const players = Object.keys(global.botInstance.players).join(', ');
    sendWebhook({ content: `👥 **Tab List (${Object.keys(global.botInstance.players).length}):** \`${players}\`` });
    res.send(`<script>alert("Sent to Discord!"); window.location.href="/${SECRET_KEY}";</script>`);
});

app.get(`/${SECRET_KEY}/describe`, (req, res) => {
    if (!global.botInstance) return res.send("Bot offline");
    const pos = global.botInstance.entity.position;
    const nearby = Object.values(global.botInstance.entities)
        .filter(e => e.type !== 'player' && e.position.distanceTo(pos) < 15)
        .map(e => e.name || e.type).slice(0, 5).join(', ');
    const desc = `👁️ **Scene Report**: X:${Math.round(pos.x)} Y:${Math.round(pos.y)} Z:${Math.round(pos.z)} | Nearby: ${nearby || 'Clear'}`;
    sendWebhook({ content: desc });
    res.send(`<script>alert("${desc}"); window.location.href="/${SECRET_KEY}";</script>`);
});

app.get('/', (req, res) => res.send('Unauthorized.'));
app.listen(PORT, '0.0.0.0');

// ==========================================
// 2. MINECRAFT BOT (AIO CORE)
// ==========================================
const mineflayer = require('mineflayer');
const https = require('https');
const url = require('url');

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1437378357607010345/K7lAfe1rc2kWNVBUPkACIiensPEQYw023YgEQu9MQv9RTLWpZhWKQQt1lhQbRYbskNja';
const API_KEY = '93b93228c9954e33989c0e1f049c4662';

function formatNum(num, type) {
    if (!num) return '0';
    const n = parseFloat(num);
    if (type === 'money') return n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : `${(n/1e3).toFixed(1)}K`;
    if (type === 'shard') return n >= 1e3 ? `${(n/1e3).toFixed(2)}k` : n.toFixed(2);
    return n.toString();
}

function sendWebhook(payload) {
    const data = JSON.stringify(payload);
    const urlObj = new url.URL(WEBHOOK_URL);
    const req = https.request({
        hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    });
    req.write(data);
    req.end();
}

function startBot() {
    const bot = mineflayer.createBot({
        host: 'donutsmp.net', port: 25565,
        username: process.env.MC_EMAIL, auth: 'microsoft', version: '1.20.1'
    });

    global.botInstance = bot;

    bot.once('spawn', () => {
        sendWebhook({ embeds: [{ title: `🟢 AIO Bot Joined: ${bot.username}`, color: 0x57F287 }] });

        setInterval(() => {
            if (!bot.entity) return;
            https.get({
                hostname: 'api.donutsmp.net', path: `/v1/stats/${bot.username}`,
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            }, (res) => {
                let body = '';
                res.on('data', d => body += d);
                res.on('end', () => {
                    try {
                        const stats = JSON.parse(body).result || JSON.parse(body);
                        lastStats.money = formatNum(stats.money, 'money');
                        lastStats.shards = formatNum(stats.shards, 'shard');
                        
                        sendWebhook({
                            embeds: [{
                                title: `📊 Live Status: ${bot.username}`,
                                color: 0x3498DB,
                                fields: [
                                    { name: '💰 Money', value: `**$${lastStats.money}**`, inline: true },
                                    { name: '💎 Shards', value: `**${lastStats.shards}**`, inline: true },
                                    { name: '⌛ Session', value: `\`${getSessionTime()}\``, inline: true }
                                ],
                                timestamp: new Date()
                            }]
                        });
                    } catch (e) {}
                });
            });
        }, 120000);
    });

    bot.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString().trim();
        if (msg.length > 1) {
            chatHistory.unshift(msg);
            if (chatHistory.length > 20) chatHistory.pop();
            
            // Whisper detection with Alert
            let content = `💬 \`${msg}\``;
            if (msg.toLowerCase().includes('whisper') || msg.includes('-> me') || msg.includes('-> You')) {
                content = `🚨 **WHISPER:** \`${msg}\``;
            }
            sendWebhook({ content: content });
        }
    });

    bot.on('end', () => setTimeout(startBot, 15000));
}

startBot();
    
