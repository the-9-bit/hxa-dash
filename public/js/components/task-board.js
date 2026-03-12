// Task Board Component
const TaskBoard = {
  init() {},

  render(board) {
    this.renderColumn('todo', board.todo || []);
    this.renderColumn('doing', board.doing || []);
    this.renderColumn('done', board.done || []);
  },

  renderColumn(state, tasks) {
    const list = document.getElementById(`${state}-list`);
    const count = document.getElementById(`${state}-count`);
    if (!list) return;

    count.textContent = tasks.length;

    // Show max 20 per column
    const shown = tasks.slice(0, 20);
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
            ${t.assignee ? `<span>${esc(t.assignee)}</span>` : ''}
            <span>${esc(t.project)}</span>
            <span>${t.type}</span>
          </div>
          ${labels.length > 0 ? `
            <div style="margin-top: 4px;">
              ${labels.slice(0, 3).map(l => `<span class="task-label">${esc(l)}</span>`).join(' ')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    if (tasks.length > 20) {
      list.innerHTML += `<div style="text-align:center; color: var(--text-secondary); font-size: 12px; padding: 8px;">+${tasks.length - 20} more</div>`;
    }
  }
};

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}
