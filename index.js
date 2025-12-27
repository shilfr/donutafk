const express = require('express');
const mineflayer = require('mineflayer');
const https = require('https');
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
        .auth-box { background: #5865f2; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; border: 2px solid #fff; box-shadow: 0 0 15px #5865f2; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: block; margin-top: 5px; }
        .btn-green { background: #57F287; color: #000; }
        .btn-blue { background: #3498db; color: #fff; }
        .btn-red { background: #ed4245; color: #fff; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #000; color: #fff; box-sizing: border-box; }
    </style>
`;

function formatPlaytime(ms) {
    let d = Math.floor(ms / 86400000);
    let h = Math.floor((ms % 86400000) / 3600000);
    let m = Math.floor((ms % 3600000) / 60000);
    return d + "d " + h + "h " + m + "m";
}

app.get('/', (req, res) => {
    res.send(`<html><head>${UI_STYLE}</head><body><h2 style="text-align:center;">☠️ NoLifeBot</h2><div class="card"><h3>🚀 Start Session</h3><form action="/launch" method="POST"><input type="text" name="ign" placeholder="Username" required><br><br><input type="text" name="server" value="donutsmp.net" required><br><br><input type="password" name="secret" placeholder="Secure Safety Key" required><br><br><button class="btn btn-green">Launch Instance</button></form></div></body></html>`);
});

app.get('/stream/:secret', (req, res) => {
    const session = activeBots[req.params.secret];
    if (!session) return res.end();
    res.setHeader('Content-Type', 'text/event-stream');
    const itv = setInterval(() => {
        if (!activeBots[req.params.secret]) return res.end();
        res.write('data: ' + JSON.stringify({ stats: session.stats, logs: session.logs.slice(0, 30), status: session.status }) + '\n\n');
    }, 2000);
    req.on('close', () => clearInterval(itv));
});

app.get('/:secret', (req, res) => {
    const secret = req.params.secret;
    const session = activeBots[secret];
    if (!session) return res.redirect('/');
    res.send(`<html><head>${UI_STYLE}</head><body>
        <div class="header-box">
            <h2 style="margin:0;">☠️ ${session.config.ign}</h2>
            <code style="color:#7289da;">${session.config.server}</code><br>
            <div id="status-badge" class="status-badge ${session.status}">${session.status}</div>
        </div>
        <div class="stat-grid">
            <div class="stat-box"><div class="stat-label">💰 Money</div><div id="m-val" class="stat-value">$${session.stats.money}</div></div>
            <div class="stat-box"><div class="stat-label">💎 Shards</div><div id="s-val" class="stat-value">${session.stats.shards}</div></div>
            <div class="stat-box"><div class="stat-label">⏳ Playtime</div><div id="p-val" class="stat-value">${session.stats.playtime}</div></div>
            <div class="stat-box"><div class="stat-label">⏱️ Session</div><div id="sess-val" class="stat-value">0m</div></div>
        </div>
        <div class="card"><h3>📟 Terminal</h3><div id="terminal"></div><form onsubmit="sendCmd(event)"><input type="text" id="cmdInput" placeholder="Send a message..."><button class="btn btn-blue">Send Message</button></form></div>
        <form action="/launch" method="POST">
            <input type="hidden" name="ign" value="${session.config.ign}">
            <input type="hidden" name="server" value="${session.config.server}">
            <input type="hidden" name="secret" value="${secret}">
            <button class="btn btn-blue" style="background:#444;">♻️ RE-FETCH AUTH CODE</button>
        </form>
        <form action="/stop-bot" method="POST"><input type="hidden" name="secret" value="${secret}"><button class="btn btn-red">🛑 STOP SESSION</button></form>
        <script>
            let start = Date.now();
            const evtSource = new EventSource("/stream/${secret}");
            evtSource.onmessage = (e) => {
                const d = JSON.parse(e.data);
                document.getElementById("m-val").innerText = "$" + d.stats.money;
                document.getElementById("s-val").innerText = d.stats.shards;
                document.getElementById("p-val").innerText = d.stats.playtime;
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
    
    // KILL EXISTING BOT BEFORE RESTARTING
    if (s.bot) { try { s.bot.quit(); } catch(e){} }

    s.logs.unshift("<div>[System] 🔍 Requesting Microsoft code...</div>");

    s.bot = mineflayer.createBot({ 
        host: s.config.server, 
        username: s.config.ign, 
        auth: 'microsoft', 
        version: '1.20.1',
        // This is the key event for the Device Flow
        onMsaCode: (data) => {
            console.log("Auth code generated:", data.user_code); // Also logs to Render console for backup
            const msg = '<div class="auth-box">⚠️ ACTION REQUIRED<br>1. Go to: <a href="https://microsoft.com/link" target="_blank" style="color:white;text-decoration:underline;">microsoft.com/link</a><br>2. Enter Code: <span style="font-size:1.4em;letter-spacing:2px;">' + data.user_code + '</span></div>';
            s.logs.unshift(msg);
        }
    });

    s.bot.once('spawn', () => { 
        s.status = 'online'; 
        s.logs.unshift("<div>[System] 🟢 Bot Online! Joining Donut...</div>");
        setTimeout(() => { s.bot.chat('/server donut'); }, 2000);
    });

    s.bot.on('message', (m) => {
        s.logs.unshift("<div>" + m.toString() + "</div>");
        if (s.logs.length > 50) s.logs.pop();
    });

    s.bot.on('error', (err) => {
        s.logs.unshift("<div style='color:#ed4245;'>[Error] " + err.message + "</div>");
    });

    s.bot.on('end', (reason) => { 
        s.status = 'offline'; 
        s.logs.unshift("<div>[System] 🔴 Connection Ended: " + reason + "</div>");
    });
}

app.post('/launch', (req, res) => {
    const { ign, server, secret } = req.body;
    if (userRegistry[ign] && userRegistry[ign] !== secret) return res.send("Security Key Mismatch.");
    
    userRegistry[ign] = secret;
    activeBots[secret] = { 
        logs: ["<div>[System] 🟡 Initializing Handshake...</div>"], 
        stats: { money: "0.00", shards: "0.00k", playtime: "0d 0h 0m" }, 
        config: { ign, server }, 
        status: 'offline',
        bot: null
    };
    
    createBot(secret);
    res.redirect("/" + secret);
});

app.post('/send-cmd', (req, res) => {
    const s = activeBots[req.body.secret];
    if (s && s.status === 'online') s.bot.chat(req.body.cmd);
    res.sendStatus(200);
});

app.post('/stop-bot', (req, res) => {
    if (activeBots[req.body.secret]) { 
        try { activeBots[req.body.secret].bot.quit(); } catch(e){}
        delete activeBots[req.body.secret]; 
    }
    res.redirect('/');
});

app.listen(PORT);
                  
