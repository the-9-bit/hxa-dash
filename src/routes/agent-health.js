// Agent Health Reporting (#115)
// POST /api/agent-health/:name — agents push their system metrics
// GET  /api/agent-health        — retrieve all agent health data
// GET  /api/agent-health/:name  — retrieve single agent health
const { Router } = require('express');
const db = require('../db');

const router = Router();

// Max age before health data is considered stale (10 minutes)
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

// POST /api/agent-health/:name — agent reports its system health
router.post('/:name', (req, res) => {
  const { name } = req.params;
  const agent = db.getAgent(name);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { disk, memory, cpu, pm2, hostname } = req.body;

  // Validate required fields
  if (!disk || !memory) {
    return res.status(400).json({ error: 'disk and memory are required' });
  }

  const health = {
    hostname: hostname || null,
    disk: {
      pct: typeof disk.pct === 'number' ? disk.pct : null,
      used: disk.used || null,
      total: disk.total || null,
      status: disk.pct > 90 ? 'critical' : disk.pct > 80 ? 'warning' : 'ok',
    },
    memory: {
      pct: typeof memory.pct === 'number' ? memory.pct : null,
      used_gb: memory.used_gb || null,
      total_gb: memory.total_gb || null,
      status: memory.pct > 90 ? 'critical' : memory.pct > 80 ? 'warning' : 'ok',
    },
    cpu: cpu ? {
      pct: typeof cpu.pct === 'number' ? cpu.pct : null,
      load_avg: cpu.load_avg || null,
      cores: cpu.cores || null,
    } : null,
    pm2: pm2 ? {
      online: pm2.online || 0,
      total: pm2.total || 0,
      services: (pm2.services || []).slice(0, 20), // cap at 20
    } : null,
  };

  db.upsertAgentHealth(name, health);
  res.json({ ok: true });
});

// GET /api/agent-health — all agents' health
router.get('/', (req, res) => {
  const allHealth = db.getAllAgentHealth();
  const now = Date.now();
  const agents = db.getAllAgents();

  const result = agents.map(agent => {
    const health = allHealth[agent.name] || null;
    const stale = health ? (now - health.reported_at > STALE_THRESHOLD_MS) : true;

    // Determine overall status
    let overall = 'unknown';
    if (health && !stale) {
      const statuses = [health.disk.status, health.memory.status];
      if (health.pm2) {
        statuses.push(health.pm2.online === health.pm2.total && health.pm2.total > 0 ? 'ok' : health.pm2.online === 0 ? 'critical' : 'warning');
      }
      overall = statuses.includes('critical') ? 'critical'
        : statuses.includes('warning') ? 'warning' : 'ok';
    }

    return {
      name: agent.name,
      online: !!agent.online,
      overall,
      stale,
      health,
    };
  });

  res.json({ agents: result, timestamp: now });
});

// GET /api/agent-health/:name — single agent health
router.get('/:name', (req, res) => {
  const agent = db.getAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const health = db.getAgentHealth(req.params.name);
  const now = Date.now();
  const stale = health ? (now - health.reported_at > STALE_THRESHOLD_MS) : true;

  res.json({
    name: agent.name,
    online: !!agent.online,
    stale,
    health,
    timestamp: now,
  });
});

module.exports = router;
