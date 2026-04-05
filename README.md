# HxA Dash

**Human-Agent Team Collaboration Dashboard** — part of the HxA suite.

Visualize and quantify the division of work, status, workflows, and task progress in human-agent teams.

---

## Core Concept

**Dual value:**
- **For humans**: Work visualization provides **peace of mind** — see what agents are doing, what they've done, and what's next at any time
- **For agents**: More **information** enables **effective collaboration** — understand team status to make better decisions

HxA Dash is not just a monitoring panel — it's a shared information hub for human-agent teams.

---

## Feature Modules

### 1. Team Member Cards (HxA Card Wall)

Displays real-time status for all team members (Human + Agent).

- **Online status**: Online / Offline (driven by heartbeat, 30-minute timeout)
- **Work status**: Busy (has in-progress tasks) / Idle (online but no tasks) / Offline
- **Identity badge**: Human / Agent (determined by `entities.json` `kind` field)
- **Role & bio**: Configured in `entities.json`, data from Connect API takes priority
- **Task summary**: Number of assigned open issues + in-progress task titles
- **Health score**: 0–100 (see algorithm below)
- **Historical stats**: Tasks completed in last 7/30 days, average completion time
- **Collaboration partners**: Most frequent collaborators

**Click a card** to open a detail drawer showing: current task list (links to GitLab), recent activity timeline, collaboration details.

---

### 2. Task Board

Three-column kanban: **To Do / In Progress / Done**

- Data source: GitLab Issues + MRs (polled every 5 minutes)
- Supports project filtering
- Incremental real-time updates (fingerprint diff, no screen flicker)

---

### 3. Activity Timeline

Displays recent activities in reverse chronological order: issue creation/closure, MR submissions/merges, commits, comments.

- Supports Webhook real-time push (GitLab System Hook) + polling dual-driver
- Automatic deduplication

---

### 4. Collaboration Graph

Visualizes collaboration intensity between members (shared issues/MRs).

- Node size = task participation count
- Edge thickness = collaboration frequency
- Supports project filtering
- Filters nodes with no contributions

---

### 5. Collaboration Heatmap Matrix

Table-format heatmap showing pairwise collaboration frequency between all members.

---

### 6. Performance Trends

- **Daily activity bar chart**: Tasks completed per day (past 7 days)
- **Activity heatmap**: Daily activity levels over the past 4 weeks
- **Filter by agent**

---

### 7. Workload Report

Productivity metrics table for each member:

| Metric | Description |
|--------|-------------|
| Closed Issues | Issues closed within the period |
| Merged MRs | MRs merged within the period |
| Bar chart | Relative workload visualization |

Supports JSON export.

---

### 8. Blocker Detection Panel

Automatically identifies team blockers:

- **Stale issues**: Open for more than 7 days without updates
- **Pending review MRs**: Open MRs unreviewed for more than 2 days
- **Silent agents**: Online but no activity for over 24 hours

---

### 9. Action Suggestions Panel

Generates team action suggestions based on a rule engine:

| Rule | Trigger Condition | Priority |
|------|-------------------|----------|
| Rule 1 | MR waiting for review > 48h | High |
| Rule 2 | Issue open > 7 days without update | High |
| Rule 3 | Agent idle (online + 0 tasks) | Medium |
| Rule 4 | Agent overloaded (open tasks > 5) | Medium |
| Rule 5 | Unassigned issues exist | Low |
| Rule 6 | Idle rate >= 70% + unassigned issues | Low |
| Rule 7 | Weekly output dropped > 30% from previous week | High |
| Rule 8 | Median cycle time > 48h | Medium |

Recent auto-reassignment history is also displayed here.

---

### 10. Team Utilization & Output Metrics

Real-time team efficiency metrics:

| Metric | Calculation |
|--------|-------------|
| Idle rate | Proportion of online agents with 0 open tasks |
| 7-day issues closed | Issues with state=closed in last 7 days |
| 7-day MRs merged | MRs with state=merged in last 7 days |
| Median cycle time | Median (updated_at - created_at) for issues closed in last 30 days |
| 4-week trend | Weekly closed task counts (grouped by ISO week) |

Auto-refreshes every 5 minutes. Rules 6/7/8 are linked to this panel.

---

### 11. Auto-Assign Engine

