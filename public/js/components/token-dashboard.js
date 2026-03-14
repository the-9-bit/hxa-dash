// Token Consumption Attribution Dashboard (#93)
const TokenDashboard = {
  _data: null,
  _days: 7,
  _COLORS: ['#58a6ff', '#3fb950', '#bc8cff', '#f0883e', '#79c0ff', '#56d364', '#d2a8ff', '#f85149'],

  init() {
    document.querySelectorAll('[data-token-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._days = parseInt(btn.dataset.tokenPeriod);
        document.querySelectorAll('[data-token-period]').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
        this.fetch();
      });
    });

    window.addEventListener('resize', () => {
      if (this._data) this._render();
    });
  },

  async fetch() {
    const container = document.getElementById('token-chart');
    if (container) container.innerHTML = '<div class="trends-loading">加载中…</div>';

    try {
      const res = await window.fetch(`${BASE}/api/tokens?days=${this._days}`);
      if (!res.ok) throw new Error('fetch failed');
      this._data = await res.json();
      this._render();
    } catch {
      if (container) container.innerHTML = '<div class="trends-empty">数据加载失败</div>';
    }
  },

  _render() {
    if (!this._data) return;
    this._renderSummary();
    this._renderChart();
    this._renderAgentTable();
    this._renderCostPie();
  },

  _renderSummary() {
    const el = document.getElementById('token-summary');
    if (!el) return;
    const s = this._data.summary;

    const fmt = (n) => {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(n);
    };

    el.innerHTML = `
      <div class="token-stat">
        <div class="token-stat-value">${fmt(s.total_tokens)}</div>
        <div class="token-stat-label">总 Tokens</div>
      </div>
      <div class="token-stat">
        <div class="token-stat-value">$${s.total_cost_usd.toFixed(2)}</div>
        <div class="token-stat-label">总费用</div>
      </div>
      <div class="token-stat">
        <div class="token-stat-value">${fmt(s.avg_daily_tokens)}</div>
        <div class="token-stat-label">日均 Tokens</div>
      </div>
      <div class="token-stat">
        <div class="token-stat-value">$${s.avg_daily_cost_usd.toFixed(2)}</div>
        <div class="token-stat-label">日均费用</div>
      </div>
      <div class="token-stat">
        <div class="token-stat-value">${fmt(s.total_input)}</div>
        <div class="token-stat-label">输入 Tokens</div>
      </div>
      <div class="token-stat">
        <div class="token-stat-value">${fmt(s.total_output)}</div>
        <div class="token-stat-label">输出 Tokens</div>
      </div>
    `;
  },

  _renderChart() {
    const container = document.getElementById('token-chart');
    if (!container) return;

    const daily = this._data.daily;
    const W = Math.max(container.clientWidth || 600, 300);
    const H = 200;

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

    const pad = { top: 16, right: 16, bottom: 32, left: 50 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const n = daily.length;
    if (n === 0) return;

    const maxVal = Math.max(1, ...daily.map(d => d.input + d.output));
    const xPos = i => pad.left + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
    const yPos = v => pad.top + cH - (v / maxVal) * cH;

    // Grid
    ctx.lineWidth = 1;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (i / 4) * cH;
      ctx.strokeStyle = 'rgba(48,54,61,0.9)';
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cW, y);
      ctx.stroke();
      ctx.fillStyle = '#8b949e';
      const val = (i / 4) * maxVal;
      ctx.fillText(val >= 1e6 ? (val / 1e6).toFixed(1) + 'M' : (val / 1e3).toFixed(0) + 'K', pad.left - 4, y + 3.5);
    }

    // X-axis labels
    const step = n <= 7 ? 1 : n <= 14 ? 2 : 5;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b949e';
    for (let i = 0; i < n; i++) {
      if (i % step !== 0 && i !== n - 1) continue;
      ctx.fillText(daily[i].date.slice(5), xPos(i), H - 6);
    }

    // Stacked area: output on top of input
    // Input area (bottom)
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(0));
    for (let i = 0; i < n; i++) ctx.lineTo(xPos(i), yPos(daily[i].input));
    ctx.lineTo(xPos(n - 1), pad.top + cH);
    ctx.lineTo(xPos(0), pad.top + cH);
    ctx.closePath();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    ctx.globalAlpha = 1;

    // Output area (stacked on top)
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(daily[0].input));
    for (let i = 0; i < n; i++) ctx.lineTo(xPos(i), yPos(daily[i].input + daily[i].output));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xPos(i), yPos(daily[i].input));
    ctx.closePath();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#bc8cff';
    ctx.fill();
    ctx.globalAlpha = 1;

    // Input line
    ctx.beginPath();
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(xPos(i), yPos(daily[i].input));
      else ctx.lineTo(xPos(i), yPos(daily[i].input));
    }
    ctx.stroke();

    // Total line (input + output)
    ctx.beginPath();
    ctx.strokeStyle = '#bc8cff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const total = daily[i].input + daily[i].output;
      if (i === 0) ctx.moveTo(xPos(i), yPos(total));
      else ctx.lineTo(xPos(i), yPos(total));
    }
    ctx.stroke();
  },

  _renderAgentTable() {
    const el = document.getElementById('token-agent-table');
    if (!el) return;

    const agents = this._data.agents;
    if (!agents.length) {
      el.innerHTML = '<div class="trends-empty">暂无数据</div>';
      return;
    }

    const maxTotal = agents[0]?.total || 1;
    const fmt = (n) => {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(n);
    };

    el.innerHTML = `
      <table class="token-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th>输入</th>
            <th>输出</th>
            <th>总计</th>
            <th>费用</th>
            <th>占比</th>
          </tr>
        </thead>
        <tbody>
          ${agents.map((a, i) => {
            const pct = ((a.total / (this._data.summary.total_tokens || 1)) * 100).toFixed(1);
            const barW = (a.total / maxTotal * 100).toFixed(1);
            return `<tr>
              <td class="token-rank">${i + 1}</td>
              <td class="token-agent-name">
                <span class="token-agent-dot" style="background:${this._COLORS[i % this._COLORS.length]}"></span>
                ${esc(a.name)}
              </td>
              <td>${fmt(a.input)}</td>
              <td>${fmt(a.output)}</td>
              <td><strong>${fmt(a.total)}</strong></td>
              <td>$${a.cost_usd.toFixed(2)}</td>
              <td>
                <div class="token-bar-cell">
                  <div class="token-bar" style="width:${barW}%;background:${this._COLORS[i % this._COLORS.length]}"></div>
                  <span>${pct}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  _renderCostPie() {
    const container = document.getElementById('token-cost-pie');
    if (!container) return;

    const agents = this._data.agents;
    if (!agents.length) {
      container.innerHTML = '<div class="trends-empty">暂无数据</div>';
      return;
    }

    const size = Math.min(container.clientWidth || 200, 200);
    let canvas = container.querySelector('canvas');
    if (!canvas) {
      container.innerHTML = '';
      canvas = document.createElement('canvas');
      container.appendChild(canvas);
    }
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    const innerR = r * 0.55;
    const totalCost = this._data.summary.total_cost_usd || 1;

    let startAngle = -Math.PI / 2;

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const slice = (a.cost_usd / totalCost) * Math.PI * 2;
      const endAngle = startAngle + slice;

      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = this._COLORS[i % this._COLORS.length];
      ctx.fill();

      startAngle = endAngle;
    }

    // Center text
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${totalCost.toFixed(0)}`, cx, cy - 6);
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(`${this._days}天`, cx, cy + 10);
  }
};
