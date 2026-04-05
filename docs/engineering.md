# HxA Dash — 工程设计与任务分配

**版本**: v1.0
**日期**: 2026-03-13
**基于**: PRD v0.9

---

## 1. 系统架构

```
                          ┌─────────────────────────────┐
                          │       dash.example.com       │
                          │     Caddy (Basic Auth)       │
                          │     /hxa-dash/* → :3479      │
                          └──────────┬──────────────────┘
                                     │
                          ┌──────────▼──────────────────┐
                          │     HxA Dash Server          │
                          │     Node.js + Express        │
                          │     Port 3479                │
                          │                              │
                          │  ┌────────────────────────┐  │
                          │  │    WebSocket Server     │  │
                          │  │    (ws 库, /ws 路径)    │  │
                          │  └────────────────────────┘  │
                          │                              │
                          │  ┌────────────────────────┐  │
                          │  │    数据聚合引擎         │  │
                          │  │    - ConnectFetcher     │  │
                          │  │    - GitLabFetcher      │  │
                          │  │    - CollabAnalyzer     │  │
                          │  └────────────────────────┘  │
                          │                              │
                          │  ┌────────────────────────┐  │
                          │  │    SQLite 缓存层        │  │
                          │  │    (better-sqlite3)     │  │
                          │  └────────────────────────┘  │
                          └──┬──────────────┬───────────┘
                             │              │
                   ┌─────────▼────┐  ┌──────▼──────────┐
                   │ HxA Connect  │  │   GitLab API    │
                   │ /api/bots    │  │   /api/v4/...   │
                   │ (轮询 30s)   │  │   (轮询 60s)    │
                   └──────────────┘  └─────────────────┘
```

---

## 2. 目录结构

```
hxa-dash/
├── docs/
│   ├── prd.md                 # 产品需求文档
│   └── engineering.md         # 本文件
├── config/
│   └── sources.json           # 数据源配置（连接信息）
├── src/
│   ├── server.js              # 主入口：Express + WS + 定时轮询
│   ├── db.js                  # SQLite 初始化 + 查询封装
│   ├── fetchers/
│   │   ├── connect.js         # HxA Connect API 数据获取
│   │   └── gitlab.js          # GitLab API 数据获取
│   ├── analyzers/
│   │   └── collab.js          # 协作关系分析（图论：点+边）
│   ├── routes/
│   │   ├── team.js            # GET /api/team, GET /api/team/:name
│   │   ├── board.js           # GET /api/board
│   │   └── timeline.js        # GET /api/timeline
│   └── ws.js                  # WebSocket 管理（连接、推送）
├── public/
│   ├── index.html             # 单页面板
│   ├── css/
│   │   └── style.css          # 样式（深色主题）
│   └── js/
│       ├── app.js             # 主入口：WS 连接 + 路由
│       ├── components/
│       │   ├── card-wall.js   # Agent 卡片墙
│       │   ├── detail-drawer.js # Agent 详情抽屉
│       │   ├── collab-graph.js  # 协作关系力导向图
│       │   ├── task-board.js  # 任务看板
│       │   └── timeline.js    # 工作时间线
│       └── lib/
│           └── force-graph.js # 力导向图渲染引擎
├── data/
│   └── dash.db                # SQLite 数据库文件（运行时生成）
├── package.json
└── README.md
```

---

## 3. 核心模块设计

### 3.1 数据聚合引擎

后端核心，负责定时从信息源拉取数据、分析协作关系、通过 WS 推送变化。

```
启动 → 初始化 DB → 首次全量拉取 → 启动定时轮询
                                      │
                            ┌─────────▼─────────┐
                            │  每 30s: Connect   │
                            │  每 60s: GitLab    │
                            └─────────┬─────────┘
                                      │
                            ┌─────────▼─────────┐
                            │  对比缓存，检测变化 │
                            └─────────┬─────────┘
                                      │
                            ┌─────────▼─────────┐
                            │  有变化？           │
                            │  → 更新 SQLite     │
                            │  → 重算协作图       │
                            │  → WS 推送 diff    │
                            └───────────────────┘
```

### 3.2 ConnectFetcher (src/fetchers/connect.js)

- 调用 `GET /api/bots`，获取所有 Agent 列表
- 提取：name, role, bio, tags, online, last_seen_at
- 与缓存对比，返回变化的 Agent 列表

### 3.3 GitLabFetcher (src/fetchers/gitlab.js)

- 调用 `GET /api/v4/groups/:id/issues`，获取 Issue 列表
- 调用 `GET /api/v4/groups/:id/merge_requests`，获取 MR 列表
- 调用 `GET /api/v4/events`（按用户），获取活动事件
- 映射 GitLab username → Connect Agent name（通过配置）

### 3.4 CollabAnalyzer (src/analyzers/collab.js)

协作图论分析引擎：

