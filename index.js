const express = require('express');
const mineflayer = require('mineflayer');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 10000;

// MASTER CONFIG
const ADMIN_KEY = "ConsulOfNATO"; 
const activeBots = {}; // Stores { bot, logs, stats, config, status }

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UI_STYLE = `
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0f0f11; color: #e1e1e1; font-family: -apple-system, sans-serif; padding: 15px; margin: 0; }
        .card { background: #1c1c1f; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #2d2d31; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-box { background: #121214; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #333; }
        .stat-label { font-size: 0.7em; color: #7289da; font-weight: bold; text-transform: uppercase; }
        .stat-value { font-size: 1.1em; font-weight: bold; margin-top: 5px; }
        .status-dot { height: 10px; width: 10px; border-radius: 50%; display: inline-block; margin-right: 5px; }
        .online { background-color: #57F287; }
        .offline { background-color: #ed4245; }
        #terminal { background: #000; height: 300px; overflow-y: auto; padding: 10px; border-radius: 8px; border: 1px solid #333; color: #0f0; font-family: monospace; font-size: 11px; white-space: pre-wrap; line-height: 1.4; }
        .auth-box { background: #5865f2; color: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; font-weight: bold; border-left: 5px solid #fff; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #000; color: #fff; box-sizing: border-box; margin-bottom: 10px; font-size: 16px; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-green { background: #57F287; color: #000; }
        .btn-blue { background: #3498db; color: #fff; }
        .btn-red { background: #ed4245; color: #fff; margin-top: 10px; }
    </style>
`;

// Helper: Minecraft Username Validation
async function validateUser(username) {
    return new Promise((resolve) => {
        https.get(`https://api.mojang.com/users/profiles/minecraft/${username}`, (res) => {
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
    });
}

// ==========================================
// ROUTES
// ==========================================

app.get('/', (req, res) => {
    res.send(`<html><head>${UI_STYLE}</head><body><h2 style="text-align:center;">☠️ No Life Bot</h2>
    <div class="card"><h3>🚀 Start Session</h3><form action="/launch" method="POST">
    <input type="text" name="ign" placeholder="Minecraft Username" required>
    <input type="text" name="server" value="donutsmp.net" required>
    <input type="text" name="secret" placeholder="Your Private Secret Key" required>
    <button class="btn btn-green">Launch Bot</button></form></div></body></html>`);
});

app.get(`/${ADMIN_KEY}`, (req, res) => {
    const bots = Object.keys(activeBots).map(k => `
        <div class="stat-box" style="text-align:left; margin-bottom:5px;">
            <span class="status-dot ${activeBots[k].status}"></span><b>${activeBots[k].config.ign}</b>
            <div style="font-size:10px; color:#555;">Key: ${k}</div>
        </div>`).join('');
    res.send(`<html><head>${UI_STYLE}</head><body><h2>👑 Admin</h2>
    <div class="card"><h3>📢 Broadcast</h3><form action="/admin-broadcast" method="POST">
    <input type="text" name="msg" placeholder="Global message..."><button class="btn btn-blue">Send to All</button></form></div>
    <div class="card"><h3>Sessions</h3>${bots || 'No active bots.'}</div></body></html>`);
});

app.get('/stream/:secret', (req, res) => {
    const session = activeBots[req.params.secret];
    if (!session) return res.end();
    res.setHeader('Content-Type', 'text/event-stream');
    const itv = setInterval(() => {
        if (!activeBots[req.params.secret]) return res.end();
        res.write(`data: ${JSON.stringify({ stats: session.stats, logs: session.logs.slice(0, 30), status: session.status, server: session.config.server })}\n\n`);
    }, 2000);
    req.on('close', () => clearInterval(itv));
});

app.get('/:secret', (req, res) => {
    const secret = req.params.secret;
    if (secret === ADMIN_KEY) return;
    const session = activeBots[secret];
    if (!session) return res.redirect('/');
    res.send(`<html><head>${UI_STYLE}</head><body>
        <h3>🎮 ${session.config.ign} <span id="status-text"></span></h3>
        <p style="font-size:0.8em; color:#777;">IP: <b>${session.config.server}</b></p>
        <div class="stat-grid">
            <div class="stat-box"><div class="stat-label">Money</div><div id="m-val" class="stat-value">$${session.stats.money}</div></div>
            <div class="stat-box"><div class="stat-label">Shards</div><div id="s-val" class="stat-value">${session.stats.shards}</div></div>
        </div>
        <div class="card"><form onsubmit="sendCmd(event)"><input type="text" id="cmdInput" placeholder="Enter command..."><button class="btn btn-green">Execute</button></form></div>
        <div class="card"><h3>📟 Terminal</h3><div id="terminal"></div>
        <form action="/stop-bot" method="POST" onsubmit="return confirm('End this session?')"><input type="hidden" name="secret" value="${secret}"><button class="btn btn-red">🛑 STOP BOT</button></form></div>
        <script>
            const evtSource = new EventSource("/stream/${secret}");
            evtSource.onmessage = (e) => {
                const data = JSON.parse(e.data);
                document.getElementById('m-val').innerText = '$' + data.stats.money;
                document.getElementById('s-val').innerText = data.stats.shards;
                document.getElementById('status-text').innerHTML = '<span class="status-dot ' + data.status + '"></span>' + data.status.toUpperCase();
                document.getElementById('terminal').innerHTML = data.logs.join('');
            };
            async function sendCmd(e){ e.preventDefault(); const i = document.getElementById('cmdInput'); await fetch('/send-cmd', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({secret:'${secret}', cmd:i.value})}); i.value=''; }
        </script></body></html>`);
});

// ==========================================
// BOT LOGIC
// ==========================================

function createBot(secret) {
    const s = activeBots[secret];
    const bot = mineflayer.createBot({ host: s.config.server, username: s.config.ign, auth: 'microsoft', version: '1.20.1' });
    
    // Intercept Microsoft Device Code
    bot.on('auth-device', (data) => {
        s.logs.unshift(\`<div class="auth-box">🔑 AUTH REQUIRED<br>Go to: microsoft.com/link<br>Code: \${data.user_code}</div>\`);
    });

    s.bot = bot;
    bot.once('spawn', () => { s.status = 'online'; s.logs.unshift("<div style='color:#57F287;'>[System] Online!</div>"); });
    bot.on('message', (m) => { s.logs.unshift(\`<div>\${m.toString()}</div>\`); if (s.logs.length > 50) s.logs.pop(); });
    bot.on('end', () => { 
        s.status = 'offline'; 
        s.logs.unshift("<div style='color:#ed4245;'>[System] Offline. Retrying in 15s...</div>"); 
        setTimeout(() => { if (activeBots[secret]) createBot(secret); }, 15000); 
    });
}

// ==========================================
// POST ACTIONS
// ==========================================

app.post('/launch', async (req, res) => {
    const { ign, server, secret } = req.body;
    if (activeBots[secret]) return res.send("Secret Key taken.");
    if (!(await validateUser(ign))) return res.send("<h1>❌ Invalid Username</h1><a href='/'>Back</a>");
    
    activeBots[secret] = { logs: ["<div>[System] Launching...</div>"], stats: { money: "0", shards: "0.00" }, config: { ign, server }, status: 'offline' };
    createBot(secret);
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

