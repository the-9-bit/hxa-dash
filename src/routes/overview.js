// GET /api/overview — agent-friendly overview endpoint (#113)
// Returns aggregated dashboard data in JSON or plain text.
// Use ?format=text for a markdown summary readable by AI agents.
const { Router } = require('express');
const db = require('../db');
const collab = require('../analyzers/collab');

const router = Router();

function buildOverview() {
  const now = Date.now();
  const agents = db.getAllAgents();
  const tasks = db.getAllTasks();

  // Team summary
  const online = agents.filter(a => a.online);
  const openTasks = tasks.filter(t => t.state === 'opened');
  const assignedOpen = openTasks.filter(t => t.assignee);
  const unassigned = openTasks.filter(t => !t.assignee);
  const busyAgents = online.filter(a =>
    openTasks.some(t => t.assignee === a.name)
  );
  const idleAgents = online.filter(a =>
    !openTasks.some(t => t.assignee === a.name)
  );

  // Board counts
  const board = db.getTasksByState();
  const boardCounts = {
    todo: board.todo.length,
    doing: board.doing.length,
    done: board.done.length,
  };

  // Blockers
  const staleIssues = db.getStaleIssues(now, 72 * 3600000);
  const unreviewedMRs = db.getUnreviewedMRs(now, 24 * 3600000);
  const staleMRs = db.getStaleMRs(now, 0.5 * 3600000);
  const idleAgentsList = db.getIdleAgents(now, 4 * 3600000);

  const blockers = [
    ...staleMRs.map(m => ({
      type: 'stale_mr', severity: 'critical',
      title: m.title, url: m.url, author: m.author, reviewer: m.reviewer,
      project: m.project, stale_minutes: m.stale_minutes,
    })),
    ...staleIssues.filter(i => !i.title?.startsWith('[ClawMark]')).map(i => ({
      type: 'stale_issue', severity: 'critical',
      title: i.title, url: i.url, assignee: i.assignee,
      project: i.project, stale_hours: i.stale_hours,
    })),
    ...unreviewedMRs.map(m => ({
      type: 'unreviewed_mr', severity: 'warning',
      title: m.title, url: m.url, author: m.author,
      project: m.project, hours_open: m.hours_open,
    })),
    ...idleAgentsList.map(a => ({
      type: 'idle_agent', severity: 'info',
      title: a.name, hours_since: a.last_seen_hours,
    })),
  ];

  // Recent timeline
  const timeline = db.getTimeline(10);

  // Agent details — status logic (#135):
  //   busy: Connect online + git activity within 4h + has open tasks
  //   idle: Connect online + no recent activity OR no open tasks
  //   inactive: Connect online but >24h without git activity
  //   offline: Connect not online
  const agentStats = db.getAgentStats();
  const agentStatsMap = new Map(agentStats.map(s => [s.name, s]));
  const fourHoursAgo = now - 4 * 3600000;
  const twentyFourHoursAgo = now - 24 * 3600000;
  const sevenDaysAgo = now - 7 * 86400000;

  const agentSummaries = agents.map(a => {
    const myTasks = openTasks.filter(t => t.assignee === a.name);
    const stats = agentStatsMap.get(a.name);
    const lastActive = stats?.last_active || null;
    const hasRecentActivity = lastActive && lastActive > fourHoursAgo;
    const hasAnyDayActivity = lastActive && lastActive > twentyFourHoursAgo;

    let status;
    if (!a.online) {
      status = 'offline';
    } else if (hasRecentActivity && myTasks.length > 0) {
      status = 'busy';
    } else if (!hasAnyDayActivity) {
      status = 'inactive';
    } else {
      status = 'idle';
    }

    // Activity metrics (#135)
    const agentEvents = db.getEventsInWindow(sevenDaysAgo, a.name);
    const closedInWindow = db.getTasksClosedInWindow(sevenDaysAgo, a.name);

    return {
      name: a.name,
      online: a.online,
      status,
      open_tasks: myTasks.length,
      last_active_at: lastActive,
      events_7d: agentEvents.length,
      closed_7d: closedInWindow.length,
      current_work: myTasks.map(t => ({
        title: t.title,
        url: t.url,
        project: t.project,
        type: t.type,
      })),
    };
  });

  // Collab summary
  const graph = collab.getGraph();

  return {
    timestamp: new Date().toISOString(),
    team: {
      total: agents.length,
      online: online.length,
      busy: busyAgents.length,
      idle: idleAgents.length,
      offline: agents.length - online.length,
    },
    board: boardCounts,
    blockers,
    agents: agentSummaries,
    unassigned_tasks: unassigned.map(t => ({
      title: t.title, url: t.url, project: t.project, type: t.type,
    })),
    recent_activity: timeline.map(e => ({
      agent: e.agent, action: e.action, target: e.target,
      project: e.project, timestamp: e.timestamp,
    })),
    collab: { nodes: graph.nodes.length, edges: graph.edges.length },
  };
}

