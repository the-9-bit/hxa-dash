// Performance Trends Component — daily completed tasks + activity heatmap (#47)
const TrendsChart = {
  _data: null,
  _period: 14,
  _mode: 'team',   // 'team' | 'individual'
  _COLORS: ['#58a6ff', '#3fb950', '#bc8cff', '#f0883e', '#79c0ff', '#56d364', '#d2a8ff'],
  _DAY_LABELS: ['日', '一', '二', '三', '四', '五', '六'],

  init() {
    // Period selector
    document.querySelectorAll('[data-trends-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._period = parseInt(btn.dataset.trendsPeriod);
        document.querySelectorAll('[data-trends-period]').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
        this.fetch();
      });
    });

    // Mode toggle (team / individual)
    document.querySelectorAll('[data-trends-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.trendsMode;
        document.querySelectorAll('[data-trends-mode]').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
        this._render();
      });
    });

    // Re-render on resize (responsive canvas)
    window.addEventListener('resize', () => {
      if (this._data) this._render();
    });

    this.fetch();
  },

  async fetch() {
    const chartEl = document.getElementById('trends-line-chart');
    if (chartEl) chartEl.innerHTML = '<div class="trends-loading">加载中…</div>';

    try {
      const res = await fetch(`${BASE}/api/trends?days=${this._period}`);
      if (!res.ok) throw new Error('fetch failed');
      this._data = await res.json();
      this._render();
    } catch {
      const el = document.getElementById('trends-line-chart');
      if (el) el.innerHTML = '<div class="trends-empty">数据加载失败</div>';
    }
  },

  _render() {
    if (!this._data) return;
    this._renderLine();
    this._renderHeatmap();
  },

  _renderLine() {
    const container = document.getElementById('trends-line-chart');
    if (!container) return;

    const { labels, team, agents } = this._data;
    const W = Math.max(container.clientWidth || 600, 300);
    const H = 180;

    // Canvas
    let canvas = container.querySelector('canvas');
    if (!canvas) {
      container.innerHTML = '';
      canvas = document.createElement('canvas');
      container.appendChild(canvas);
    }
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 16, right: 16, bottom: 32, left: 36 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    // Build series
    let series;
    if (this._mode === 'team' || Object.keys(agents).length === 0) {
      series = [{ name: '团队', data: team, color: this._COLORS[0] }];
    } else {
      series = Object.entries(agents).map(([name, data], i) => ({
        name,
        data,
        color: this._COLORS[i % this._COLORS.length]
      }));
    }

    const maxVal = Math.max(1, ...series.map(s => Math.max(...s.data)));
    const n = labels.length;

    const xPos = i => pad.left + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
    const yPos = v => pad.top + cH - (v / maxVal) * cH;

    // Grid lines + y-axis labels
    ctx.lineWidth = 1;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = pad.top + cH - (i / gridSteps) * cH;
      ctx.strokeStyle = 'rgba(48,54,61,0.9)';
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cW, y);
      ctx.stroke();
      ctx.fillStyle = '#8b949e';
      ctx.fillText(Math.round((i / gridSteps) * maxVal), pad.left - 4, y + 3.5);
    }

    // X-axis labels (date: MM-DD)
    const step = n <= 7 ? 1 : n <= 14 ? 2 : 5;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b949e';
    for (let i = 0; i < n; i++) {
      if (i % step !== 0 && i !== n - 1) continue;
      ctx.fillText(labels[i].slice(5), xPos(i), H - 6);
    }

    // Series lines + area fills
    for (const s of series) {
      // Area fill
      ctx.beginPath();
      ctx.moveTo(xPos(0), yPos(0));
      for (let i = 0; i < n; i++) ctx.lineTo(xPos(i), yPos(s.data[i]));
      ctx.lineTo(xPos(n - 1), pad.top + cH);
      ctx.lineTo(xPos(0), pad.top + cH);
      ctx.closePath();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Line
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(xPos(i), yPos(s.data[i]));
        else ctx.lineTo(xPos(i), yPos(s.data[i]));
      }
      ctx.stroke();

      // Data point dots (only for 7-day view where spacing is wide)
      if (n <= 7) {
        ctx.fillStyle = s.color;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(xPos(i), yPos(s.data[i]), 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Update legend
    this._updateLegend(series);
  },

  _updateLegend(series) {
    const legendEl = document.getElementById('trends-line-legend');
    if (!legendEl) return;
    if (this._mode === 'team' || series.length <= 1) {
      legendEl.innerHTML = '';
      return;
    }
    legendEl.innerHTML = series.map(s =>
      `<span class="trends-legend-item">` +
      `<span class="trends-legend-dot" style="background:${s.color}"></span>` +
      `${esc(s.name)}</span>`
    ).join('');
  },

  _renderHeatmap() {
    const container = document.getElementById('trends-heatmap');
    if (!container || !this._data?.heatmap) return;

    const heatmap = this._data.heatmap;
    const maxVal = Math.max(1, ...heatmap.flat());

    let html = '<div class="heatmap-grid">';

    // Hour header row
    html += '<div class="heatmap-row"><div class="heatmap-day-label"></div>';
    for (let h = 0; h < 24; h++) {
      html += `<div class="heatmap-hour-label">${h % 6 === 0 ? h + 'h' : ''}</div>`;
    }
    html += '</div>';

    // Data rows (0=Sun … 6=Sat, but display Mon-Sun order for readability)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun
    for (const d of dayOrder) {
      html += `<div class="heatmap-row"><div class="heatmap-day-label">${this._DAY_LABELS[d]}</div>`;
      for (let h = 0; h < 24; h++) {
        const v = heatmap[d][h];
        const intensity = v / maxVal;
        const bg = v === 0
          ? 'rgba(48,54,61,0.4)'
          : `rgba(88,166,255,${(0.12 + intensity * 0.78).toFixed(2)})`;
        const tip = `${['日','一','二','三','四','五','六'][d]} ${String(h).padStart(2,'0')}:00 — ${v} 次活动`;
        html += `<div class="heatmap-cell" style="background:${bg}" title="${tip}"></div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    container.innerHTML = html;
  }
};
