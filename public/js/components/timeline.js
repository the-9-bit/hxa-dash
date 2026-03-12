// Timeline Component
const Timeline = {
  container: null,

  init() {
    this.container = document.getElementById('timeline');
  },

  render(events) {
    if (!this.container) return;
    if (!events || events.length === 0) {
      this.container.innerHTML = '<div class="loading">暂无活动记录</div>';
      return;
    }

    this.container.innerHTML = events.slice(0, 50).map(e => `
      <div class="timeline-event ${e.is_collab ? 'collab' : ''}">
        <span class="timeline-time">${formatTime(e.timestamp)}</span>
        <span class="timeline-agent">${esc(e.agent)}</span>
        <span class="timeline-action">${esc(e.action)}</span>
        <span class="timeline-target">${esc(truncate(e.target_title || '', 50))}</span>
        ${e.project ? `<span class="timeline-project">${esc(e.project)}</span>` : ''}
      </div>
    `).join('');
  }
};
