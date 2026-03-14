// Token consumption attribution routes (#93)
// Data source: simulated for now — replace with real API integration later
const express = require('express');
const router = express.Router();
const db = require('../db');

// Cost per 1M tokens (USD) — configurable
const COST_PER_M_INPUT  = 3.00;   // Claude Sonnet input
const COST_PER_M_OUTPUT = 15.00;  // Claude Sonnet output

// Simulated token data store
// In production, this would come from Claude API usage logs or a billing API
const tokenStore = {
  daily: new Map(),  // "YYYY-MM-DD" -> { total_input, total_output, agents: { name: { input, output } } }
};

// Seed demo data based on agent activity patterns
function seedDemoData() {
  const agents = db.getAllAgents();
  if (agents.length === 0) return;

  const now = Date.now();
  const dayMs = 86400000;

  for (let d = 0; d < 30; d++) {
    const date = new Date(now - d * dayMs);
    const key = date.toISOString().slice(0, 10);
    if (tokenStore.daily.has(key)) continue;

    const entry = { total_input: 0, total_output: 0, agents: {} };

    for (const agent of agents) {
      // Simulate usage based on agent's event activity
      const dayStart = Math.floor(date.getTime() / dayMs) * dayMs;
      const dayEvents = db.getEventsInWindow(dayStart, agent.name)
        .filter(e => e.timestamp < dayStart + dayMs);
      const activity = dayEvents.length;

      // Base tokens per agent-day + activity multiplier + randomness
      const baseFactor = agent.online ? 1.2 : 0.3;
      const activityFactor = 1 + activity * 0.5;
      const noise = 0.7 + Math.random() * 0.6; // 0.7-1.3x

      const inputTokens = Math.round(50000 * baseFactor * activityFactor * noise);
      const outputTokens = Math.round(inputTokens * (0.15 + Math.random() * 0.15)); // 15-30% of input

      entry.agents[agent.name] = { input: inputTokens, output: outputTokens };
      entry.total_input += inputTokens;
      entry.total_output += outputTokens;
    }

    tokenStore.daily.set(key, entry);
  }
}

// Refresh demo data on each request (picks up new agents)
function ensureData() {
  seedDemoData();
}

// GET /api/tokens — summary for a time window
router.get('/', (req, res) => {
  ensureData();

  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const now = Date.now();
  const dayMs = 86400000;

  let totalInput = 0;
  let totalOutput = 0;
  const agentTotals = new Map();
  const dailySeries = [];

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * dayMs);
    const key = date.toISOString().slice(0, 10);
    const entry = tokenStore.daily.get(key);

    if (entry) {
      totalInput += entry.total_input;
      totalOutput += entry.total_output;

      dailySeries.push({
        date: key,
        input: entry.total_input,
        output: entry.total_output,
      });

      for (const [name, usage] of Object.entries(entry.agents)) {
        const prev = agentTotals.get(name) || { input: 0, output: 0 };
        agentTotals.set(name, {
          input: prev.input + usage.input,
          output: prev.output + usage.output,
        });
      }
    } else {
      dailySeries.push({ date: key, input: 0, output: 0 });
    }
  }

  // Per-agent breakdown sorted by total tokens desc
  const agentBreakdown = [...agentTotals.entries()]
    .map(([name, usage]) => ({
      name,
      input: usage.input,
      output: usage.output,
      total: usage.input + usage.output,
      cost_usd: (usage.input / 1e6 * COST_PER_M_INPUT) + (usage.output / 1e6 * COST_PER_M_OUTPUT),
    }))
    .sort((a, b) => b.total - a.total);

  const totalTokens = totalInput + totalOutput;
  const totalCost = (totalInput / 1e6 * COST_PER_M_INPUT) + (totalOutput / 1e6 * COST_PER_M_OUTPUT);

  res.json({
    window_days: days,
    demo: true, // Flag: this is simulated data
    summary: {
      total_input: totalInput,
      total_output: totalOutput,
      total_tokens: totalTokens,
      total_cost_usd: Math.round(totalCost * 100) / 100,
      avg_daily_tokens: Math.round(totalTokens / days),
      avg_daily_cost_usd: Math.round((totalCost / days) * 100) / 100,
    },
    daily: dailySeries,
    agents: agentBreakdown,
    pricing: {
      input_per_m: COST_PER_M_INPUT,
      output_per_m: COST_PER_M_OUTPUT,
    },
  });
});

module.exports = router;