When an agent goes offline for more than 30 minutes with open issues, tasks are automatically reassigned to idle agents:

- Checks every 5 minutes
- Maximum 3 tasks reassigned per cycle
- Sends notifications after execution (transparent and visible)
- Manual trigger via `POST /api/auto-assign/trigger`
- History via `GET /api/auto-assign/history`

---

### 12. My View (Personal Perspective `/api/my/:name`)

Agent-specific view API, returning:
- Currently assigned tasks (assignee only)
- MRs I participated in or created
- Recent event stream
- Current online and work status

---

## Health Score Algorithm

**Score: 0-100**, weighted across three dimensions:

| Dimension | Max Score | Logic |
|-----------|-----------|-------|
| Activity freshness | 40 | Last activity < 1h: 40; < 6h: 35; < 24h: 25; < 72h: 15; < 168h: 5; older: 0 |
| Completion rate | 30 | Closed tasks / total tasks (linear mapping 0-30) |
| Load balance | 30 | 0 tasks: 10; 1-3 tasks: 30; 4-5 tasks: 20; 6-8 tasks: 10; >8 tasks: 5 |

---

## Data Sources

| Data | Source | Update Frequency |
|------|--------|------------------|
| Member online status | Connect API (`/hub/agents`) | 30-second heartbeat |
| Issues / MRs | GitLab API (group + projects) | 5-minute polling |
| Real-time events | GitLab System Hook (Webhook) | Real-time push |
| Member identity config | `config/entities.json` | Manual |

### Data Flow

```
Connect API ──→ connectFetcher ─┐
                                ├──→ SQLite DB ──→ Express API ──→ Frontend
GitLab API ────→ gitlabFetcher ─┘
GitLab Webhook ──→ /api/report/webhook ──→ SQLite DB (real-time update)
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/team` | All member statuses (including health score, stats) |
| `GET /api/team/summary` | Team summary (online count, idle count, average health) |
| `GET /api/board` | Task board (issues + MRs grouped by status) |
| `GET /api/timeline` | Activity timeline |
| `GET /api/stats/timeline` | Agent activity histogram |
| `GET /api/stats/trends` | Team productivity trends |
| `GET /api/stats/agents` | Per-member 30-day detailed stats |
| `GET /api/stats/workload` | Workload report |
| `GET /api/my/:name` | Personal view (current tasks, activity) |
| `GET /api/blockers` | Blocker detection (stale issues, pending review MRs, silent agents) |
| `GET /api/auto-assign/history` | Auto-reassignment history |
| `POST /api/auto-assign/trigger` | Manually trigger reassignment |
| `GET /api/metrics` | Team utilization and output metrics |
| `GET /api/graph` | Collaboration graph (supports `?project=` filter) |
| `POST /api/report/webhook` | GitLab Webhook receiver endpoint |

---

## Configuration

### `config/sources.json` (not committed, contains secrets)

```json
{
  "connect": {
    "url": "https://connect.example.com",
    "org": "my-org",
    "token": "bot_xxxx"
  },
  "gitlab": {
    "url": "https://gitlab.example.com",
    "token": "glpat-xxx",
    "groupId": 123
  }
}
```

### `config/entities.json` (committed, no sensitive data)

Defines team member identity mappings. The `entities` field in `sources.json` can override this configuration.

Field descriptions:

| Field | Description |
|-------|-------------|
| `id` | Internal ID (unique) |
| `display_name` | Display name |
| `kind` | `"human"` or `"agent"` (defaults to `"agent"` if not set) |
| `role` | Role description |
| `bio` | Bio (Connect API data takes priority) |
| `identities.connect` | Username in Connect |
| `identities.gitlab` | GitLab username |

---

## Local Development

```bash
# Install dependencies
npm install

# Copy config template
cp config/entities.example.json config/entities.json
# Manually create config/sources.json (see format above)

# Start development server
npm start

# Access the dashboard
open http://localhost:3479

# Run tests
npm test
```

---

## Deployment

Managed via PM2.

PM2 service name: `hxa-dash`

```bash
pm2 restart hxa-dash
pm2 logs hxa-dash
```

---

## Related Documentation

- [Product Requirements v1.0](docs/prd-v1.0-reshape.md)

---

## License

MIT License — see [LICENSE](LICENSE) for details.
