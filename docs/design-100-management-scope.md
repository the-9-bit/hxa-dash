# Design: #100 管理范围（多 Scope 架构）

**Issue:** #100, #107
**Author:** Agent-4
**Status:** Draft v3 — 回应 Product-Owner review comments
**MR:** 代码 MR 等 design 确认后开

---

## 问题

hxa-dash 目前只支持单 Connect 服务器 + 单 org。团队需要从一个 dashboard 监控多个 Connect 服务器 × 多个 org。

**需求（来自 issue）：**
1. 多 connect 服务器 × 多 org
2. connect + org = "scope"
3. 每个 scope 包含一组 agent
4. Agent 在共享空间（GitLab × repo）工作
5. Scope 切换（不同时显示）
6. Org 内选择关注哪些 agent
7. 清晰的数据-scope-功能关系

**Product-Owner 反馈（#107 + !63 review）：**
- Connect 和 org 是一对多关系
- Agent 可能跨 org
- scope 标识应该用不可变 ID，不能依赖会变的名字
- 配置方式应该更智能，不能让用户手动填一堆 URL 和 token

## 数据模型

### 核心实体关系

```
Connect Server (1) ──→ (N) Org
         Org (1) ──→ (N) Agent
       Agent (N) ←──→ (N) Org    (agent 可跨 org)
```

### 什么是不可变的？

Connect 服务器中，以下东西**不会变**：
- **org_id**（UUID）— 如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`，创建后永不变
- **agent_id**（UUID）— 如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

以下东西**可能变**：
- hub_url（服务器迁移/域名更换）
- org name / agent name（改名）
- agent_token（轮换）

**因此 scope 的唯一标识用 org_id（UUID），不用人起的名字。**

### Scope 定义

| 字段 | 来源 | 是否可变 | 说明 |
|------|------|----------|------|
| `scope_id` | Connect org_id | 不可变 | UUID，scope 的永久标识 |
| `display_name` | org name | 可变 | 仅展示用，不影响数据关联 |
| `hub_url` | server 级 | 可变 | 服务器地址，可更新不影响 scope |
| `agent_token` | org 级 | 可变 | 认证凭据，轮换不影响 scope |
| `gitlab` | org 级 | 可配 | 关联的 GitLab 实例+group |

### Record Tagging

每条记录用 **org_id（UUID）** 打标：

```
agent.scope = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
task.scope = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
event.scope = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

即使 org 改名、服务器迁移，历史数据关联不断裂。

db.js 无需改动 — upsertAgent/upsertTask/insertEvent 已通过 spread 自动存储所有字段。

### Agent 跨 Org

同一个 agent 可能出现在多个 org 中。Phase 1 每个 scope 各自保留独立记录（不去重），因为：
- 不同 org 里 agent 的活动数据是独立的
- Scope 切换模式（非同时显示）下无需去重

## 配置

### 智能配置：自动发现 vs 手动填写

Product-Owner 的问题：「有更智能的方式来配置或者识别么？」「Server 有没有友好的方式来注册？」

**方案：token 自动发现**

用户只需提供一个 `agent_token`，系统自动从 Connect API 获取其余信息：

```
用户输入:  agent_token
     ↓
系统自动:  GET /hub/api/bot/info (带 token)
     ↓
返回:      hub_url, org_id, org_name, agent_id, agent_name
```

Connect 的 agent_token 已经绑定了特定的 org，所以一个 token 就能确定：这是哪个服务器、哪个 org、哪个 agent。

**配置流程（用户视角）：**
1. 在 Connect 上注册 bot → 获得 agent_token
2. 在 hxa-dash 配置中粘贴 token
3. 系统自动发现 server + org 信息
4. 只需额外配置 GitLab 关联（Connect 不知道对应哪个 GitLab group）

### sources.json 格式

**最简配置（自动发现模式）：**

```json
{
  "scopes": [
    {
      "agent_token": "bot_xxxx...",
      "gitlab": { "url": "https://gitlab.example.com", "token": "...", "group_id": 2 }
    },
    {
      "agent_token": "bot_xxxx...",
      "gitlab": { "url": "https://git.partner.xyz", "token": "...", "group_id": 1 }
    }
  ]
}
```

系统启动时，对每个 scope 的 token 调用 Connect API 自动补全：
- `hub_url` — 从 token 注册信息获取（或需要用户指定，取决于 Connect API）
- `org_id` — UUID，作为 scope_id
- `org_name` — 展示名
- `agent_name` — 当前 bot 名

**完整配置（手动模式，fallback）：**

```json
{
  "scopes": [
    {
      "hub_url": "https://connect.example.com/hub",
      "agent_token": "bot_xxxx...",
      "org_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "HxA Team K",
      "gitlab": { "url": "https://gitlab.example.com", "token": "...", "group_id": 2 }
    }
  ]
}
```

手动模式下用户显式提供 hub_url 和 org_id，跳过自动发现。

### 向后兼容

无 `scopes` 数组时，fallback 到现有平坦格式，自动生成单 scope：

```javascript
if (!config.scopes) {
  // 原始单 scope 格式
  scopes = [{ hub_url: config.connect.hub_url, agent_token: config.connect.agent_token, gitlab: config.gitlab }];
}
```

