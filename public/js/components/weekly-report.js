// Weekly Report Export Component (#60)
// Generates a Markdown weekly report and triggers browser download.
const WeeklyReport = {

  async export() {
    const btn = document.getElementById('weekly-report-export-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '生成中…';
    }

    try {
      // Fetch all required data in parallel
      const [teamRes, summaryRes, workloadRes, blockersRes, graphRes] = await Promise.all([
        fetch(`${BASE}/api/team`),
        fetch(`${BASE}/api/report/summary?days=7`),
        fetch(`${BASE}/api/stats/workload?days=7`),
        fetch(`${BASE}/api/blockers`),
        fetch(`${BASE}/api/graph`)
      ]);

      const teamData     = teamRes.ok     ? await teamRes.json()     : { agents: [], stats: {} };
      const summaryData  = summaryRes.ok  ? await summaryRes.json()  : { summary: {} };
      const workloadData = workloadRes.ok ? await workloadRes.json() : { agents: [] };
      const blockersData = blockersRes.ok ? await blockersRes.json() : { blockers: [] };
      const graphData    = graphRes.ok    ? await graphRes.json()    : { nodes: [], edges: [] };

      const md = this._buildMarkdown(teamData, summaryData, workloadData, blockersData, graphData);
      this._download(md);
    } catch (err) {
      console.error('[WeeklyReport] export failed:', err);
      alert('导出失败，请检查网络连接后重试。');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '导出周报';
      }
    }
  },

  _buildMarkdown(teamData, summaryData, workloadData, blockersData, graphData) {
    const now = new Date();
    // Week ending today
    const dateStr = this._fmtDate(now);
    // Week starting 7 days ago
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekRange = `${this._fmtDate(weekStart)} ~ ${dateStr}`;

    const s = summaryData.summary || {};
    const agents = teamData.agents || [];
    const workloadAgents = workloadData.agents || [];
    const blockers = blockersData.blockers || [];
    const edges = graphData.edges || [];

    const lines = [];

    // Title
    lines.push(`# HxA-K 团队周报 ${dateStr}`);
    lines.push('');
    lines.push(`> 统计周期：${weekRange}`);
    lines.push('');

    // 1. Team overview
    lines.push('## 团队概况');
    lines.push('');
    const totalAgents = agents.length;
    const onlineAgents = agents.filter(a => a.online).length;
    const offlineAgents = totalAgents - onlineAgents;
    lines.push(`- **成员总数**：${totalAgents} 人（在线 ${onlineAgents} / 离线 ${offlineAgents}）`);
    lines.push(`- **本周完成任务**：${s.completed_in_period ?? '—'} 项`);
    lines.push(`- **当前开放任务**：${s.total_open_tasks ?? '—'} 项`);
    lines.push(`- **团队利用率**：${s.utilization_pct != null ? s.utilization_pct + '%' : '—'}`);
    lines.push(`- **本周事件总数**：${s.total_events ?? '—'}`);
    if (s.bottleneck) {
      lines.push(`- **瓶颈 Agent**：${s.bottleneck.agent}（${s.bottleneck.open_tasks} 项开放任务）`);
    }
    lines.push('');

    // 2. Per-member output
    lines.push('## 本周产出');
    lines.push('');

    if (workloadAgents.length === 0) {
      lines.push('暂无数据。');
    } else {
      // Sort by total_events desc
      const sorted = [...workloadAgents].sort((a, b) => (b.total_events || 0) - (a.total_events || 0));
      for (const agent of sorted) {
        const statusMark = agent.online ? '🟢' : '⚫';
        lines.push(`### ${statusMark} ${agent.name}`);
        lines.push('');
        lines.push(`- 关闭 Issue：${agent.closed_issues ?? 0}`);
        lines.push(`- 合并 MR：${agent.merged_mrs ?? 0}`);
        lines.push(`- 提交数：${agent.commits ?? 0}`);
        lines.push(`- 评论数：${agent.comments ?? 0}`);
        lines.push(`- 总活动：${agent.total_events ?? 0}`);
        lines.push('');
      }
    }

    // 3. Blockers
    lines.push('## 本周卡点');
    lines.push('');

    const weekBlockers = blockers.filter(b => b.type === 'stale_issue' || b.type === 'unreviewed_mr');
    if (weekBlockers.length === 0) {
      lines.push('本周无明显卡点。');
    } else {
      for (const b of weekBlockers) {
        const label = b.type_label || b.type;
        const assignee = b.assignee ? `（负责人：${b.assignee}）` : '';
        const project = b.project ? ` [${b.project}]` : '';
        const staleInfo = b.stale_hours != null ? `，已停滞 ${Math.round(b.stale_hours)} 小时` : '';
        const link = b.url ? ` — [查看](${b.url})` : '';
        lines.push(`- **[${label}]**${project} ${b.title}${assignee}${staleInfo}${link}`);
      }
    }

    const idleAgents = blockers.filter(b => b.type === 'silent_agent');
    if (idleAgents.length > 0) {
      lines.push('');
      lines.push('**失联 Agent：**');
      for (const a of idleAgents) {
        lines.push(`- ${a.title}（${Math.round(a.stale_hours ?? 0)} 小时无心跳）`);
      }
    }
    lines.push('');

    // 4. Collaboration highlights
    lines.push('## 协作亮点');
    lines.push('');

    if (edges.length === 0) {
      lines.push('本周暂无协作记录。');
    } else {
      // Top 5 pairs by weight
      const sortedEdges = [...edges].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 5);
      lines.push('本周协作最频繁的成员组合：');
      lines.push('');
      for (const e of sortedEdges) {
        const typeLabel = { review: 'Code Review', issue: 'Issue 协作', project: '同项目协作' }[e.type] || e.type;
        lines.push(`- **${e.source}** × **${e.target}** — ${typeLabel}，协作 ${e.weight} 次`);
      }
    }
    lines.push('');

    // Footer
    lines.push('---');
    lines.push('');
    lines.push(`*由 HxA Dash 自动生成 · ${now.toLocaleString('zh-CN', { hour12: false })}*`);

    return lines.join('\n');
  },

  _fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _download(content) {
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `hxa-weekly-report-${this._fmtDate(new Date())}.md`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
