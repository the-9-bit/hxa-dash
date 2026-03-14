// Task Board Component (v4: keyed DOM updates to prevent flicker)
const TaskBoard = {
  // Track previous state for change detection
  _prevCounts: {},

  _ESTIMATE_INFO: {
    S:  { sessions: 0.5, minutes: 20,  label: '~20 min' },
    M:  { sessions: 1,   minutes: 45,  label: '~45 min' },
    L:  { sessions: 2,   minutes: 90,  label: '~90 min' },
    XL: { sessions: 4,   minutes: 180, label: '~3 hrs' },
  },

  _estimateTooltip(est) {
    const info = this._ESTIMATE_INFO[est];
    return info ? `${est}: ${info.sessions} session(s), ${info.label}` : est;
  },

  init() {},

  // Render to a specific page prefix (overview or tasks)
  renderTo(prefix, board) {
    const isOverview = prefix === 'overview';
    const p = isOverview ? 'overview-' : '';

    this.renderColumn(`${p}todo`, board.todo || [], 'todo');
    this.renderColumn(`${p}doing`, board.doing || [], 'doing');
    this.renderColumn(`${p}done`, board.done || [], 'done');
  },

  _buildCardHTML(t, i, isNew, colType) {
    const labels = Array.isArray(t.labels) ? t.labels : safeParseJSON(t.labels);
    const isDone = colType === 'done' && isNew;
    const extraClass = isDone ? ' task-done-flash' : '';
    const delay = `animation-delay: ${i * 30}ms;`;
    const estimateBadge = t.estimate
      ? `<span class="estimate-badge estimate-${esc(t.estimate.toLowerCase())}" title="${TaskBoard._estimateTooltip(t.estimate)}">${esc(t.estimate)}</span>`
      : '';
    return `
      <div class="task-card task-type-${esc(t.type)}${extraClass}" data-task-id="${esc(String(t.id))}" style="${delay}">
        <div class="task-title">
          ${estimateBadge}
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
  },

  renderColumn(stateId, tasks, colType) {
    const list = document.getElementById(`${stateId}-list`);
    const count = document.getElementById(`${stateId}-count`);
    if (!list) return;

    // Detect count change for pulse animation
    const prevCount = this._prevCounts[stateId];
    if (count) {
      count.textContent = tasks.length;
      if (prevCount !== undefined && prevCount !== tasks.length) {
        count.classList.remove('count-changed');
        void count.offsetWidth;
        count.classList.add('count-changed');
      }
    }
    this._prevCounts[stateId] = tasks.length;

    if (tasks.length === 0) {
      if (list.querySelector('.empty-state') && list.children.length === 1) return;
      list.innerHTML = '<div class="empty-state">暂无任务</div>';
      return;
    }

    const shown = tasks.slice(0, 30);
    const newIds = shown.map(t => String(t.id));

    // Build map of existing DOM cards
    const existingCards = new Map();
    list.querySelectorAll('.task-card[data-task-id]').forEach(el => {
      existingCards.set(el.dataset.taskId, el);
    });

    // Keyed update: reuse existing cards, only add/remove/reorder as needed
    const fragment = document.createDocumentFragment();
    const prevIdSet = new Set(existingCards.keys());

    for (let i = 0; i < shown.length; i++) {
      const t = shown[i];
      const id = String(t.id);
      const existing = existingCards.get(id);

      if (existing) {
        // Update mutable fields in-place (timeAgo, labels, assignee)
        const metaEl = existing.querySelector('.task-meta');
        if (metaEl && t.updated_at) {
          const spans = metaEl.querySelectorAll('span');
          const lastSpan = spans[spans.length - 1];
          if (lastSpan) lastSpan.textContent = timeAgo(t.updated_at);
        }
        fragment.appendChild(existing);
      } else {
        // New card — create from HTML
        const isNew = prevIdSet.size > 0;
        const tmp = document.createElement('div');
        tmp.innerHTML = this._buildCardHTML(t, i, isNew, colType);
        fragment.appendChild(tmp.firstElementChild);
      }
    }

    // Remove overflow indicator if present
    const overflow = list.querySelector('.task-overflow');
    if (overflow) overflow.remove();

    // Replace children without full innerHTML (prevents flicker)
    list.replaceChildren(fragment);

    if (tasks.length > 30) {
      const more = document.createElement('div');
      more.className = 'task-overflow';
      more.style.cssText = 'text-align:center; color: var(--text-secondary); font-size: 12px; padding: 8px;';
      more.textContent = `+${tasks.length - 30} more`;
      list.appendChild(more);
    }
  }
};

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}
