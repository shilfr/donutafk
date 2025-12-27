const express = require('express');
const mineflayer = require('mineflayer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

const ADMIN_KEY = "ConsulOfNATO"; 
const activeBots = {}; 
const userRegistry = {}; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UI_STYLE = `
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0f0f11; color: #e1e1e1; font-family: -apple-system, sans-serif; padding: 15px; margin: 0; }
        .card { background: #1c1c1f; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #2d2d31; }
        .header-box { text-align: center; padding: 20px; background: linear-gradient(180deg, #252529 0%, #1c1c1f 100%); border-radius: 12px; margin-bottom: 15px; border: 1px solid #333; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-box { background: #121214; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #333; }
        .stat-label { font-size: 0.75em; color: #7289da; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
        .stat-value { font-size: 1.1em; font-weight: bold; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 8px; text-transform: uppercase; }
        .online { background: rgba(87, 242, 135, 0.1); color: #57F287; border: 1px solid #57F287; }
        .offline { background: rgba(237, 66, 69, 0.1); color: #ed4245; border: 1px solid #ed4245; }
        #terminal { background: #000; height: 280px; overflow-y: auto; padding: 10px; border-radius: 8px; border: 1px solid #333; color: #0f0; font-family: monospace; font-size: 11px; white-space: pre-wrap; margin-bottom: 10px; }
        .auth-box { background: #5865f2; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; border: 2px solid #fff; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: block; margin-top: 5px; text-decoration: none; text-align: center; }
        .btn-green { background: #57F287; color: #000; }
        .btn-blue { background: #3498db; color: #fff; }
        .btn-red { background: #ed4245; color: #fff; }
        .btn-warn { background: #f1c40f; color: #000; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #000; color: #fff; box-sizing: border-box; }
    </style>
`;

// API Fetcher Function
function updateStats(secret) {
    const s = activeBots[secret];
    if (!s) return;
    https.get({ 
        hostname: 'api.donutsmp.net', 
        path: '/v1/stats/' + s.config.ign, 
        headers: { 'Authorization': 'Bearer 93b93228c9954e33989c0e1f049c4662' } 
    }, (res) => {
        let body = ''; res.on('data', d => body += d);
        res.on('end', () => {
            try {
                const r = JSON.parse(body).result;
                s.stats.money = r.money.toLocaleString(undefined, {minimumFractionDigits: 2});
                s.stats.shards = (r.shards / 1000).toFixed(2) + 'k';
                s.stats.playtime = Math.floor(r.playtime / 86400000) + "d " + Math.floor((r.playtime % 86400000) / 3600000) + "h";
            } catch(e) { console.log("Stat error for " + s.config.ign); }
        });
    });
}

function createBot(secret) {
    const s = activeBots[secret];
    if (s.bot) { try { s.bot.quit(); } catch(e){} }

    s.bot = mineflayer.createBot({ 
        host: s.config.server, 
        username: s.config.ign, 
        auth: 'microsoft', 
        version: '1.20.1',
        profilesFolder: './auth-cache/' + s.config.ign, // Separate folder per user
        onMsaCode: (data) => {
            s.logs.unshift('<div class="auth-box">⚠️ NEW EMAIL NEEDED<br>1. Go to: <a href="https://microsoft.com/link" target="_blank" style="color:white;">microsoft.com/link</a><br>2. Code: ' + data.user_code + '</div>');
        }
    });

    s.bot.once('spawn', () => { 
        s.status = 'online'; 
        s.logs.unshift("<div>[System] 🟢 Bot Joined!</div>");
        updateStats(secret); // Instant stat refresh on spawn
        setTimeout(() => { s.bot.chat('/server donut'); }, 2000);
    });

    s.bot.on('message', (m) => {
        s.logs.unshift("<div>" + m.toString() + "</div>");
        if (s.logs.length > 50) s.logs.pop();
    });

    s.bot.on('end', () => { s.status = 'offline'; });
}

// ROUTES
app.get('/', (req, res) => {
    res.send(`<html><head>${UI_STYLE}</head><body><h2 style="text-align:center;">☠️ NoLifeBot</h2><div class="card"><h3>🚀 Start Session</h3><form action="/launch" method="POST"><input type="text" name="ign" placeholder="Username" required><br><br><input type="password" name="secret" placeholder="Safety Key" required><br><br><button class="btn btn-green">Launch Instance</button></form></div></body></html>`);
});

app.get('/:secret', (req, res) => {
    const secret = req.params.secret;
    const session = activeBots[secret];
    if (!session) return res.redirect('/');
    res.send(`<html><head>${UI_STYLE}</head><body>
        <div class="header-box"><h2>☠️ ${session.config.ign}</h2><div id="status-badge" class="status-badge ${session.status}">${session.status}</div></div>
        <div class="stat-grid">
            <div class="stat-box"><div class="stat-label">💰 Money</div><div id="m-val" class="stat-value">$${session.stats.money}</div></div>
            <div class="stat-box"><div class="stat-label">💎 Shards</div><div id="s-val" class="stat-value">${session.stats.shards}</div></div>
        </div>
        <div class="card"><h3>📟 Terminal</h3><div id="terminal"></div></div>
        
        <div class="card" style="padding:10px; border-color:#ed4245;">
            <p style="font-size:12px; color:#aaa; margin-bottom:10px;">Logged into wrong email? Use the button below to force a new Microsoft login link.</p>
            <form action="/unlink" method="POST"><input type="hidden" name="secret" value="${secret}"><button class="btn btn-warn">🔓 UNLINK MC ACCOUNT</button></form>
            <form action="/stop-bot" method="POST"><input type="hidden" name="secret" value="${secret}"><button class="btn btn-red">🛑 STOP SESSION</button></form>
        </div>

        <script>
            const evtSource = new EventSource("/stream/${secret}");
            evtSource.onmessage = (e) => {
                const d = JSON.parse(e.data);
                document.getElementById("m-val").innerText = "$" + d.stats.money;
                document.getElementById("s-val").innerText = d.stats.shards;
                document.getElementById("status-badge").className = "status-badge " + d.status;
                document.getElementById("status-badge").innerText = d.status;
                document.getElementById("terminal").innerHTML = d.logs.join("");
            };
        </script></body></html>`);
});

app.get('/stream/:secret', (req, res) => {
    const session = activeBots[req.params.secret];
    if (!session) return res.end();
    res.setHeader('Content-Type', 'text/event-stream');
    setInterval(() => {
        if (activeBots[req.params.secret]) res.write('data: ' + JSON.stringify({ stats: session.stats, logs: session.logs.slice(0,30), status: session.status }) + '\n\n');
    }, 2000);
});

app.post('/launch', (req, res) => {
    const { ign, secret } = req.body;
    if (userRegistry[ign] && userRegistry[ign] !== secret) return res.send("Key Mismatch");
    userRegistry[ign] = secret;
    activeBots[secret] = { logs: ["<div>[System] Handshake started...</div>"], stats: { money: "0.00", shards: "0.00k" }, config: { ign, server: 'donutsmp.net' }, status: 'offline' };
    createBot(secret);
    res.redirect("/" + secret);
});

app.post('/unlink', (req, res) => {
    const secret = req.body.secret;
    const s = activeBots[secret];
    if (s) {
        if (s.bot) s.bot.quit();
        const cachePath = path.join(__dirname, 'auth-cache', s.config.ign);
        if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true, force: true });
        s.logs.unshift("<div style='color:#f1c40f;'>[System] Account unlinked. Generating new code...</div>");
        setTimeout(() => createBot(secret), 2000);
    }
    res.redirect("/" + secret);
});

app.post('/stop-bot', (req, res) => {
    if (activeBots[req.body.secret]) { try { activeBots[req.body.secret].bot.quit(); } catch(e){} delete activeBots[req.body.secret]; }
    res.redirect('/');
});

app.listen(PORT);
            
