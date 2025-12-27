const express = require('express');
const mineflayer = require('mineflayer');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 10000;

// MASTER CONFIG
const ADMIN_KEY = "ConsulOfNATO"; 
const activeBots = {}; // Memory storage for { bot, logs, stats, config, status }

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UI_STYLE = `
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0f0f11; color: #e1e1e1; font-family: -apple-system, sans-serif; padding: 15px; margin: 0; }
        .card { background: #1c1c1f; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #2d2d31; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-box { background: #121214; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #333; position: relative; }
        .stat-label { font-size: 0.7em; color: #7289da; font-weight: bold; text-transform: uppercase; }
        .stat-value { font-size: 1.1em; font-weight: bold; margin-top: 5px; }
        .status-dot { height: 10px; width: 10px; border-radius: 50%; display: inline-block; margin-right: 5px; }
        .online { background-color: #57F287; }
        .offline { background-color: #ed4245; }
        #terminal { background: #000; height: 250px; overflow-y: auto; padding: 10px; border-radius: 8px; border: 1px solid #333; color: #0f0; font-family: monospace; font-size: 11px; line-height: 1.4; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #000; color: #fff; box-sizing: border-box; margin-bottom: 10px; font-size: 16px; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; font-size: 14px; }
        .btn-green { background: #57F287; color: #000; }
        .btn-red { background: #ed4245; color: #fff; margin-top: 10px; }
        .btn-blue { background: #3498db; color: #fff; }
    </style>
`;

// ==========================================
// 1. PUBLIC LANDING & ADMIN OVERLORD
// ==========================================

app.get('/', (req, res) => {
    res.send(`<html><head>${UI_STYLE}</head><body><h2 style="text-align:center;">🍩 Donut Cloud Panel</h2><div class="card"><h3>🚀 Launch New Bot</h3><form action="/launch" method="POST"><input type="text" name="ign" placeholder="Minecraft Username" required><input type="text" name="server" value="donutsmp.net" required><input type="text" name="secret" placeholder="Create Private Secret Key" required><button class="btn btn-green">Start Session</button></form></div></body></html>`);
});

app.get(`/${ADMIN_KEY}`, (req, res) => {
    const botCount = Object.keys(activeBots).length;
    const userList = Object.keys(activeBots).map(k => `
        <div class="stat-box" style="text-align:left; margin-bottom:5px;">
            <span class="status-dot ${activeBots[k].status}"></span>
            <b>${activeBots[k].config.ign}</b> 
            <small style="float:right; color:#555;">Key: ${k}</small>
        </div>
    `).join('');
    res.send(`
        <html><head>${UI_STYLE}</head><body>
            <h2>👑 Admin Overlord</h2>
            <div class="stat-grid">
                <div class="stat-box"><div class="stat-label">Active Bots</div><div class="stat-value">${botCount}</div></div>
                <div class="stat-box"><div class="stat-label">Server RAM</div><div class="stat-value">${botCount * 75}MB / 512MB</div></div>
            </div>
            <div class="card">
                <h3>📢 Global Broadcast</h3>
                <form action="/admin-broadcast" method="POST">
                    <input type="text" name="msg" placeholder="Message to all bots..." required>
                    <button class="btn btn-blue">Send to Everyone</button>
                </form>
            </div>
            <div class="card"><h3>👤 Active Sessions</h3>${userList || 'No sessions.'}</div>
        </body></html>
    `);
});

// ==========================================
// 2. LIVE SSE STREAMING
// ==========================================

app.get('/stream/:secret', (req, res) => {
    const session = activeBots[req.params.secret];
    if (!session) return res.end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = () => {
        if (!activeBots[req.params.secret]) return res.end();
        res.write(`data: ${JSON.stringify({ stats: session.stats, logs: session.logs.slice(0, 20), status: session.status })}\n\n`);
    };
    const itv = setInterval(send, 2500);
    req.on('close', () => clearInterval(itv));
});

// ==========================================
// 3. USER DASHBOARD
// ==========================================

