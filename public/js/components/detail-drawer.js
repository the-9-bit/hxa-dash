// Agent Detail Drawer Component
const DetailDrawer = {
  drawer: null,
  body: null,

  init() {
    this.drawer = document.getElementById('detail-drawer');
    this.body = document.getElementById('drawer-body');

    // Close handlers
    this.drawer.querySelector('.drawer-overlay').addEventListener('click', () => this.close());
    this.drawer.querySelector('.drawer-close').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  async open(name) {
    try {
      const res = await fetch(`/api/team/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      this.renderDetail(data);
      this.drawer.classList.remove('hidden');
    } catch (err) {
      console.error('Failed to load agent detail:', err);
    }
  },

  close() {
    this.drawer.classList.add('hidden');
  },

  renderDetail(data) {
    const { agent, current_tasks, recent_done, events, collabs, stats } = data;

    this.body.innerHTML = `
      <div class="drawer-header">
        <h3>${esc(agent.name)} <span class="online-dot ${agent.online ? 'online' : 'offline'}"></span></h3>
        <div class="drawer-role">${esc(agent.role || '—')}</div>
        ${agent.bio ? `<div class="drawer-bio">${esc(agent.bio)}</div>` : ''}
      </div>

      <div class="drawer-section">
        <h4>统计</h4>
        <div class="drawer-stat-grid">
          <div class="stat-box">
            <div class="stat-num">${stats.open_tasks}</div>
            <div class="stat-label">进行中</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${stats.closed_tasks}</div>
            <div class="stat-label">已完成</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${stats.mr_count}</div>
            <div class="stat-label">MR</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${stats.issue_count}</div>
            <div class="stat-label">Issue</div>
          </div>
        </div>
      </div>

      ${current_tasks.length > 0 ? `
        <div class="drawer-section">
          <h4>当前工作 (${current_tasks.length})</h4>
          <ul class="drawer-task-list">
            ${current_tasks.map(t => `
              <li>
                <a href="${esc(t.url)}" target="_blank" style="color: var(--accent); text-decoration: none;">
                  ${esc(t.title)}
                </a>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                  ${esc(t.project)} · ${t.type}
                </div>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${recent_done.length > 0 ? `
        <div class="drawer-section">
          <h4>近期完成 (${recent_done.length})</h4>
          <ul class="drawer-task-list">
            ${recent_done.slice(0, 8).map(t => `
              <li>
                <a href="${esc(t.url)}" target="_blank" style="color: var(--text); text-decoration: none;">
                  ${esc(t.title)}
                </a>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                  ${esc(t.project)} · ${t.type} · ${t.state}
                </div>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${collabs.length > 0 ? `
        <div class="drawer-section">
          <h4>协作伙伴</h4>
          <ul class="drawer-collab-list">
            ${collabs.map(c => `
              <li>
                <span>${esc(c.partner)} <span class="collab-type">${esc(c.type)}</span></span>
                <span class="collab-weight">${c.weight}x</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${events.length > 0 ? `
        <div class="drawer-section">
          <h4>活动记录</h4>
          <ul class="drawer-event-list">
            ${events.slice(0, 15).map(e => `
              <li>
                <span style="color: var(--text-secondary); font-size: 11px; font-family: monospace;">
                  ${formatTime(e.timestamp)}
                </span>
                <span style="margin-left: 8px;">${esc(e.action)}</span>
                <span style="color: var(--text-secondary); margin-left: 4px;">${esc(truncate(e.target_title, 50))}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    `;
  }
};
