# Project 能力 · 技术设计与迁移方案

本文档定义 Project 能力的技术落地方案，包括 schema 调整、API 设计、前后端改动范围、迁移与验证策略。它是 `docs/05-project-prd.md` 的实施配套文档。

---

## 一、设计目标

在保持现有 Trace 核心模型稳定的前提下，为 `Thread / Note / Report` 引入正式的 `Project` 归属能力，并保证：

1. 对现有非 Project 用户零破坏
2. 老数据可迁移
3. API 与前端类型保持一致
4. 报告生成路径能利用 Project 上下文

---

## 二、当前实现基线

当前相关实现集中在以下文件：

### 后端

- `backend/src/trace_api/schema.sql`
- `backend/src/trace_api/db.py`
- `backend/src/trace_api/routers/threads.py`
- `backend/src/trace_api/routers/notes.py`
- `backend/src/trace_api/routers/reports.py`
- `backend/src/trace_api/routers/search.py`
- `backend/src/trace_api/main.py`

### 前端

- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/Threads.tsx`
- `frontend/src/pages/ThreadDetail.tsx`
- `frontend/src/pages/Notes.tsx`
- `frontend/src/pages/Reports.tsx`
- `frontend/src/components/NewThreadModal.tsx`
- `frontend/src/components/NewReportModal.tsx`
- `frontend/src/components/ThreadReportModal.tsx`

### 当前数据现状

- `thread.project` 是字符串字段
- `note` 无 `project_id`
- `report` 无 `project_id`
- `note.thread_ids_json`、`report.thread_ids_json` 已存在

---

## 三、数据模型设计

## 3.1 新增表：project

建议 schema：

```sql
CREATE TABLE IF NOT EXISTS project (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    owner       TEXT,
    summary     TEXT NOT NULL DEFAULT '',
    color       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
```

### 建议索引

```sql
CREATE INDEX IF NOT EXISTS idx_project_status ON project(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_updated ON project(updated_at DESC);
```

---

## 3.2 修改表：thread

### 现状

```sql
project TEXT
```

### 目标

新增：

```sql
project_id TEXT REFERENCES project(id) ON DELETE SET NULL
```

### 兼容策略

- 第一阶段保留旧字段 `project`
- 读写路径逐步切换到 `project_id`
- 迁移完成并稳定后，再考虑移除旧 `project` 字段（SQLite 中通常意味着 rebuild table，不建议早做）

---

## 3.3 修改表：note

新增：

```sql
project_id TEXT REFERENCES project(id) ON DELETE SET NULL
```

保留：

- `thread_ids_json`

### 设计理由

让 Note 支持“先属于项目，再慢慢整理线程”。

---

## 3.4 修改表：report

新增：

```sql
project_id TEXT REFERENCES project(id) ON DELETE SET NULL
```

保留：

- `thread_ids_json`

### 设计理由

支持：

- 项目报告
- 项目内筛选 threads
- 保持原有 thread 范围报告

---

## 3.5 第一版不修改：evidence / todo

### evidence

不新增 `project_id`，避免重复归属来源。

### todo

继续通过 `thread_id` 继承 Project 语义。  
若未来需要“直接项目待办”，再评估扩展。

---

## 四、数据库迁移方案

## 4.1 schema.sql 变更

### 新增

- `project` 表
- `thread.project_id`
- `note.project_id`
- `report.project_id`
- project 相关索引

### 建议顺序

1. 先在 `schema.sql` 中加新表与新列
2. 在 `db.py` 的 `MIGRATIONS` 中补增量列

---

## 4.2 db.py 迁移项

当前 `MIGRATIONS` 已负责旧库增量补列。  
建议新增：

```python
("thread", "project_id TEXT REFERENCES project(id) ON DELETE SET NULL"),
("note", "project_id TEXT REFERENCES project(id) ON DELETE SET NULL"),
("report", "project_id TEXT REFERENCES project(id) ON DELETE SET NULL"),
```

> 注意：SQLite `ALTER TABLE ADD COLUMN` 对复杂外键语法支持有限。若受限，可先加 `TEXT` 列，再在应用层校验其合法性。

更稳妥的实现可为：

```python
("thread", "project_id TEXT"),
("note", "project_id TEXT"),
("report", "project_id TEXT"),
```

然后在 router 层验证该 id 是否存在于 project 表。

---

## 4.3 历史数据迁移：thread.project → project / project_id

### 迁移目标

把自由文本 `thread.project` 尽量转成结构化 Project。

### 推荐策略

#### Step 1：收集唯一 project 名称

```sql
SELECT DISTINCT project FROM thread WHERE project IS NOT NULL AND TRIM(project) != '';
```

#### Step 2：为这些名称创建 project 记录

- `name = thread.project`
- `status = active`
- `summary = ''`

#### Step 3：回填 thread.project_id

按名称匹配：

```sql
UPDATE thread SET project_id = (
  SELECT id FROM project WHERE project.name = thread.project LIMIT 1
)
WHERE project IS NOT NULL AND TRIM(project) != '';
```

### 迁移脚本建议

新增独立脚本，例如：

- `scripts/migrate_projects.py`

优点：

- 不把一次性数据迁移逻辑塞进 request path
- 便于 dry run / 输出日志

---

## 五、后端 API 设计

## 5.1 新增 router：projects.py

建议新增：

- `backend/src/trace_api/routers/projects.py`

并在 `main.py` 中注册。

---

## 5.2 Projects API

### `GET /api/projects`

返回项目列表，建议字段：

- 基础字段
- thread_count
- report_count
- recent_note_count（可选，第一版也可不做）

### `POST /api/projects`

入参：

```json
{
  "name": "Q3 增长实验",
  "status": "active",
  "owner": "Albert",
  "summary": "围绕新用户转化的一系列实验",
  "color": "teal"
}
```

### `GET /api/projects/{id}`

返回：

- project 基础信息
- threads
- recent notes
- reports
- 聚合统计

### `PATCH /api/projects/{id}`

支持更新：

- name
- status
- owner
- summary
- color

### `DELETE /api/projects/{id}`

建议第一版**不做硬删除**，而是优先通过 `PATCH status=archived` 来归档。

---

## 5.3 Threads API 调整

文件：

- `backend/src/trace_api/routers/threads.py`

### 新增字段

#### ThreadIn

```python
project_id: str | None = None
```

#### ThreadPatch

```python
project_id: str | None = None
clear_project: bool | None = None
```

### 行为要求

- create/patch 时校验 `project_id` 是否存在
- list/get 返回 `project_id`、`project_name`

### 列表过滤

支持：

```http
GET /api/threads?project_id=prj_xxx
```

---

## 5.4 Notes API 调整

文件：

- `backend/src/trace_api/routers/notes.py`

### 新增字段

#### NoteIn

```python
project_id: str | None = None
```

#### NotePatch

```python
project_id: str | None = None
clear_project: bool | None = None
```

### 行为要求

- create/patch 校验 `project_id`
- list/get 返回 `project_id`、`project_name`
- 支持 list filter：

```http
GET /api/notes?project_id=prj_xxx
```

---

## 5.5 Reports API 调整

文件：

- `backend/src/trace_api/routers/reports.py`

### 新增字段

#### ReportCreate

```python
project_id: str | None = None
```

#### ReportPatch

```python
project_id: str | None = None
```

### 行为要求

- create/patch 校验 `project_id`
- list/get 返回 `project_id`、`project_name`
- 支持 list filter：

```http
GET /api/reports?project_id=prj_xxx
```

---

## 5.6 Report compose 范围逻辑

### 当前逻辑

`_collect_evidence_lines(...)` 主要根据：

- period_start
- period_end
- thread_ids

### 新逻辑建议

#### 优先级规则

1. 若传 `project_id + thread_ids`
   - 只收集该项目下、且在线程集合内的 Evidence
2. 若仅传 `project_id`
   - 收集该项目下所有线程在周期内的 Evidence
3. 若仅传 `thread_ids`
   - 保持现状
4. 若都不传
   - 表示全局时间窗报告

### 实现建议

可扩展 `_collect_evidence_lines(...)` 签名：

```python
def _collect_evidence_lines(
    conn,
    period_start: str,
    period_end: str,
    thread_ids: list[str] | None = None,
    project_id: str | None = None,
) -> tuple[list[str], list[str]]:
```

### 约束

若同时传 `project_id + thread_ids`，应校验：

- 所有 thread_ids 都属于该 project

否则返回 400。

---

## 5.7 Search API 调整

文件：

- `backend/src/trace_api/routers/search.py`

### 建议变更

#### 新增搜索对象

- project

#### 现有对象返回补充

- thread 增加 `project_id`
- note 增加 `project_id`
- report（若未来纳入搜索）也可增加 `project_id`

---

## 六、前端类型设计

文件：

- `frontend/src/lib/types.ts`

## 6.1 新增 Project 类型

```ts
export type ProjectStatus = "active" | "paused" | "done" | "archived";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  owner: string | null;
  summary: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  thread_count?: number;
  report_count?: number;
  note_count?: number;
}
```

## 6.2 新增 ProjectDetail 类型

```ts
export interface ProjectDetail extends Project {
  threads: Thread[];
  notes: Note[];
  reports: ReportSummary[];
}
```

## 6.3 扩展现有实体

### Thread

新增：

- `project_id?: string | null`
  - `project_name?: string | null`

### Note

新增：

- `project_id?: string | null`
  - `project_name?: string | null`

### Report / ReportSummary

新增：

- `project_id?: string | null`
  - `project_name?: string | null`

---

## 七、前端 API 客户端调整

文件：

- `frontend/src/lib/api.ts`

## 7.1 新增 api.projects

```ts
projects: {
  list: () => req<Project[]>("/projects"),
  get: (id: string) => req<ProjectDetail>(`/projects/${id}`),
  create: (body: ProjectInput) => req<Project>("/projects", ...),
  patch: (id: string, body: ProjectPatch) => req<Project>(`/projects/${id}`, ...),
}
```

## 7.2 现有 list API 支持 project_id filter

- `threads.list(projectId?)`
- `notes.list(projectId?)`
- `reports.list(projectId?)`

实现方式可为：

```ts
list: (projectId?: string) =>
  req<Thread[]>(`/threads${projectId ? `?project_id=${projectId}` : ""}`)
```

---

## 八、前端页面与组件改动

## 8.1 新页面

### `frontend/src/pages/Projects.tsx`

项目列表页。

### `frontend/src/pages/ProjectDetail.tsx`

项目详情页。

### `frontend/src/App.tsx`

新增路由：

- `/projects`
- `/projects/:id`

---

## 8.2 现有页面改动

### `frontend/src/components/Shell.tsx`

- 左侧导航新增 Projects

### `frontend/src/pages/Threads.tsx`

- 增加 Project filter
- 卡片展示 project pill

### `frontend/src/pages/ThreadDetail.tsx`

- 头部展示所属项目
- 点击项目名可跳转详情页

### `frontend/src/pages/Notes.tsx`

- 增加 Project filter
- 编辑页增加项目选择
- 列表项可展示项目名

### `frontend/src/pages/Reports.tsx`

- 增加 Project filter
- 列表展示项目归属

### `frontend/src/components/NewThreadModal.tsx`

- 增加项目选择器

### `frontend/src/components/NewReportModal.tsx`

- 增加项目选择器
- 若已选项目，再显示“限定线程”更合理

### `frontend/src/components/ThreadReportModal.tsx`

- 若线程已有项目，可显示/继承该项目

---

## 8.3 可复用组件建议

建议新增：

- `ProjectChip.tsx`
- `ProjectSelect.tsx`
- `ProjectStatusBadge.tsx`

可避免项目展示/选择逻辑在多页面重复。

---

## 九、实现顺序建议

## Phase 1：数据与 API

1. `schema.sql` 增加 project 相关结构
2. `db.py` 加迁移
3. 新增 `projects.py`
4. 扩展 `threads / notes / reports` router
5. 补后端测试

## Phase 2：前端类型与 API

1. 改 `types.ts`
2. 改 `api.ts`
3. 增加 projects 路由与页面

## Phase 3：前端表单与过滤

1. 新建 Thread / Note / Report 加项目选择
2. Threads / Notes / Reports 加项目过滤
3. ThreadDetail 展示项目归属

## Phase 4：项目报告 compose

1. compose 逻辑支持 `project_id`
2. prompt 增加项目上下文
3. 验证项目内局部线程范围

---

## 十、测试方案

## 10.1 后端测试

建议新增：

### `backend/tests/test_projects.py`

覆盖：

- project CRUD
- project list / detail
- status update

### `backend/tests/test_threads.py`

新增覆盖：

- thread create with project_id
- thread patch project_id
- thread list filter by project_id

### `backend/tests/test_notes.py`

新增覆盖：

- note create with project_id
- note patch project_id
- note list filter by project_id

### `backend/tests/test_reports.py`

新增覆盖：

- report create with project_id
- report list/get returns project fields
- report compose with project scope
- reject thread_ids outside project

### `backend/tests/test_search.py`

新增覆盖：

- search includes project
- search results return project metadata

---

## 10.2 前端验证

至少应通过：

- `npm run typecheck`
- `npm run build`

若后续引入前端测试，再补：

- Projects 页面渲染
- Project filter
- 创建表单默认值
- 项目报告创建流程

---

## 十一、回滚与兼容策略

## 11.1 向后兼容

即使 Project 功能未使用，以下路径仍必须正常：

- 创建普通 Thread
- 创建普通 Note
- 创建普通 Report
- 按 thread_ids 生成报告

## 11.2 回滚策略

若新功能上线后出现问题：

- UI 可先隐藏 Projects 导航
- 后端保留 project 字段支持为空
- 老的 thread/project 字符串仍在数据库内可辅助恢复

---

## 十二、开放技术问题

### 问题 1：SQLite 迁移是否保留旧 `thread.project`

建议：保留。  
原因：SQLite 删列成本高，且保留一段时间有利于回滚与数据核对。

### 问题 2：Project Detail 是否一次返回全量 notes / reports / threads

建议第一版返回：

- 全量 threads
- 最近 notes（限制数量）
- 最近 reports（限制数量）

避免详情页过重。

### 问题 3：Report 中 `project_id` 与 `thread_ids` 是否都持久化

建议：都持久化。  
因为 Report 是“观察窗口”，项目与线程细分范围都是该窗口的一部分。

---

## 十三、推荐的落地结论

如果按收益 / 风险比排序，最优方案是：

1. 引入一等 `project` 表
2. 给 `thread / note / report` 增加 `project_id`
3. 保留 `thread_ids_json` 作为报告与记事的细粒度范围
4. 第一版不让 `evidence / todo` 直接挂 Project

这条路径兼顾：

- 产品价值
- 技术复杂度
- 数据兼容性
- 后续演进空间
