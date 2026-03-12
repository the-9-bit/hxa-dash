const { Router } = require('express');
const db = require('../db');
const collab = require('../analyzers/collab');

const router = Router();

// GET /api/team — all agents + stats
router.get('/', (req, res) => {
  const agents = db.getAllAgents().map(a => ({
    ...a,
    tags: safeJSON(a.tags),
    online: !!a.online,
    current_tasks: db.getTasksForAgent(a.name).filter(t => t.state === 'opened').slice(0, 3)
  }));

  const online = agents.filter(a => a.online).length;
  res.json({
    agents,
    stats: {
      total: agents.length,
      online,
      offline: agents.length - online
    }
  });
});

// GET /api/team/:name — single agent detail
router.get('/:name', (req, res) => {
  const agent = db.getAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const tasks = db.getTasksForAgent(agent.name);
  const events = db.getEventsForAgent(agent.name, 30);
  const collabs = db.getCollabsForAgent(agent.name);

  res.json({
    agent: { ...agent, tags: safeJSON(agent.tags), online: !!agent.online },
    current_tasks: tasks.filter(t => t.state === 'opened'),
    recent_done: tasks.filter(t => t.state === 'closed' || t.state === 'merged').slice(0, 10),
    events,
    collabs: collabs.map(c => ({
      partner: c.source === agent.name ? c.target : c.source,
      type: c.type,
      weight: c.weight
    })),
    stats: {
      mr_count: tasks.filter(t => t.type === 'mr').length,
      issue_count: tasks.filter(t => t.type === 'issue').length,
      open_tasks: tasks.filter(t => t.state === 'opened').length,
      closed_tasks: tasks.filter(t => t.state === 'closed' || t.state === 'merged').length
    }
  });
});

function safeJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}

module.exports = router;
