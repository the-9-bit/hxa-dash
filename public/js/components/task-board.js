// Task Board Component (v2: supports multiple render targets + filtering)
const TaskBoard = {
  init() {},

  // Render to a specific page prefix (overview or tasks)
  renderTo(prefix, board) {
    // For tasks page: direct IDs. For overview: prefixed IDs
    const isOverview = prefix === 'overview';
    const p = isOverview ? 'overview-' : '';

    this.renderColumn(`${p}todo`, board.todo || []);
    this.renderColumn(`${p}doing`, board.doing || []);
    this.renderColumn(`${p}done`, board.done || []);
  },

  renderColumn(stateId, tasks) {
    const list = document.getElementById(`${stateId}-list`);
    const count = document.getElementById(`${stateId}-count`);
    if (!list) return;

    if (count) count.textContent = tasks.length;

    if (tasks.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无任务</div>';
      return;
    }

    // Show max 30 per column
    const shown = tasks.slice(0, 30);
    list.innerHTML = shown.map(t => {
      const labels = Array.isArray(t.labels) ? t.labels : safeParseJSON(t.labels);
      return `
        <div class="task-card task-type-${esc(t.type)}">
          <div class="task-title">
            <a href="${esc(t.url)}" target="_blank" style="color: var(--text); text-decoration: none;">
              ${esc(truncate(t.title, 60))}
            </a>
          </div>
          <div class="task-meta">
            ${t.assignee ? `<span class="task-assignee">${esc(t.assignee)}</span>` : '<span class="task-unassigned">未分配</span>'}
            <span>${esc(t.project)}</span>
            <span>${t.type}</span>
            ${t.updated_at ? `<span>${timeAgo(t.updated_at)}</span>` : ''}
          </div>
          ${labels.length > 0 ? `
            <div style="margin-top: 4px;">
              ${labels.slice(0, 3).map(l => `<span class="task-label">${esc(l)}</span>`).join(' ')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    if (tasks.length > 30) {
      list.innerHTML += `<div style="text-align:center; color: var(--text-secondary); font-size: 12px; padding: 8px;">+${tasks.length - 30} more</div>`;
    }
  }
};

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}
