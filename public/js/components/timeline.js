// Timeline Component (v2: supports multiple render targets + filtering)
const Timeline = {
  init() {},

  // Render to a specific container
  renderTo(containerId, events, limit = 50) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!events || events.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无活动记录</div>';
      return;
    }

    container.innerHTML = events.slice(0, limit).map(e => `
      <div class="timeline-event ${e.is_collab ? 'collab' : ''}">
        <span class="timeline-time">${formatTime(e.timestamp)}</span>
        <span class="timeline-agent">${esc(e.agent)}</span>
        <span class="timeline-action">${this._actionLabel(e.action)}</span>
        <span class="timeline-target">${esc(truncate(e.target_title || '', 50))}</span>
        ${e.project ? `<span class="timeline-project">${esc(e.project)}</span>` : ''}
      </div>
    `).join('');
  },

  // Human-readable action labels
  _actionLabel(action) {
    const labels = {
      'opened': '创建',
      'closed': '关闭',
      'merged': '合并',
      'commented on': '评论',
      'pushed to': '推送',
      'approved': '审批',
      'assigned': '分配'
    };
    return labels[action] || esc(action);
  }
};
