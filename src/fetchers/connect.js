const https = require('https');
const http = require('http');
const db = require('../db');
const entity = require('../entity');

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
      // Only show team members registered in entities.json (#75)
      const ent = entity.get(bot.name);
      if (!ent) continue;

      // Use entity meta as fallback for missing role/bio
      const entMeta = ent.meta || {};

      const prev = db.getAgent(bot.name);
      const agent = {
        name: bot.name,
        role: bot.role || entMeta.role || '',
        bio: bot.bio || entMeta.bio || '',
        tags: JSON.stringify(bot.tags || []),
        kind: entMeta.kind || 'agent', // HxA Friendly #58: 'human' | 'agent'
        online: bot.online ? 1 : 0,
        last_seen_at: bot.last_seen_at ? new Date(bot.last_seen_at).getTime() : null,
        updated_at: now
      };

      if (!prev || prev.online !== agent.online || prev.role !== agent.role) {
        changes.push(agent);
      }
      db.upsertAgent(agent);
    }

    // Purge stale agents not in entities.json (#75)
    const registeredIds = new Set(entity.getAll().map(e => e.id));
    for (const agent of db.getAllAgents()) {
      if (!registeredIds.has(agent.name)) {
        db.removeAgent(agent.name);
      }
    }

    return { agents: db.getAllAgents(), changes };
  } catch (err) {
    console.error('[ConnectFetcher] Error:', err.message);
    return { agents: db.getAllAgents(), changes: [] };
  }
}

module.exports = { init, fetchAgents };
