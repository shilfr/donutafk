const express = require('express');
const mineflayer = require('mineflayer');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 10000;

const ADMIN_KEY = "ConsulOfNATO"; 
const activeBots = {}; 
const userRegistry = {}; // Simple persistent registry: { username: secretKey }

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
        .auth-box { background: #5865f2; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; border-left: 5px solid #fff; box-shadow: 0 0 20px rgba(88, 101, 242, 0.4); }
        .input-container { position: relative; margin-bottom: 15px; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #000; color: #fff; box-sizing: border-box; font-size: 16px; }
        input::placeholder { color: #555; transition: 0.3s; }
        input:focus::placeholder { opacity: 0.3; transform: translateX(10px); }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: block; }
        .btn-green { background: #57F287; color: #000; }
        .btn-blue { background: #3498db; color: #fff; }
        .btn-red { background: #ed4245; color: #fff; margin-top: 10px; }
    </style>
`;

function formatPlaytime(ms) {
    let d = Math.floor(ms / 86400000);
    let h = Math.floor((ms % 86400000) / 3600000);
    let m = Math.floor((ms % 3600000) / 60000);
    return d + "d " + h + "h " + m + "m";
}

app.get('/', (req, res) => {
    res.send(`<html><head>${UI_STYLE}</head><body><h2 style="text-align:center;">☠️ NoLifeBot Cloud</h2>
    <div class="card"><h3>🚀 Start Session</h3><form action="/launch" method="POST">
    <div class="input-container"><input type="text" name="ign" placeholder="Minecraft Username" required></div>
    <div class="input-container"><input type="text" name="server" value="donutsmp.net" required></div>
    <div class="input-container"><input type="password" name="secret" placeholder="Create a secure safety key (do not share with anyone)" required></div>
    <button class="btn btn-green">Launch Instance</button></form></div></body></html>`);
});

app.get('/' + ADMIN_KEY, (req, res) => {
    const bots = Object.keys(activeBots).map(k => `<div class="stat-box" style="text-align:left; margin-bottom:5px;"><b>${activeBots[k].config.ign}</b> [${activeBots[k].status}]</div>`).join('');
    res.send(`<html><head>${UI_STYLE}</head><body><h2>👑 Admin Panel</h2><div class="card"><h3>Active Sessions</h3>${bots || 'None'}</div></body></html>`);
});

app.get('/stream/:secret', (req, res) => {
    const session = activeBots[req.params.secret];
    if (!session) return res.end();
    res.setHeader('Content-Type', 'text/event-stream');
    const itv = setInterval(() => {
        if (!activeBots[req.params.secret]) return res.end();
        const entities = session.bot?.entities ? Object.values(session.bot.entities).filter(e => e.type === 'player' || e.type === 'mob').map(e => e.name || e.type).slice(0, 5).join(', ') : 'Scanning...';
        res.write('data: ' + JSON.stringify({ stats: session.stats, logs: session.logs.slice(0, 30), status: session.status, scene: entities }) + '\n\n');
    }, 2000);
    req.on('close', () => clearInterval(itv));
});

app.get('/:secret', (req, res) => {
    const secret = req.params.secret;
    const session = activeBots[secret];
    if (!session || secret === ADMIN_KEY) return res.redirect('/');
    res.send(`<html><head>${UI_STYLE}</head><body>
        <div class="header-box">
            <h2 style="margin:0; color:#fff;">☠️ ${session.config.ign}</h2>
            <code style="color:#7289da;">${session.config.server}</code><br>
            <div id="status-badge" class="status-badge ${session.status}">${session.status}</div>
        </div>
        <div class="stat-grid">
            <div class="stat-box"><div class="stat-label">💰 Money</div><div id="m-val" class="stat-value">$${session.stats.money}</div></div>
            <div class="stat-box"><div class="stat-label">💎 Shards</div><div id="s-val" class="stat-value">${session.stats.shards}</div></div>
            <div class="stat-box"><div class="stat-label">⏳ Playtime</div><div id="p-val" class="stat-value">${session.stats.playtime}</div></div>
            <div class="stat-box"><div class="stat-label">⏱️ Session</div><div id="sess-val" class="stat-value">0m</div></div>
        </div>
        <div class="card"><div class="stat-label">👁️ Nearby Scene</div><div id="scene-val" style="font-size:0.9em; margin-top:5px; color:#aaa;">Scanning...</div></div>
        <div class="card"><h3>📟 Terminal</h3><div id="terminal"></div><form onsubmit="sendCmd(event)"><input type="text" id="cmdInput" placeholder="Send a message..."><button class="btn btn-blue" style="margin-top:10px;">Send Message</button></form></div>
        <form action="/stop-bot" method="POST"><input type="hidden" name="secret" value="${secret}"><button class="btn btn-red">🛑 STOP & WIPE SESSION</button></form>
        <script>
            let start = Date.now();
            const evtSource = new EventSource("/stream/${secret}");
            evtSource.onmessage = (e) => {
                const d = JSON.parse(e.data);
                document.getElementById("m-val").innerText = "$" + d.stats.money;
                document.getElementById("s-val").innerText = d.stats.shards;
                document.getElementById("p-val").innerText = d.stats.playtime;
                document.getElementById("scene-val").innerText = d.scene;
                document.getElementById("status-badge").className = "status-badge " + d.status;
                document.getElementById("status-badge").innerText = d.status;
                document.getElementById("terminal").innerHTML = d.logs.join("");
                document.getElementById("sess-val").innerText = Math.floor((Date.now() - start)/60000) + "m";
            };
            async function sendCmd(e){ e.preventDefault(); const i = document.getElementById("cmdInput"); await fetch("/send-cmd", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({secret:"${secret}", cmd:i.value})}); i.value=""; }
        </script></body></html>`);
});

function createBot(secret) {
    const s = activeBots[secret];
    const bot = mineflayer.createBot({ host: s.config.server, username: s.config.ign, auth: 'microsoft', version: '1.20.1' });
    
    // FORCED MICROSOFT AUTH INTERCEPTOR
    bot.on('auth-device', (data) => {
        const msg = '<div class="auth-box">🔑 MICROSOFT AUTH REQUIRED<br>Link: <a href="' + data.verification_uri + '" target="_blank" style="color:white;">microsoft.com/link</a><br>Code: <span style="font-size:1.5em;">' + data.user_code + '</span></div>';
        s.logs.unshift(msg);
    });

    s.bot = bot;
    bot.once('spawn', () => { 
        s.status = 'online'; 
        s.logs.unshift("<div>[System] 🟢 Bot Successfully Joined!</div>");
        // Ensure bot is actually in the server
        bot.chat('/server donut'); 
    });

    bot.on('message', (m) => {
        s.logs.unshift("<div>" + m.toString() + "</div>");
        if (s.logs.length > 50) s.logs.pop();
    });

    bot.on('error', (err) => { s.logs.unshift("<div style='color:#ed4245;'>[Error] " + err.message + "</div>"); });
    bot.on('end', () => { 
        s.status = 'offline'; 
        setTimeout(() => { if (activeBots[secret]) createBot(secret); }, 15000); 
    });

    const apiInt = setInterval(() => {
        if (!activeBots[secret]) return clearInterval(apiInt);
        https.get({ hostname: 'api.donutsmp.net', path: '/v1/stats/' + s.config.ign, headers: { 'Authorization': 'Bearer 93b93228c9954e33989c0e1f049c4662' } }, (res) => {
            let body = ''; res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const r = JSON.parse(body).result;
                    s.stats.money = r.money.toLocaleString(undefined, {minimumFractionDigits: 2});
                    s.stats.shards = (r.shards / 1000).toFixed(2) + 'k';
                    s.stats.playtime = formatPlaytime(r.playtime);
                } catch(e) {}
            });
        });
    }, 30000);
}

app.post('/launch', (req, res) => {
    const { ign, server, secret } = req.body;
    
    // PRIVACY & SECURITY LOGIC
    if (userRegistry[ign] && userRegistry[ign] !== secret) {
        return res.send("<h2 style='color:red; font-family:sans-serif;'>❌ Incorrect Security Key for this account.</h2><a href='/'>Go Back</a>");
    }
    
    userRegistry[ign] = secret; // Save key to registry
    activeBots[secret] = { logs: ["<div>[System] 🟡 Booting... Check for Auth Code shortly.</div>"], stats: { money: "0.00", shards: "0.00k", playtime: "0d 0h 0m" }, config: { ign, server }, status: 'offline' };
    createBot(secret);
    res.redirect("/" + secret);
});

app.post('/send-cmd', (req, res) => {
    const s = activeBots[req.body.secret];
    if (s && s.status === 'online') s.bot.chat(req.body.cmd);
    res.sendStatus(200);
});

app.post('/stop-bot', (req, res) => {
    if (activeBots[req.body.secret]) { activeBots[req.body.secret].bot?.quit(); delete activeBots[req.body.secret]; }
    res.redirect('/');
});

app.listen(PORT);

