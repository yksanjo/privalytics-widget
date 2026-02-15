const express = require('express');
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3003;
const DB_PATH = __dirname + '/privalytics-widget.db';

let db;

async function initDB() {
  const SQL = await initSqlJs();
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL,
    widget_color TEXT DEFAULT '#58a6ff', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL,
    session_hash TEXT NOT NULL, path TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  saveDB();
}

function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function generateSessionHash(ip, date) {
  return crypto.createHash('sha256').update(ip + ':' + date).digest('hex').substring(0, 16);
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

app.use(express.json());
app.use(express.static(__dirname));

// Create site
app.post('/api/sites', (req, res) => {
  const { name, domain, widgetColor } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'Name and domain required' });
  
  const id = uuidv4();
  db.run('INSERT INTO sites (id, name, domain, widget_color) VALUES (?, ?, ?, ?)', 
    [id, name, domain, widgetColor || '#58a6ff']);
  saveDB();
  
  res.status(201).json({ id, name, domain, widget_color: widgetColor || '#58a6ff' });
});

// Get all sites
app.get('/api/sites', (req, res) => {
  const result = db.exec('SELECT * FROM sites ORDER BY created_at DESC');
  const sites = result[0]?.values.map(r => ({
    id: r[0], name: r[1], domain: r[2], widget_color: r[3], created_at: r[4]
  })) || [];
  res.json(sites);
});

// Track pageview
app.post('/api/track', (req, res) => {
  const { siteId, path = '/' } = req.body;
  if (!siteId) return res.status(400).json({ error: 'Site ID required' });

  const ip = req.ip || 'unknown';
  const sessionHash = generateSessionHash(ip, getDateString());

  db.run('INSERT INTO events (site_id, session_hash, path) VALUES (?, ?, ?)', 
    [siteId, sessionHash, path]);
  saveDB();
  res.status(204).end();
});

// Get stats
app.get('/api/sites/:id/stats', (req, res) => {
  const { id } = req.params;
  
  const visitors = db.exec(`SELECT COUNT(DISTINCT session_hash) FROM events WHERE site_id = ?`, [id]);
  const views = db.exec(`SELECT COUNT(*) FROM events WHERE site_id = ?`, [id]);
  
  res.json({
    visitors: visitors[0]?.values[0]?.[0] || 0,
    views: views[0]?.values[0]?.[0] || 0
  });
});

// Widget embed code endpoint
app.get('/api/sites/:id/widget.js', (req, res) => {
  const { id } = req.params;
  const result = db.exec('SELECT widget_color FROM sites WHERE id = ?', [id]);
  const color = result[0]?.values[0]?.[0] || '#58a6ff';
  
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function() {
  var siteId = '${id}';
  var color = '${color}';
  var path = window.location.pathname;
  
  navigator.sendBeacon('/api/track', JSON.stringify({ siteId: siteId, path: path }));
  
  var container = document.createElement('div');
  container.id = 'privalytics-widget';
  container.innerHTML = '<div style="position:fixed;bottom:20px;right:20px;background:' + color + ';color:white;padding:8px 12px;border-radius:8px;font-family:system-ui;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;z-index:9999">📊</div>';
  document.body.appendChild(container);
})();
  `.trim());
});

// Simple dashboard
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Privalytics Widget</title>
  <style>
    body { font-family: system-ui; background: #0d1117; color: #e6edf3; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { margin-bottom: 8px; }
    p { color: #8b949e; margin-bottom: 32px; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .stat { background: #21262d; border: 1px solid #30363d; border-radius: 8px; padding: 24px; text-align: center; }
    .stat-value { font-size: 48px; font-weight: 600; }
    .stat-label { color: #8b949e; margin-top: 8px; }
    .form { background: #21262d; border: 1px solid #30363d; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
    input { width: 100%; padding: 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; margin-bottom: 12px; }
    button { width: 100%; padding: 12px; background: #58a6ff; border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer; }
    .site { background: #21262d; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 8px; }
    .site-name { font-weight: 600; }
    .site-domain { color: #8b949e; font-size: 12px; }
    .code { background: #161b22; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 12px; word-break: break-all; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Privalytics Widget</h1>
    <p>Drop-in analytics widget for static sites</p>
    
    <div class="stats">
      <div class="stat"><div class="stat-value" id="visitors">0</div><div class="stat-label">Total Visitors</div></div>
      <div class="stat"><div class="stat-value" id="views">0</div><div class="stat-label">Total Views</div></div>
    </div>
    
    <div class="form">
      <h3>Add New Site</h3>
      <input type="text" id="name" placeholder="Site name">
      <input type="text" id="domain" placeholder="Domain (e.g., mysite.com)">
      <button onclick="addSite()">Add Site</button>
    </div>
    
    <div id="sites"></div>
  </div>
  
  <script>
    async function loadSites() {
      const res = await fetch('/api/sites');
      const sites = await res.json();
      const container = document.getElementById('sites');
      
      for (const site of sites) {
        const stats = await fetch('/api/sites/' + site.id + '/stats').then(r => r.json());
        container.innerHTML += '<div class="site"><div class="site-name">' + site.name + '</div><div class="site-domain">' + site.domain + '</div><div class="code"><script src="' + window.location.origin + '/api/sites/' + site.id + '/widget.js"></script></div></div>';
      }
      
      if (sites.length > 0) {
        document.getElementById('visitors').textContent = sites.reduce((a, s) => a + 0, 0);
      }
    }
    
    async function addSite() {
      const name = document.getElementById('name').value;
      const domain = document.getElementById('domain').value;
      if (!name || !domain) return;
      
      await fetch('/api/sites', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, domain})
      });
      
      document.getElementById('name').value = '';
      document.getElementById('domain').value = '';
      loadSites();
    }
    
    loadSites();
  </script>
</body>
</html>`);
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Privalytics Widget running on http://localhost:${PORT}`);
  });
}).catch(console.error);
