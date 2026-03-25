// Member Output Component — per-agent time-series output visualization (#127)
const MemberOutput = {
  _cache: new Map(), // name -> { data, fetchedAt }
  CACHE_TTL: 60000,  // 1 min

  async fetch(agentName, days = 30) {
    const cached = this._cache.get(agentName);
    if (cached && (Date.now() - cached.fetchedAt) < this.CACHE_TTL) return cached.data;

    try {
      const res = await fetch(`${BASE}/api/team/${encodeURIComponent(agentName)}/output?days=${days}`);
      if (!res.ok) return null;
      const data = await res.json();
      this._cache.set(agentName, { data, fetchedAt: Date.now() });
      return data;
    } catch { return null; }
  },

  // Render output section HTML for the detail drawer
  renderSection(data) {
    if (!data || !data.buckets || data.buckets.length === 0) {
      return '<div class="drawer-section"><h4>产出趋势</h4><div class="output-empty">暂无数据</div></div>';
    }

    const s = data.summary;
    const changeHTML = s.change_pct != null
      ? `<span class="output-change ${s.change_pct >= 0 ? 'up' : 'down'}">${s.change_pct >= 0 ? '↑' : '↓'} ${Math.abs(s.change_pct)}%</span>`
      : '';

    return `
      <div class="drawer-section output-section">
        <h4>产出趋势 <span class="output-period">${data.days}天</span> ${changeHTML}</h4>

        <div class="output-summary-grid">
          <div class="output-stat"><span class="output-stat-num">${s.total_events}</span><span class="output-stat-label">活动</span></div>
          <div class="output-stat"><span class="output-stat-num">${s.issues_closed}</span><span class="output-stat-label">Issue</span></div>
          <div class="output-stat"><span class="output-stat-num">${s.mrs_merged}</span><span class="output-stat-label">MR</span></div>
          <div class="output-stat"><span class="output-stat-num">${s.commits}</span><span class="output-stat-label">Commit</span></div>
          <div class="output-stat"><span class="output-stat-num">${s.comments}</span><span class="output-stat-label">评论</span></div>
          <div class="output-stat"><span class="output-stat-num output-health">${s.health_score}</span><span class="output-stat-label">健康分</span></div>
        </div>

        <div class="output-chart-label">每日活动量</div>
        ${this._renderActivityChart(data.buckets)}

        <div class="output-chart-label">产出分类</div>
        ${this._renderBreakdownChart(data.buckets)}
      </div>
    `;
  },

  // SVG sparkline for daily event counts
  _renderActivityChart(buckets) {
    const vals = buckets.map(b => b.events);
    return this._svgLine(vals, 'var(--accent)', 120, true);
  },

  // Stacked bar breakdown
  _renderBreakdownChart(buckets) {
    const w = 280, h = 60, pad = 2;
    const barW = Math.max(2, (w - pad * buckets.length) / buckets.length);
    const maxVal = Math.max(...buckets.map(b => b.commits + b.issues_closed + b.mrs_merged + b.comments), 1);

    const bars = buckets.map((b, i) => {
      const x = i * (barW + pad);
      const total = b.commits + b.issues_closed + b.mrs_merged + b.comments;
      const scale = h / maxVal;
      let y = h;
      const segs = [];
      const draw = (val, color) => {
        if (val <= 0) return;
        const segH = val * scale;
        y -= segH;
        segs.push(`<rect x="${x}" y="${y}" width="${barW}" height="${segH}" fill="${color}" rx="1"/>`);
      };
      draw(b.commits, '#bc8cff');
      draw(b.mrs_merged, '#58a6ff');
      draw(b.issues_closed, '#3fb950');
      draw(b.comments, '#f0883e');
      return segs.join('');
    }).join('');

    return `
      <svg class="output-breakdown-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${bars}
      </svg>
      <div class="output-legend">
        <span class="output-legend-item"><span class="output-dot" style="background:#3fb950"></span>Issue</span>
        <span class="output-legend-item"><span class="output-dot" style="background:#58a6ff"></span>MR</span>
        <span class="output-legend-item"><span class="output-dot" style="background:#bc8cff"></span>Commit</span>
        <span class="output-legend-item"><span class="output-dot" style="background:#f0883e"></span>评论</span>
      </div>
    `;
  },

  // Reusable SVG line chart
  _svgLine(values, color, height = 40, fill = false) {
    if (!values.length) return '';
    const w = 280, h = height;
    const max = Math.max(...values, 1);
    const points = values.map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    });

    const fillPath = fill
      ? `<path d="M0,${h} L${points.join(' L')} L${w},${h} Z" fill="${color}" opacity="0.15"/>`
      : '';

    return `
      <svg class="output-line-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${fillPath}
        <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  },

  // Mini sparkline for agent cards (7-day, inline SVG)
  renderMiniSparkline(values) {
    if (!values || values.length === 0 || values.every(v => v === 0)) return '';
    const w = 60, h = 16;
    const max = Math.max(...values, 1);
    const points = values.map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    });

    return `<svg class="card-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${points.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
};
