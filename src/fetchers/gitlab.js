const https = require('https');
const http = require('http');
const db = require('../db');

let config = null;
let usernameMap = {};
const projectNameCache = new Map(); // project_id -> name

function init(cfg) {
  config = cfg.gitlab;
  usernameMap = config.username_map || {};
}

function mapUsername(gitlabUsername) {
  return usernameMap[gitlabUsername] || gitlabUsername;
}

async function apiFetch(endpoint) {
  const url = `${config.url}/api/v4${endpoint}`;
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'PRIVATE-TOKEN': config.token }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} on ${endpoint}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchIssues() {
  try {
    const issues = await apiFetch(`/groups/${config.group_id}/issues?state=all&per_page=100&order_by=updated_at&sort=desc`);
    const changes = [];

    for (const issue of issues) {
      const assignee = issue.assignee ? mapUsername(issue.assignee.username) : null;
      const task = {
        id: `issue-${issue.project_id}-${issue.iid}`,
        type: 'issue',
        project: issue.references?.full?.split('#')[0]?.replace(/\/$/, '')?.split('/')?.pop() || 'unknown',
        title: issue.title,
        state: issue.state,
        assignee: assignee,
        reviewer: null,
        url: issue.web_url,
        labels: JSON.stringify(issue.labels || []),
        created_at: new Date(issue.created_at).getTime(),
        updated_at: new Date(issue.updated_at).getTime()
      };
      db.upsertTask(task);
      changes.push(task);
    }
    return changes;
  } catch (err) {
    console.error('[GitLabFetcher] Issues error:', err.message);
    return [];
  }
}

async function fetchMRs() {
  try {
    const mrs = await apiFetch(`/groups/${config.group_id}/merge_requests?state=all&per_page=100&order_by=updated_at&sort=desc`);
    const changes = [];

    for (const mr of mrs) {
      const assignee = mr.assignee ? mapUsername(mr.assignee.username) : null;
      const reviewers = (mr.reviewers || []).map(r => mapUsername(r.username));
      const task = {
        id: `mr-${mr.project_id}-${mr.iid}`,
        type: 'mr',
        project: mr.references?.full?.split('!')[0]?.replace(/\/$/, '')?.split('/')?.pop() || 'unknown',
        title: mr.title,
        state: mr.state,
        assignee: assignee,
        reviewer: reviewers.join(',') || null,
        url: mr.web_url,
        labels: JSON.stringify(mr.labels || []),
        created_at: new Date(mr.created_at).getTime(),
        updated_at: new Date(mr.updated_at).getTime()
      };
      db.upsertTask(task);
      changes.push(task);
    }
    return changes;
  } catch (err) {
    console.error('[GitLabFetcher] MRs error:', err.message);
    return [];
  }
}

async function fetchEvents() {
  try {
    // Fetch recent events from user-level events API (covers all projects)
    const events = await apiFetch(`/events?per_page=100`);
    const newEvents = [];

    for (const event of events) {
      const agent = event.author ? mapUsername(event.author.username) : 'unknown';
      let action = event.action_name || 'unknown';
      let targetType = event.target_type ? event.target_type.toLowerCase() : (event.push_data ? 'push' : 'unknown');
      let targetTitle = event.target_title || (event.push_data ? `${event.push_data.commit_count} commit(s) to ${event.push_data.ref}` : '');
      let project = '';

      // Resolve project name from cache or API
      if (event.project_id) {
        if (projectNameCache.has(event.project_id)) {
          project = projectNameCache.get(event.project_id);
        } else {
          try {
            const p = await apiFetch(`/projects/${event.project_id}?simple=true`);
            project = p.name || p.path || `project-${event.project_id}`;
            projectNameCache.set(event.project_id, project);
          } catch {
            project = `project-${event.project_id}`;
          }
        }
      }

      const evt = {
        timestamp: new Date(event.created_at).getTime(),
        agent,
        action,
        target_type: targetType,
        target_title: targetTitle,
        project,
        url: event.target_url || '',
        is_collab: 0
      };
      db.insertEvent(evt);
      newEvents.push(evt);
    }
    return newEvents;
  } catch (err) {
    console.error('[GitLabFetcher] Events error:', err.message);
    return [];
  }
}

async function fetchAll() {
  const [issues, mrs, events] = await Promise.all([
    fetchIssues(),
    fetchMRs(),
    fetchEvents()
  ]);
  return { issues, mrs, events };
}

module.exports = { init, fetchIssues, fetchMRs, fetchEvents, fetchAll, mapUsername };