function toText(data) {
  const lines = [];
  lines.push(`# HxA Dash Overview`);
  lines.push(`Generated: ${data.timestamp}`);
  lines.push('');

  // Team
  const t = data.team;
  lines.push(`## Team (${t.total} agents)`);
  lines.push(`Online: ${t.online} | Busy: ${t.busy} | Idle: ${t.idle} | Offline: ${t.offline}`);
  lines.push('');

  // Board
  const b = data.board;
  lines.push(`## Task Board`);
  lines.push(`Todo: ${b.todo} | In Progress: ${b.doing} | Done: ${b.done}`);
  lines.push('');

  // Blockers
  if (data.blockers.length > 0) {
    lines.push(`## Blockers (${data.blockers.length})`);
    for (const bl of data.blockers) {
      const sev = bl.severity === 'critical' ? '🔴' : bl.severity === 'warning' ? '🟡' : '🔵';
      if (bl.type === 'stale_mr') {
        lines.push(`${sev} Stale MR: ${bl.title} (${bl.project}) — ${bl.stale_minutes}min, author: ${bl.author}, reviewer: ${bl.reviewer || 'none'}`);
      } else if (bl.type === 'stale_issue') {
        lines.push(`${sev} Stale Issue: ${bl.title} (${bl.project}) — ${bl.stale_hours}h, assignee: ${bl.assignee || 'unassigned'}`);
      } else if (bl.type === 'unreviewed_mr') {
        lines.push(`${sev} Unreviewed MR: ${bl.title} (${bl.project}) — ${bl.hours_open}h open, author: ${bl.author}`);
      } else if (bl.type === 'idle_agent') {
        lines.push(`${sev} Idle Agent: ${bl.title} — ${bl.hours_since}h since last seen`);
      }
    }
    lines.push('');
  } else {
    lines.push(`## Blockers: None`);
    lines.push('');
  }

  // Agents
  lines.push(`## Agents`);
  for (const a of data.agents) {
    const icon = a.status === 'busy' ? '🟢' : a.status === 'idle' ? '⚪' : a.status === 'inactive' ? '🟡' : '⚫';
    const work = a.current_work.length > 0
      ? a.current_work.map(w => `${w.title} (${w.project})`).join(', ')
      : 'no tasks';
    const lastActive = a.last_active_at ? new Date(a.last_active_at).toISOString().slice(0, 16) : 'never';
    const metrics = `events_7d: ${a.events_7d ?? 0}, closed_7d: ${a.closed_7d ?? 0}`;
    lines.push(`${icon} ${a.name} [${a.status}]: ${work} | last: ${lastActive} | ${metrics}`);
  }
  lines.push('');

  // Unassigned
  if (data.unassigned_tasks.length > 0) {
    lines.push(`## Unassigned Tasks (${data.unassigned_tasks.length})`);
    for (const t of data.unassigned_tasks) {
      lines.push(`- ${t.title} (${t.project}) ${t.url || ''}`);
    }
    lines.push('');
  }

  // Recent activity
  if (data.recent_activity.length > 0) {
    lines.push(`## Recent Activity`);
    for (const e of data.recent_activity) {
      const ts = new Date(e.timestamp).toISOString().slice(11, 16);
      lines.push(`- [${ts}] ${e.agent}: ${e.action} ${e.target || ''} (${e.project || ''})`);
    }
    lines.push('');
  }

  // Collab
  lines.push(`## Collaboration: ${data.collab.nodes} agents, ${data.collab.edges} edges`);

  return lines.join('\n');
}

router.get('/', (req, res) => {
  const data = buildOverview();
  if (req.query.format === 'text') {
    res.type('text/plain; charset=utf-8').send(toText(data));
  } else {
    res.json(data);
  }
});

module.exports = router;
