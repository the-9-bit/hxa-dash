// MR Pipeline Board + Review Bottleneck Alert (#109 + #110)
const MRBoard = {
  _data: null,
  _refreshTimer: null,

  init() {
    this.fetch();
    this._refreshTimer = setInterval(() => this.fetch(), 30000);
  },

  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  async fetch() {
    try {
      const res = await fetch(`${BASE}/api/mr-board`);
      if (!res.ok) return;
      this._data = await res.json();
      this.render();
    } catch (err) {
      console.error('[MRBoard] Fetch error:', err);
    }
  },

  render() {
    if (!this._data) return;
    const { mrs, summary } = this._data;

    this._renderSummary(summary);
    this._renderList(mrs);
  },

  _renderSummary(s) {
    const el = document.getElementById('mr-board-summary');
    if (!el) return;

    const pip = s.pipeline;
    el.innerHTML = `
      <div class="mrb-stat">
        <span class="mrb-stat-num">${s.total}</span>
        <span class="mrb-stat-label">Open MRs</span>
      </div>
      <div class="mrb-stat mrb-stat-success">
        <span class="mrb-stat-num">${pip.success}</span>
        <span class="mrb-stat-label">Pipeline Pass</span>
      </div>
      <div class="mrb-stat mrb-stat-running">
        <span class="mrb-stat-num">${pip.running + pip.pending}</span>
        <span class="mrb-stat-label">Running</span>
      </div>
      <div class="mrb-stat mrb-stat-failed">
        <span class="mrb-stat-num">${pip.failed}</span>
        <span class="mrb-stat-label">Failed</span>
      </div>
      ${s.bottlenecks > 0 ? `
      <div class="mrb-stat mrb-stat-alert">
        <span class="mrb-stat-num">${s.bottlenecks}</span>
        <span class="mrb-stat-label">Bottleneck${s.bottlenecks > 1 ? 's' : ''}</span>
      </div>` : ''}
    `;
  },

  _renderList(mrs) {
    const el = document.getElementById('mr-board-list');
    if (!el) return;

    if (!mrs.length) {
      el.innerHTML = '<div class="mrb-empty">No open MRs</div>';
      return;
    }

    el.innerHTML = mrs.map(mr => this._renderCard(mr)).join('');
  },

  _renderCard(mr) {
    const pipeIcon = this._pipelineIcon(mr.pipeline.status);
    const pipeClass = this._pipelineClass(mr.pipeline.status);
    const bottleneckBadge = mr.bottleneck
      ? `<span class="mrb-bottleneck mrb-bottleneck-${mr.bottleneck.level}" title="${this._bottleneckReason(mr.bottleneck.reason)}">
          ${mr.bottleneck.level === 'critical' ? '🔴' : '🟡'} ${this._bottleneckLabel(mr.bottleneck)}
        </span>`
      : '';

    const reviewerList = mr.reviewers.length > 0
      ? mr.reviewers.map(r => `<span class="mrb-reviewer">${esc(r)}</span>`).join('')
      : '<span class="mrb-no-reviewer">No reviewer</span>';

    const suggestedHtml = mr.suggestedReviewers.length > 0
      ? `<div class="mrb-suggested">
          <span class="mrb-suggested-label">Suggested:</span>
          ${mr.suggestedReviewers.map(r => `<span class="mrb-suggested-name">${esc(r)}</span>`).join('')}
        </div>`
      : '';

    const draftBadge = mr.draft ? '<span class="mrb-draft">Draft</span>' : '';
    const conflictBadge = mr.hasConflicts ? '<span class="mrb-conflict">Conflict</span>' : '';

    const waitStr = this._formatWait(mr.waitMinutes);
    const idleStr = mr.idleMinutes > 0 ? `idle ${this._formatWait(mr.idleMinutes)}` : '';

    const pipelineLink = mr.pipeline.url
      ? `<a href="${esc(mr.pipeline.url)}" target="_blank" class="mrb-pipe-link ${pipeClass}" title="${mr.pipeline.status}">${pipeIcon}</a>`
      : `<span class="mrb-pipe-badge ${pipeClass}" title="${mr.pipeline.status}">${pipeIcon}</span>`;

    return `
      <div class="mrb-card ${mr.bottleneck ? 'mrb-card-' + mr.bottleneck.level : ''}">
        <div class="mrb-card-header">
          ${pipelineLink}
          <a href="${esc(mr.url)}" target="_blank" class="mrb-title">!${mr.iid} ${esc(truncate(mr.title, 60))}</a>
          ${draftBadge}${conflictBadge}${bottleneckBadge}
        </div>
        <div class="mrb-card-meta">
          <span class="mrb-project">${esc(mr.project)}</span>
          <span class="mrb-author">${esc(mr.author || '?')}</span>
          <span class="mrb-sep">→</span>
          ${reviewerList}
        </div>
        <div class="mrb-card-footer">
          <span class="mrb-wait" title="Total open time">${waitStr}</span>
          ${idleStr ? `<span class="mrb-idle" title="Time since last update">${idleStr}</span>` : ''}
          ${mr.labels.length > 0 ? `<span class="mrb-labels">${mr.labels.slice(0, 3).map(l => `<span class="mrb-label">${esc(l)}</span>`).join('')}</span>` : ''}
        </div>
        ${suggestedHtml}
      </div>
    `;
  },

  _pipelineIcon(status) {
    switch (status) {
      case 'success': return '✅';
      case 'failed': return '❌';
      case 'running': return '🔄';
      case 'pending': return '⏳';
      case 'canceled': return '⛔';
      case 'none': return '⚪';
      default: return '❓';
    }
  },

  _pipelineClass(status) {
    switch (status) {
      case 'success': return 'pipe-success';
      case 'failed': return 'pipe-failed';
      case 'running':
      case 'pending': return 'pipe-running';
      default: return 'pipe-unknown';
    }
  },

  _bottleneckReason(reason) {
    switch (reason) {
      case 'no_reviewer': return 'No reviewer assigned';
      case 'idle_30m': return 'No activity for 30+ minutes';
      case 'idle_60m': return 'No activity for 60+ minutes';
      default: return reason;
    }
  },

  _bottleneckLabel(bn) {
    if (bn.reason === 'no_reviewer') return 'No Reviewer';
    if (bn.level === 'critical') return 'Stale 60m+';
    return 'Stale 30m+';
  },

  _formatWait(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h < 24) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
};