### Scope ID

**用 org_id UUID 作为 scope_id。** 不用 "team-k" 这种人起的名字。

原因：
- org_id 是 Connect 分配的 UUID，创建后不变
- "team-k" 是人为命名，含义模糊（代表什么团队？），且可能需要改
- UUID 作为内部标识，display_name 作为界面展示——关注点分离

## 后端架构

### Scope 解析

启动时解析配置 + 自动发现：

```javascript
const scopes = [];
for (const entry of config.scopes) {
  // 如果没有 org_id，通过 token 自动发现
  let info = entry;
  if (!entry.org_id) {
    info = await discoverFromToken(entry.hub_url, entry.agent_token);
  }
  scopes.push({
    id: info.org_id,           // UUID — 不可变标识
    name: info.org_name || info.name || info.org_id,
    hub_url: info.hub_url || entry.hub_url,
    agent_token: entry.agent_token,
    gitlab: entry.gitlab
  });
}
```

### Fetcher Factory Pattern

每个 scope 获得独立的 fetcher 实例：

```
connectFetcher.create(scope.connect, scope.id) → { fetchAgents() }
gitlabFetcher.create(scope.gitlab, scope.id) → { fetchIssues(), fetchMRs(), fetchEvents(), fetchAll() }
```

同一 server 下的多个 org 各自建独立 fetcher。简单可靠，预期规模（2-5 个 org）下完全可接受。

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
  scopes: [
    { id: "8375851a-...", name: "HxA Team K", hub: "connect.example.com" },
    { id: "b9a1f24b-...", name: "HxA Team J", hub: "connect.example.com" },
    { id: "c3d2e1f0-...", name: "Joint Project", hub: "connect.partner.xyz" }
  ],
  default: "8375851a-..."
}
```

前端可按 hub 分组显示。

### 现有 Route — 无变更

所有现有 API route 继续返回全量数据。过滤在客户端完成。

## 前端架构

### ScopeManager

```javascript
const ScopeManager = {
  scopes: [],        // from /api/scopes
  activeScope: null,  // 当前选中的 scope UUID

  async init() {
    // 1. 从 /api/scopes 获取 scope 列表
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

### Scope 选择器 UI

Header 中的选择器，按所属 server 分组：

```
┌────────────────────────────┐
│ ▸ connect.example.com         │
│   ○ HxA Team K             │
│   ● HxA Team J             │
│ ▸ connect.partner.xyz      │
│   ○ Joint Project          │
└────────────────────────────┘
```

- **单 scope:** 选择器自动隐藏
- **多 scope 同 server:** 按 server 分组（optgroup）
- 选择持久化到 `localStorage`（存 UUID）

### Filter Chain

```
API response → ScopeManager.filter() → AgentFilter.filter() → render
```

切换 scope 时自动更新 AgentFilter 的可选 agent 列表。

## Agent 可见性

复用现有 AgentFilter：
- 当前 scope 内所有 agent 出现在过滤下拉
- 用户可选择/取消关注个别 agent
- 切换 scope 时重置 agent filter 为 "全部"

## 存储汇总

| 内容 | 位置 | 持久化 |
|------|------|--------|
| Scope 定义（token + gitlab） | `config/sources.json` | 文件 |
| 自动发现的信息（org_id, name） | 运行时缓存 | 每次启动重新获取 |
| 当前 scope 选择 | `localStorage` | 浏览器（UUID） |
| Agent filter 选择 | `localStorage` | 浏览器 |
| 运行时数据 | In-memory `db.js` | 仅运行时 |

## 分期计划

1. **Phase 1（本 MR）:** scope 配置 + UUID 标识 + fetcher factory + 前端 scope 切换 + 客户端过滤 + removeAgent scope 保护
2. **Phase 2（押后）:** 自动发现（需要 Connect API 支持 GET /bot/info）
3. **Phase 3（先不用）:** "All Scopes" 视图 + 跨 scope agent 去重

**Product-Owner review 确认：**
- L312 Scope 切换重绘 → **可以**
- L313 All Scopes 视图 → **先不用**
- L314 连接复用优化 → **可以押后**

## 实现范围

Phase 1: **~400 lines across 7 files**

| 文件 | 变更 |
|------|------|
| `src/fetchers/connect.js` | Factory pattern + scope tagging（用 UUID） |
| `src/fetchers/gitlab.js` | Factory pattern + scope tagging（用 UUID） |
| `src/server.js` | Scope 解析, fetcher 创建, `/api/scopes`, 并行 polling |
| `public/js/app.js` | ScopeManager + filter integration |
| `public/index.html` | Scope selector element |
| `public/css/style.css` | Selector styling |
| `config/sources.example.json` | 配置文档 |

## 待确认

1. Connect API 是否已有 `/bot/info` 或类似 endpoint 可以通过 token 查询 org 信息？（影响 Phase 2 自动发现的可行性）
2. Phase 1 中，用户需要手动填写 org_id UUID —— 这个从哪里获取？（Connect 管理后台？注册 bot 时返回？）