```javascript
// 输入：GitLab Issue/MR 数据
// 输出：{ nodes: Agent[], edges: CollabEdge[] }

// 节点（Agent）属性：
// - id, name, role, online
// - stats: { mr_count, issue_count, active_days }

// 边（协作）属性：
// - source, target（Agent ID）
// - type: 'review' | 'issue' | 'project'
// - weight（协作频率）
// - recent_events[]（最近协作事件）
```

协作信号识别：
1. **Review 边**：Agent A 的 MR 由 Agent B 作为 reviewer → 边(A→B, type:review)
2. **Issue 边**：Agent A 和 B 都在同一 Issue 上有活动 → 边(A↔B, type:issue)
3. **Project 边**：Agent A 和 B 都在同一 repo 有 MR/Issue → 边(A↔B, type:project)
4. 边权重 = 近 30 天内协作事件数量

### 3.5 WebSocket 管理 (src/ws.js)

- WS 路径：`/ws`（与 HTTP 共用端口 3479）
- 连接时：发送完整状态快照（team + board + timeline + graph）
- 数据变化时：推送 diff 消息

消息格式：
```json
{
  "type": "snapshot" | "update",
  "data": {
    "team": [...],       // Agent 列表 + 状态
    "board": {...},      // 看板数据
    "timeline": [...],   // 时间线事件
    "graph": {           // 协作图
      "nodes": [...],
      "edges": [...]
    }
  }
}
```

### 3.6 SQLite Schema (src/db.js)

```sql
-- Agent 信息缓存
CREATE TABLE agents (
  name TEXT PRIMARY KEY,
  role TEXT,
  bio TEXT,
  tags TEXT,            -- JSON array
  online INTEGER,
  last_seen_at INTEGER,
  updated_at INTEGER
);

-- GitLab Issue/MR 缓存
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,    -- GitLab issue/MR iid
  type TEXT,                 -- 'issue' | 'mr'
  project TEXT,              -- repo name
  title TEXT,
  state TEXT,                -- 'opened' | 'closed' | 'merged'
  assignee TEXT,             -- Agent name
  url TEXT,
  labels TEXT,               -- JSON array
  created_at INTEGER,
  updated_at INTEGER
);

-- 事件时间线
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER,
  agent TEXT,
  action TEXT,               -- 'created' | 'closed' | 'merged' | 'commented'
  target_type TEXT,          -- 'issue' | 'mr' | 'note'
  target_title TEXT,
  project TEXT,
  url TEXT,
  is_collab INTEGER DEFAULT 0  -- 是否为协作事件
);

-- 协作边缓存
CREATE TABLE collab_edges (
  source TEXT,
  target TEXT,
  type TEXT,                 -- 'review' | 'issue' | 'project'
  weight INTEGER DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (source, target, type)
);
```

### 3.7 前端组件

#### card-wall.js — Agent 卡片墙
- 接收 WS 推送的 team 数据
- 渲染卡片网格，在线优先排序
- 绿色/灰色状态指示
- 点击触发 detail-drawer

#### detail-drawer.js — Agent 详情抽屉
- 侧边滑出面板
- 显示：基本信息、当前工作（assigned issues/MR）、近期完成、协作伙伴
- 工作统计数字

#### collab-graph.js — 协作关系力导向图
- 使用 Canvas 渲染力导向图
- 节点 = Agent（大小 = 工作量，颜色 = 在线状态）
- 边 = 协作（粗细 = 频率，颜色 = 类型）
- 交互：悬停显示详情，拖拽节点

#### task-board.js — 任务看板
- 三列：待办 / 进行中 / 已完成
- 按项目分组（可折叠）
- 卡片显示：标题、assignee、项目、标签

#### timeline.js — 工作时间线
- 按时间倒序排列
- 协作事件特殊高亮（如不同颜色边框）
- 点击事件跳转 GitLab

---

## 4. 任务拆解与分配

### 团队资源

| Agent | 专长 | 状态 |
|-------|------|------|
| **Lead** | 全栈 + 协调 | 主导本项目 |
| **Agent-1** | 后端 + 基础设施 | 可分配 |
| **Agent-2** | 前端 + UI | 可分配 |

### 任务拆解

共 12 个任务，按依赖关系分 3 批并行推进。

---

#### 第一批：基础设施（无依赖，并行开发）

| ID | 任务 | 分配 | 预估 | 说明 |
|----|------|------|------|------|
| **T1** | 项目脚手架 | Lead | 30min | package.json, 目录结构, config/sources.json, PM2 配置, Caddy 路由 |
| **T2** | SQLite 数据层 | Agent-1 | 1h | db.js: 建表、CRUD 封装、初始化 |
| **T3** | 前端骨架 + 深色主题 | Agent-2 | 1h | index.html, style.css, app.js: 布局框架 + 深色主题 + WS 连接骨架 |

---

#### 第二批：数据获取（依赖 T1+T2）

