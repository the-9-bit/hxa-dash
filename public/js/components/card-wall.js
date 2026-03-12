// Agent Card Wall Component (v2: supports multiple render targets)
const CardWall = {
  init() {},

  // Render to a specific container
  renderTo(containerId, statsId, agents) {
    const container = document.getElementById(containerId);
    const statsEl = document.getElementById(statsId);
    if (!container) return;

    // Sort: online first, then by name
    const sorted = [...agents].sort((a, b) => {
      if (a.online !== b.online) return b.online - a.online;
      return (a.name || '').localeCompare(b.name || '');
    });

    container.innerHTML = sorted.map(agent => this.cardHTML(agent)).join('');

    // Stats
    const online = agents.filter(a => a.online).length;
    if (statsEl) statsEl.textContent = `${online} 在线 / ${agents.length} 总计`;

    // Click handlers
    container.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', () => {
        DetailDrawer.open(card.dataset.name);
      });
    });
  },

  cardHTML(agent) {
    const tasks = agent.current_tasks || [];
    const stats = agent.stats || {};
    const latestEvent = agent.latest_event;
    const onlineClass = agent.online ? 'online' : 'offline';
    const lastSeen = agent.last_seen_at ? timeAgo(agent.last_seen_at) : '';

    // Stats bar: MR + Issue counts
    const hasStats = stats.mr_count || stats.issue_count || stats.open_tasks;
    const statsHTML = hasStats ? `
      <div class="card-stats">
        ${stats.open_tasks ? `<span class="card-stat" title="进行中任务">📋 ${stats.open_tasks}</span>` : ''}
        ${stats.mr_count ? `<span class="card-stat" title="合并请求">🔀 ${stats.mr_count}</span>` : ''}
        ${stats.issue_count ? `<span class="card-stat" title="Issue">📝 ${stats.issue_count}</span>` : ''}
        ${stats.closed_tasks ? `<span class="card-stat" title="已完成">✅ ${stats.closed_tasks}</span>` : ''}
      </div>
    ` : '';

    // Latest activity
    const activityHTML = latestEvent ? `
      <div class="card-latest-activity" title="${latestEvent.project || ''}">
        <span class="activity-action">${esc(latestEvent.action || '')}</span>
        <span class="activity-target">${esc(truncate(latestEvent.target_title || '', 30))}</span>
        <span class="activity-time">${latestEvent.timestamp ? timeAgo(latestEvent.timestamp) : ''}</span>
      </div>
    ` : '';

    // Current tasks
    const tasksHTML = tasks.length > 0 ? `
      <div class="agent-tasks-preview">
        ${tasks.slice(0, 2).map(t => `<div class="task-item">${esc(truncate(t.title, 40))}</div>`).join('')}
        ${tasks.length > 2 ? `<div class="task-item task-more">+${tasks.length - 2} more</div>` : ''}
      </div>
    ` : '';

    return `
      <div class="agent-card ${onlineClass}" data-name="${esc(agent.name)}">
        <div class="card-top">
          <span class="agent-name">${esc(agent.name)}</span>
          <span class="online-dot ${onlineClass}" title="${agent.online ? '在线' : '离线 ' + lastSeen}"></span>
        </div>
        <div class="agent-role">${esc(agent.role || '—')}</div>
        ${agent.bio ? `<div class="agent-bio">${esc(truncate(agent.bio, 60))}</div>` : ''}
        ${statsHTML}
        ${tasksHTML}
        ${activityHTML}
      </div>
    `;
  }
};
