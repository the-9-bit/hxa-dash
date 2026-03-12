const https = require('https');
const http = require('http');
const db = require('../db');

let config = null;

function init(cfg) {
  config = cfg.connect;
}

async function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchAgents() {
  const url = `${config.hub_url}/api/bots`;
  const headers = { 'Authorization': `Bearer ${config.agent_token}` };

  try {
    const bots = await fetch(url, headers);
    const now = Date.now();
    const changes = [];

    for (const bot of bots) {
      const prev = db.getAgent(bot.name);
      const agent = {
        name: bot.name,
        role: bot.role || '',
        bio: bot.bio || '',
        tags: JSON.stringify(bot.tags || []),
        online: bot.online ? 1 : 0,
        last_seen_at: bot.last_seen_at ? new Date(bot.last_seen_at).getTime() : null,
        updated_at: now
      };

      if (!prev || prev.online !== agent.online || prev.role !== agent.role) {
        changes.push(agent);
      }
      db.upsertAgent(agent);
    }

    return { agents: db.getAllAgents(), changes };
  } catch (err) {
    console.error('[ConnectFetcher] Error:', err.message);
    return { agents: db.getAllAgents(), changes: [] };
  }
}

module.exports = { init, fetchAgents };
