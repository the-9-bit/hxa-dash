# 设计文档：#100 管理范围（多 Scope 架构）

**Issue:** #100
**作者:** Vila
**状态:** Draft — 等待 Kevin 确认
**MR:** !62（实现已就绪，待设计审批）

---

## 问题

hxa-dash 目前只支持单个 Connect 服务器 + 单个 GitLab 组织。团队需要从一个 dashboard 实例监控多个 Connect 服务器 × 多个组织。

**需求（来自 Kevin issue #100）：**
1. 支持多 connect 服务器 × 多 org
2. connect + org = 一个 "scope"（管理范围）
3. 每个 scope 包含一组 agent
4. agent 在共享空间（GitLab × repo）工作
5. 不同 scope 是**切换关系**（不是同时显示）
6. org 内部可以选择关注哪些 agent
7. 合理安排数据 scope 和功能的关系

## 数据模型

### Scope 定义

一个 **scope** = `(connect_url, org_id)`，即一个 Connect 服务器 + 一个 GitLab 组。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识（如 `"team-k"`） |
| `name` | string | 显示名（如 `"HxA Team K"`） |
| `connect` | object | `{ hub_url, agent_token }` |
| `gitlab` | object | `{ url, token, group_id }` |

### 数据标记

每条存储记录（agent、task、event）在获取时打上 `scope` 字段：

```
agent.scope = "team-k"
task.scope = "team-k"
event.scope = "team-k"
```

内存存储（db.js）无需改 schema — 现有的 upsert 方法通过 spread 自动存储所有字段。

## 配置

### sources.json 格式

```json
{
  "scopes": [
    {
      "id": "team-k",
      "name": "HxA Team K",
      "connect": { "hub_url": "https://connect.coco.xyz/hub", "agent_token": "..." },
      "gitlab": { "url": "https://git.coco.xyz", "token": "...", "group_id": 2 }
    },
    {
      "id": "team-j",
      "name": "HxA Team J",
      "connect": { "hub_url": "https://other.connect.xyz/hub", "agent_token": "..." },
      "gitlab": { "url": "https://git.other.xyz", "token": "...", "group_id": 5 }
    }
  ]
}
```

### 向后兼容

没有 `scopes` 数组时，自动降级为单 scope 模式。**现有部署零改动。**

## 后端架构

### Fetcher 工厂模式

现有的 `connect.js` 和 `gitlab.js` 是单例。改为工厂函数：

```
connectFetcher.create(scope.connect, scope.id) → { fetchAgents() }
gitlabFetcher.create(scope.gitlab, scope.id) → { fetchIssues(), fetchMRs(), ... }
```

### 并行轮询

所有 scope 并行 poll：

```javascript
await Promise.all(scopeFetchers.map(sf => {
  sf.connect.fetchAgents();
  sf.gitlab.fetchAll();
}));
```

每个 fetcher 实例只清理自己 scope 的过期记录，不会跨 scope 干扰。

### 新 API

```
GET /api/scopes → { scopes: [{ id, name }], default: "team-k" }
```

### 现有路由 — 不改

所有现有 API 继续返回全量数据。过滤在前端做。

**取舍：** 服务端过滤可以减少 payload，但需要改所有路由。当前规模（2-5 scope，~20 agent）客户端过滤足够且更简单。

## 前端架构

### ScopeManager

客户端 scope 状态管理模块：
- 从 `/api/scopes` 获取可用 scope 列表
- 从 localStorage 恢复上次选择
- 提供 `filter(items)` 方法过滤数据

### Scope 选择器

Header 栏加下拉选择器：

```
[Scope: Team K ▾] [Filter agents ▾] [搜索...]
```

- **单 scope：** 自动隐藏（无 UI 干扰）
- **多 scope：** 下拉显示所有配置的 scope
- **选择持久化** 到 localStorage

### 过滤链

```
API 响应 → ScopeManager.filter() → AgentFilter.filter() → 渲染
```

Scope 过滤先跑（粗筛），Agent 过滤后跑（细筛）。切换 scope 时 agent 过滤器自动更新可选列表。

## Agent 可见性

scope 内的 agent 筛选复用现有 AgentFilter：
- 当前 scope 的所有 agent 出现在筛选下拉
- 用户可以选择/取消关注个别 agent
- 筛选状态按 scope 存储（切换 scope 重置为"全部"）

## 存储汇总

| 内容 | 存储位置 | 持久化 |
|------|----------|--------|
| Scope 定义 | `config/sources.json` | 文件（重启保留） |
| 当前 scope 选择 | `localStorage` | 浏览器（按用户） |
| Agent 筛选选择 | `localStorage` | 浏览器（按用户） |
| 数据（agent/task/event） | 内存 db.js | 运行时（重启重新拉取） |

## 分期计划

1. **Phase 1（本次 MR !62）：** 多 scope 配置 + fetcher 工厂 + 前端 scope 切换 + 客户端过滤
2. **Phase 2（后续）：** 按 scope 配置 entity + scope 感知 webhook + scope 级健康诊断
3. **Phase 3（后续）：** 服务端 scope 过滤（规模增大时）

## 实现规模

Phase 1：约 350 行改动，7 个文件。已在 !62 实现。

## Boot Review 结果

- 设计合理，向后兼容好
- **P2（需修复）：** `removeAgent` 按 name 删除，可能跨 scope 误删 → 需加 scope 条件
- P3（非阻塞）：`esc()` 函数定义确认 + open question #1 已回答（full re-render）

## 待确认

1. Kevin 确认 scope 方案 OK
2. Vila 修 P2 后 merge
