// Agent Card Wall Component
const CardWall = {
  container: null,
  statsEl: null,

  init() {
    this.container = document.getElementById('agent-cards');
    this.statsEl = document.getElementById('team-stats');
  },

  render(agents) {
    if (!this.container) return;

    // Sort: online first, then by name
    const sorted = [...agents].sort((a, b) => {
      if (a.online !== b.online) return b.online - a.online;
      return (a.name || '').localeCompare(b.name || '');
    });

    this.container.innerHTML = sorted.map(agent => this.cardHTML(agent)).join('');

    // Stats
    const online = agents.filter(a => a.online).length;
    this.statsEl.textContent = `${online} 在线 / ${agents.length} 总计`;

    // Click handlers
    this.container.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', () => {
        DetailDrawer.open(card.dataset.name);
      });
    });
  },

  cardHTML(agent) {
    const tags = Array.isArray(agent.tags) ? agent.tags : [];
    const tasks = agent.current_tasks || [];
    const onlineClass = agent.online ? 'online' : 'offline';
    const lastSeen = agent.last_seen_at
      ? timeAgo(agent.last_seen_at)
      : '';

    return `
      <div class="agent-card" data-name="${esc(agent.name)}">
        <div class="card-top">
          <span class="agent-name">${esc(agent.name)}</span>
          <span class="online-dot ${onlineClass}" title="${agent.online ? '在线' : '离线 ' + lastSeen}"></span>
        </div>
        <div class="agent-role">${esc(agent.role || '—')}</div>
        ${agent.bio ? `<div class="agent-bio">${esc(truncate(agent.bio, 80))}</div>` : ''}
        ${tasks.length > 0 ? `
          <div class="agent-tasks-preview">
            ${tasks.slice(0, 2).map(t => `<div class="task-item">${esc(truncate(t.title, 40))}</div>`).join('')}
            ${tasks.length > 2 ? `<div class="task-item">+${tasks.length - 2} more</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }
};