| ID | 任务 | 分配 | 预估 | 说明 |
|----|------|------|------|------|
| **T4** | ConnectFetcher | Agent-1 | 1h | HxA Connect API 调用 + 缓存对比 + 变化检测 |
| **T5** | GitLabFetcher | Agent-1 | 1.5h | GitLab Issues/MRs/Events API + username 映射 + 缓存 |
| **T6** | CollabAnalyzer | Lead | 1.5h | 图论分析：Review/Issue/Project 边生成 + 权重计算 |
| **T7** | WebSocket + 轮询引擎 | Lead | 1h | WS server, 定时轮询调度, diff 检测, 推送 |

---

#### 第三批：前端组件（依赖 T3+T7）

| ID | 任务 | 分配 | 预估 | 说明 |
|----|------|------|------|------|
| **T8** | Agent 卡片墙 | Agent-2 | 1.5h | card-wall.js: 卡片渲染、在线状态、排序、点击事件 |
| **T9** | Agent 详情抽屉 | Agent-2 | 1.5h | detail-drawer.js: 侧边面板、当前/历史工作、统计、协作伙伴 |
| **T10** | 协作关系力导向图 | Lead | 2h | collab-graph.js + force-graph.js: Canvas 力导向图渲染、交互 |
| **T11** | 任务看板 | Agent-2 | 1h | task-board.js: 三列看板、项目分组、卡片样式 |
| **T12** | 工作时间线 | Agent-2 | 1h | timeline.js: 事件列表、协作高亮、GitLab 链接 |

---

### 依赖关系图

```
T1 (脚手架) ──┬──→ T4 (Connect) ──┬──→ T7 (WS引擎) ──→ T8  (卡片墙)
              │                   │                    T9  (详情)
T2 (SQLite) ──┤    T5 (GitLab) ──┤                    T10 (协作图)
              │                   │                    T11 (看板)
T3 (前端骨架)──┘    T6 (协作分析)──┘                    T12 (时间线)
```

### 时间线

```
00:40 SGT  ├── 第一批启动（T1/T2/T3 并行）
01:40 SGT  ├── 第一批完成 → 第二批启动（T4/T5/T6/T7 并行）
03:40 SGT  ├── 第二批完成 → 第三批启动（T8-T12 并行）
06:00 SGT  ├── 第三批完成 → 集成测试 + 修复
07:00 SGT  ├── 部署上线 + 数据验证
08:00 SGT  ├── Buffer 时间
10:00 SGT  └── 直播开始 ✅
```

### 分配汇总

| Agent | 任务 | 总预估 |
|-------|------|--------|
| **Lead** | T1 + T6 + T7 + T10 + 集成 | ~5.5h |
| **Agent-1** | T2 + T4 + T5 | ~3.5h |
| **Agent-2** | T3 + T8 + T9 + T11 + T12 | ~6h |

---

## 5. 部署方案

### PM2 配置

```javascript
{
  name: 'hxa-dash',
  script: 'src/server.js',
  cwd: '/home/op/zylos/workspace/hxa-dash',
  env: {
    PORT: 3479,
    NODE_ENV: 'production'
  }
}
```

### Caddy 路由

```
handle_path /hxa-dash/* {
    reverse_proxy localhost:3479
}
```

注意：WebSocket 升级需要在 Caddy 中透传（Caddy 默认支持）。

### GitLab Webhook

在 my-org group 设置 Webhook：
- URL: `https://dash.example.com/hxa-dash/webhook`
- Events: Push, Issue, MR
- Secret: 配置在 sources.json

---

## 6. 接口对照表

### 后端 → 前端（REST API）

| 端点 | 用途 | 响应 |
|------|------|------|
| `GET /api/team` | 团队列表 + 状态 | `{ agents: Agent[], stats: TeamStats }` |
| `GET /api/team/:name` | Agent 详情 | `{ agent: Agent, tasks: Task[], events: Event[], collabs: Collab[] }` |
| `GET /api/board` | 任务看板 | `{ todo: Task[], doing: Task[], done: Task[] }` |
| `GET /api/timeline` | 工作时间线 | `{ events: Event[] }` |
| `GET /api/graph` | 协作图 | `{ nodes: Node[], edges: Edge[] }` |

### 后端 → 前端（WebSocket 推送）

| 消息类型 | 触发 | 数据 |
|----------|------|------|
| `snapshot` | 连接时 | 完整状态 |
| `team:update` | Agent 状态变化 | 变化的 Agent 列表 |
| `board:update` | Issue/MR 变化 | 变化的任务列表 |
| `timeline:new` | 新事件 | 新事件列表 |
| `graph:update` | 协作关系变化 | 更新的 nodes/edges |

### 外部信息源

| API | 轮询频率 | 数据 |
|-----|----------|------|
| HxA Connect `/api/bots` | 30s | Agent 在线状态 |
| GitLab `/api/v4/groups/13/issues` | 60s | Issue 列表 |
| GitLab `/api/v4/groups/13/merge_requests` | 60s | MR 列表 |
| GitLab Events (per user) | 60s | 活动事件 |
