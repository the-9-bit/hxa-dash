# Design: #100 Management Scope (Multi-Scope Architecture)

**Issue:** #100, #107
**Author:** Vila
**Status:** Draft v2 — addressing Kevin/Jessie feedback on connect-org 关系
**MR:** !62 (implementation needs update after design approval)

---

## Problem

hxa-dash currently supports a single Connect server + single GitLab org. The team needs to monitor multiple Connect servers × multiple orgs from one dashboard instance.

**Requirements (from issue):**
1. Multiple connect servers × multiple orgs
2. connect + org = "scope"
3. Each scope contains a set of agents
4. Agents work in shared spaces (GitLab × repo)
5. Scope switching (not simultaneous display)
6. Within an org, select which agents to follow
7. Clear data-scope-function relationship

**Kevin feedback (#107):**
- 一个 connect 服务器可以开多个 org
- Agent 可能在同一服务器的多个 org 里
- 也可能跨多个服务器的多个 org
- Connect 和 org 应该是**一对多**关系，不是一对一绑定

## Data Model

### Core Entities

```
Connect Server (1) ──→ (N) Org
         Org (1) ──→ (N) Agent
       Agent (N) ←──→ (N) Org    (agent 可跨 org)
```

**Connect Server:** 一个 hub 实例（如 `connect.coco.xyz`），物理上独立部署。

**Org:** 挂在某个 Connect Server 下的组织单位。一个 Server 可以有多个 org，每个 org 有独立的 agent_token。

**Scope:** 用户在前端选择的视角。scope = 一个 org（隶属于某个 server）。

### Scope 定义

一个 scope 最终解析为：

| 字段 | 来源 | 说明 |
|------|------|------|
| `scope_id` | `{server_id}:{org_id}` | 自动生成的唯一标识 |
| `hub_url` | 从所属 server 继承 | Connect 服务器地址 |
| `agent_token` | org 级别配置 | 该 org 的认证 token |
| `gitlab` | org 级别配置 | 对应的 GitLab 实例+group |

### Record Tagging

每条记录（agent, task, event, collab edge）在 fetch 时打上 `scope` 字段：

```
agent.scope = "coco:team-k"
task.scope = "coco:team-k"
event.scope = "coco:team-k"
```

db.js 无需改动 — upsertAgent/upsertTask/insertEvent 已通过 spread 自动存储所有字段。

### Agent 跨 Org 去重

同一个 agent 可能出现在多个 org 中。每个 scope 各自保留独立记录（不去重），因为：
- 不同 org 里的同名 agent 可能是不同实体
- 即使是同一实体，在不同 org 的活动数据是独立的
- Scope 切换模式（非同时显示）下无需去重

若 Phase 2 支持 "All Scopes" 视图，再考虑基于 entity identity 的跨 scope 去重。

## Configuration

### v2 配置格式：servers + orgs 层级

```json
{
  "servers": [
    {
      "id": "coco",
      "name": "Coco Connect",
      "hub_url": "https://connect.coco.xyz/hub",
      "orgs": [
        {
          "id": "team-k",
          "name": "HxA Team K",
          "agent_token": "TOKEN_K",
          "gitlab": { "url": "https://git.coco.xyz", "token": "...", "group_id": 2 }
        },
        {
          "id": "team-j",
          "name": "HxA Team J",
          "agent_token": "TOKEN_J",
          "gitlab": { "url": "https://git.coco.xyz", "token": "...", "group_id": 5 }
        }
      ]
    },
    {
      "id": "external",
      "name": "Partner Connect",
      "hub_url": "https://connect.partner.xyz/hub",
      "orgs": [
        {
          "id": "collab",
          "name": "Joint Project",
          "agent_token": "TOKEN_EXT",
          "gitlab": { "url": "https://git.partner.xyz", "token": "...", "group_id": 1 }
        }
      ]
    }
  ]
}
```

**优势：**
- Connect 服务器配置不重复（hub_url 只写一次）
- 一对多关系清晰：server 下挂多个 org
- 跨服务器场景自然支持
- 新增 org 只需在对应 server 下加一条

### 向后兼容

无 `servers` 数组时，fallback 到现有平坦格式，自动生成单 scope：

```javascript
if (!config.servers) {
  // 也兼容 v1 的 scopes 数组格式
  if (config.scopes) {
    // 将 flat scopes 转为 server+org 结构
  } else {
    // 原始单 scope 格式
    servers = [{ id: 'default', hub_url: config.connect.hub_url,
      orgs: [{ id: 'default', agent_token: config.connect.agent_token, gitlab: config.gitlab }]
    }];
  }
}
```

三层兼容：`servers`（v2）> `scopes`（v1）> flat config（legacy）。

### Scope ID 生成

`scope_id = "${server.id}:${org.id}"`

例：`"coco:team-k"`, `"external:collab"`

## Backend Architecture

### Scope 解析

Server 启动时将 servers+orgs 展开为 scope 列表：

```javascript
const scopes = [];
for (const server of config.servers) {
  for (const org of server.orgs) {
    scopes.push({
      id: `${server.id}:${org.id}`,
      name: org.name || org.id,
      server_id: server.id,
      server_name: server.name,
      connect: { hub_url: server.hub_url, agent_token: org.agent_token },
      gitlab: org.gitlab
    });
  }
}
```

### Fetcher Factory Pattern

每个 scope 获得独立的 fetcher 实例：

```
connectFetcher.create(scope.connect, scope.id) → { fetchAgents() }
gitlabFetcher.create(scope.gitlab, scope.id) → { fetchIssues(), fetchMRs(), fetchEvents(), fetchAll() }
```

同一 server 下的多个 org 各自建独立 fetcher（不共享连接）。简单可靠，代价是对同一 hub 可能有多个并发连接——在预期规模（2-5 个 org）下完全可接受。

### Polling

所有 scope 并行 polling：

```javascript
await Promise.all(scopeFetchers.map(async (sf) => {
  await sf.connect.fetchAgents();
  await sf.gitlab.fetchAll();
}));
```

每个 fetcher 只清理自己 scope 内的过期记录，防止跨 scope 误删。

### API 变更

```
GET /api/scopes → {
  servers: [
    { id: "coco", name: "Coco Connect", orgs: [
      { id: "coco:team-k", name: "HxA Team K" },
      { id: "coco:team-j", name: "HxA Team J" }
    ]},
    { id: "external", name: "Partner Connect", orgs: [
      { id: "external:collab", name: "Joint Project" }
    ]}
  ],
  default: "coco:team-k"
}
```

返回层级结构，前端可以按 server 分组显示 org。

### Existing Routes — No Changes

所有现有 API route 继续返回全量数据。过滤在客户端完成。

## Frontend Architecture

### ScopeManager

```javascript
const ScopeManager = {
  servers: [],       // 层级结构 from /api/scopes
  scopes: [],        // 展平的 scope 列表
  activeScope: null,  // 当前选中的 scope ID

  async init() {
    // 1. 从 /api/scopes 获取 servers+orgs 层级
    // 2. 从 localStorage 恢复上次选择
    // 3. 渲染选择器（单 scope 自动隐藏）
  },

  filter(items) {
    if (!this.activeScope) return items;
    return items.filter(i => !i.scope || i.scope === this.activeScope);
  },

  filterBoard(board) { /* 过滤每列 */ },
  filterGraph(graph) { /* 过滤 nodes + edges */ }
};
```

### Scope Selector UI

Header 中的选择器，按 server 分组：

```
┌─────────────────────────┐
│ ▸ Coco Connect          │
│   ○ HxA Team K          │
│   ● HxA Team J          │
│ ▸ Partner Connect       │
│   ○ Joint Project       │
└─────────────────────────┘
```

- **单 scope:** 选择器自动隐藏
- **多 scope 同 server:** 直接显示 org 列表
- **多 server:** 按 server 分组（optgroup）
- 选择持久化到 `localStorage`

### Filter Chain

```
API response → ScopeManager.filter() → AgentFilter.filter() → render
```

切换 scope 时自动更新 AgentFilter 的可选 agent 列表。

## Agent Visibility

复用现有 AgentFilter：
- 当前 scope 内所有 agent 出现在过滤下拉
- 用户可选择/取消关注个别 agent
- 切换 scope 时重置 agent filter 为 "全部"

## Storage Summary

| 内容 | 位置 | 持久化 |
|------|------|--------|
| Server + org 定义 | `config/sources.json` | 文件（重启保留） |
| 当前 scope 选择 | `localStorage` | 浏览器（每用户） |
| Agent filter 选择 | `localStorage` | 浏览器（每用户） |
| 运行时数据 | In-memory `db.js` | 仅运行时 |

## Migration Path

1. **Phase 1（本 MR）:** servers+orgs 配置, fetcher factory, 前端 scope 切换, 客户端过滤, removeAgent scope 保护
2. **Phase 2:** Per-scope entity 配置, scope 感知 webhook, scope 级健康诊断
3. **Phase 3:** "All Scopes" 视图 + 跨 scope agent 去重, 服务端过滤（如 payload 过大）

## Implementation Scope

Phase 1: **~400 lines across 7 files**（!62 需更新配置格式）

| 文件 | 变更 |
|------|------|
| `src/fetchers/connect.js` | Factory pattern + scope tagging |
| `src/fetchers/gitlab.js` | Factory pattern + scope tagging |
| `src/server.js` | Server+org 解析, fetcher 创建, `/api/scopes`, 并行 polling |
| `public/js/app.js` | ScopeManager + filter integration |
| `public/index.html` | Scope selector element |
| `public/css/style.css` | Selector styling |
| `config/sources.example.json` | v2 config documentation |

## Open Questions

1. Scope 切换时完整重绘 vs DOM 过滤？（当前：完整重绘）
2. Phase 2 是否需要 "All Scopes" 视图？（需求 #5 说 scope 切换，不同时显示）
3. 同一 server 多 org 是否需要连接复用优化？（Phase 1 不需要）
