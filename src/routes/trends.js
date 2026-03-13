// Trends route — daily completed tasks + activity heatmap (#47)
const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/trends?days=14
router.get('/', (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 90);

  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  // Build ordered day labels: oldest → newest
  const dayLabels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dayLabels.push(`${d.getFullYear()}-${mm}-${dd}`);
  }

  // Closed/merged tasks in period
  const { done: doneTasks } = db.getTasksByState();
  const recentDone = doneTasks.filter(t => t.updated_at >= cutoff);

  // Daily bucket map: date -> { total, byAgent }
  const dailyMap = new Map();
  for (const label of dayLabels) dailyMap.set(label, { total: 0, byAgent: {} });

  for (const task of recentDone) {
    const d = new Date(task.updated_at);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${d.getFullYear()}-${mm}-${dd}`;
    if (!dailyMap.has(key)) continue;
    const slot = dailyMap.get(key);
    slot.total++;
    // Attribute to assignee first, then author
    const agent = task.assignee || task.author || 'unknown';
    slot.byAgent[agent] = (slot.byAgent[agent] || 0) + 1;
  }

  // Per-agent daily series
  const agentNames = [...new Set(
    recentDone.map(t => t.assignee || t.author).filter(Boolean)
  )].sort();

  const agentSeries = {};
  for (const name of agentNames) {
    agentSeries[name] = dayLabels.map(d => dailyMap.get(d)?.byAgent[name] || 0);
  }

  // Activity heatmap: heatmap[dayOfWeek(0=Sun)][hour] = event count
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const events = db.getTimeline(500);
  for (const ev of events) {
    if (ev.timestamp < cutoff) continue;
    const d = new Date(ev.timestamp);
    heatmap[d.getDay()][d.getHours()]++;
  }

  res.json({
    labels: dayLabels,
    team: dayLabels.map(d => dailyMap.get(d)?.total || 0),
    agents: agentSeries,
    heatmap,
    period_days: days,
    total_completed: recentDone.length
  });
});

module.exports = router;