app.get('/:secret', (req, res) => {
    const secret = req.params.secret;
    if (secret === ADMIN_KEY) return;
    const session = activeBots[secret];
    if (!session) return res.send(`<html><head>${UI_STYLE}</head><body><div class="card" style="text-align:center;"><h3>❌ Session Expired</h3><p>Your bot is offline or the server restarted.</p><a href="/" class="btn btn-blue" style="text-decoration:none; display:block;">Go Home</a></div></body></html>`);

    res.send(`
        <html><head>${UI_STYLE}</head><body>
            <h3 style="margin-bottom:5px;">🎮 ${session.config.ign} <span id="status-text" style="font-size:12px; float:right;"></span></h3>
            <div class="stat-grid">
                <div class="stat-box"><div class="stat-label">Money</div><div id="m-val" class="stat-value">$${session.stats.money}</div></div>
                <div class="stat-box"><div class="stat-label">Shards</div><div id="s-val" class="stat-value">${session.stats.shards}</div></div>
                <div class="stat-box" style="grid-column: span 2;"><div class="stat-label">Playtime</div><div id="p-val" class="stat-value">${session.stats.playtime}</div></div>
            </div>
            <div class="card">
                <form onsubmit="sendCmd(event)">
                    <input type="text" id="cmdInput" placeholder="Execute command..." required>
                    <button class="btn btn-green">Send to Game</button>
                </form>
            </div>
            <div class="card">
                <h3>📟 Live Terminal</h3>
                <div id="terminal"></div>
                <form action="/stop-bot" method="POST" onsubmit="return confirm('Disconnect bot and end session?')">
                    <input type="hidden" name="secret" value="${secret}">
                    <button class="btn btn-red">🛑 END SESSION</button>
                </form>
            </div>
            <script>
                const evtSource = new EventSource("/stream/${secret}");
                evtSource.onmessage = (e) => {
                    const data = JSON.parse(e.data);
                    document.getElementById('m-val').innerText = '$' + data.stats.money;
                    document.getElementById('s-val').innerText = data.stats.shards;
                    document.getElementById('p-val').innerText = data.stats.playtime;
                    document.getElementById('status-text').innerHTML = '<span class="status-dot ' + data.status + '"></span>' + data.status.toUpperCase();
                    document.getElementById('terminal').innerHTML = data.logs.map(l => '<div>'+l+'</div>').join('');
                };
                async function sendCmd(e) {
                    e.preventDefault();
                    const el = document.getElementById('cmdInput');
                    await fetch('/send-cmd', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ secret: '${secret}', cmd: el.value }) });
                    el.value = '';
                }
            </script>
        </body></html>
    `);
});

// ==========================================
// 4. CORE LOGIC (AUTO-RECONNECT & API)
// ==========================================

function createBot(secret) {
    const config = activeBots[secret].config;
    const bot = mineflayer.createBot({
        host: config.server,
        username: config.ign,
        auth: 'microsoft',
        version: '1.20.1'
    });

    activeBots[secret].bot = bot;
    activeBots[secret].status = 'online';

    bot.on('message', (m) => {
        activeBots[secret]?.logs.unshift(m.toString());
        if (activeBots[secret]?.logs.length > 40) activeBots[secret].logs.pop();
    });

    bot.on('end', (reason) => {
        activeBots[secret].status = 'offline';
        activeBots[secret].logs.unshift(`[System] Disconnected: ${reason}. Retrying in 15s...`);
        // AUTO RECONNECT LOGIC
        setTimeout(() => { if (activeBots[secret]) createBot(secret); }, 15000);
    });

    bot.on('error', (err) => {
        activeBots[secret].logs.unshift(`[Error] ${err.message}`);
    });
}

app.post('/launch', (req, res) => {
    const { ign, server, secret } = req.body;
    if (activeBots[secret]) return res.send("Key in use.");
    
    activeBots[secret] = { 
        logs: ["[System] Initializing..."], 
        stats: { money: "0", shards: "0.00", playtime: "0h 0m" }, 
        config: { ign, server },
        status: 'offline'
    };

    createBot(secret);

    // Donut API Tracking Loop
    const apiLoop = setInterval(() => {
        if (!activeBots[secret]) return clearInterval(apiLoop);
        https.get({ 
            hostname: 'api.donutsmp.net', 
            path: `/v1/stats/${ign}`, 
            headers: { 'Authorization': 'Bearer 93b93228c9954e33989c0e1f049c4662' } 
        }, (r) => {
            let b = ''; r.on('data', d => b += d);
            r.on('end', () => { try { 
                const s = JSON.parse(b).result; 
                activeBots[secret].stats.money = s.money.toLocaleString(); 
                activeBots[secret].stats.shards = (s.shards / 1000).toFixed(2) + 'k'; 
                activeBots[secret].stats.playtime = Math.floor(s.playtime/3600000) + 'h ' + Math.floor((s.playtime%3600000)/60000) + 'm';
            } catch(e){} });
        });
    }, 60000);

    res.redirect(`/${secret}`);
});

app.post('/admin-broadcast', (req, res) => {
    Object.values(activeBots).forEach(s => s.status === 'online' && s.bot.chat(req.body.msg));
    res.redirect(`/${ADMIN_KEY}`);
});

app.post('/send-cmd', (req, res) => {
    const s = activeBots[req.body.secret];
    if (s && s.status === 'online') s.bot.chat(req.body.cmd);
    res.sendStatus(200);
});

app.post('/stop-bot', (req, res) => {
    const s = activeBots[req.body.secret];
    if (s) { s.bot.quit(); delete activeBots[req.body.secret]; }
    res.redirect('/');
});

app.listen(PORT);
        
