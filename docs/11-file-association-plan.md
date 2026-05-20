# 文件关联功能优化计划

## 背景

Trace 的核心价值是把零散工作材料沉淀为可追溯的工作线、项目上下文和成文汇报。当前系统已经支持快记、本地 Markdown 库扫描、证据、工作线、项目、待办、记事和报告，但仍缺少一种轻量方式来引用本机文件。

文件关联功能的目标是：用户可以把本机任意文件关联到 Trace 中的项目、工作线、证据、记事或报告上，Trace 只保存文件路径和必要元信息，不移动、不复制、不修改原文件。用户之后可以直接从 Trace 打开文件，或在 Finder 中定位文件。

## 产品目标

新增一个本地优先的“关联文件”能力：

- 可以把本机文件关联到 Trace 的核心对象上。
- 不改变原文件位置。
- 不复制原文件内容。
- 不修改原文件。
- 支持从 Trace 直接打开文件。
- 支持在 Finder 中显示文件。
- 文件移动或删除后，Trace 能显示失效状态。

这项能力补齐的是 Trace 的证据链：不是所有资料都应该被导入数据库，但它们应该能被 Trace 记住、追踪和快速打开。

## 优先级总览

| 优先级 | 阶段 | 目标 |
| --- | --- | --- |
| P0 | 文件关联基础能力 | 建立数据模型和 API，完成最小可用闭环 |
| P1 | 前端入口和日常体验 | 在项目、工作线、证据中展示和管理关联文件 |
| P1 | 报告上下文引用 | 报告生成时知道相关文件存在，但默认不读取内容 |
| P2 | 文件内容导入 | 用户主动选择后，从文件内容生成 Evidence |
| P2 | 失效文件修复 | 文件移动后支持重新定位 |
| P3 | 智能关联 | 拖拽、推荐、自动关联等增强能力 |

## P0：文件关联基础能力

### 支持范围

第一阶段优先支持以下对象：

- Project 关联文件
- Thread 关联文件
- Evidence 关联文件

Note 和 Report 可以在第二阶段接入，避免第一轮范围过大。

### 数据模型

建议新增 `attachment` 表：

```sql
CREATE TABLE IF NOT EXISTS attachment (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    owner_type     TEXT NOT NULL,
    owner_id       TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    file_kind      TEXT,
    file_size      INTEGER,
    mtime          TEXT,
    created_at     TEXT NOT NULL,
    last_opened_at TEXT,
    metadata_json  TEXT NOT NULL DEFAULT '{}'
);
```

建议索引：

```sql
CREATE INDEX IF NOT EXISTS idx_attachment_owner
ON attachment(workspace_id, owner_type, owner_id, created_at DESC);
```

字段说明：

- `owner_type`：`project` / `thread` / `evidence` / `note` / `report`
- `owner_id`：被关联对象的 ID
- `file_path`：本机绝对路径
- `display_name`：展示名称，默认取文件名
- `file_kind`：文件类型或扩展名
- `file_size`：文件大小
- `mtime`：文件最后修改时间
- `last_opened_at`：最近一次从 Trace 打开的时间
- `metadata_json`：保留扩展信息

### 行为规则

- Trace 只保存文件路径和元信息。
- 不移动原文件。
- 不复制原文件。
- 不修改原文件。
- 创建关联时校验文件是否存在。
- 打开文件前再次检查文件是否存在。
- 文件不存在时返回明确状态，前端显示“文件已移动或删除”。
- 删除关联只删除 Trace 内记录，不删除原文件。

### 后端 API

建议新增 `attachments.py` 路由：

```text
GET    /api/attachments?owner_type=thread&owner_id=...
POST   /api/attachments
DELETE /api/attachments/{id}
POST   /api/attachments/{id}/open
POST   /api/attachments/{id}/reveal
```

`POST /api/attachments` 请求体：

```json
{
  "owner_type": "thread",
  "owner_id": "th_xxx",
  "file_path": "/Users/albert/Documents/example.pdf",
  "display_name": "example.pdf"
}
```

`POST /api/attachments/{id}/open`：

- macOS 使用 `open <file_path>`。
- 成功后更新 `last_opened_at`。

`POST /api/attachments/{id}/reveal`：

- macOS 使用 `open -R <file_path>`。
- 行为可参考当前本地 Markdown 库的 `library.reveal` 实现。

### 后端验收标准

- 能为 Project / Thread / Evidence 创建文件关联。
- 能按对象列出关联文件。
- 能删除关联记录，且不删除原文件。
- 能打开真实存在的文件。
- 能在 Finder 中定位真实存在的文件。
- 文件不存在时返回可理解错误。
- 所有 API 都遵守 workspace 隔离。

## P1：前端入口和日常体验

### ProjectDetail

在项目详情页增加“关联文件”区域：

- 展示当前项目关联的文件。
- 支持添加文件路径。
- 支持打开文件。
- 支持在 Finder 中显示。
- 支持移除关联。
- 文件不存在时显示失效状态。

### ThreadDetail

在线程详情页增加“关联文件”区域：

- 适合放 PRD、设计稿、会议录音、截图、合同、数据表等材料。
- 与线程证据时间线并列展示，避免干扰核心 Evidence 流。

### Evidence / Inbox

在证据卡片或 Inbox 卡片中展示关联文件：

- 用于补充某条 Evidence 背后的原始附件。
- 保留“显示源文件”的现有能力。
- 后续可以统一为附件组件。

### 前端组件建议

新增通用组件：

```text
AttachmentPanel
AttachmentList
AttachmentPicker
AttachmentChip
```

第一轮可以先实现一个简单的 `AttachmentPanel`，避免过早抽象。

### 前端文案要求

删除关联时必须明确：

```text
只会移除 Trace 中的关联记录，不会删除原文件。
```

文件失效时显示：

```text
文件已移动或删除
```

### 前端验收标准

- 用户可以在 ProjectDetail 关联并打开文件。
- 用户可以在 ThreadDetail 关联并打开文件。
- 用户可以移除关联，原文件保持不变。
- 文件不存在时界面不崩溃，并显示失效状态。
- 操作后列表和计数刷新正确。

## P1：报告上下文引用

第一阶段不读取文件内容进入 LLM 上下文，只让报告生成知道相关文件存在。

示例上下文：

```text
该线程关联文件：
- PRD.pdf
- meeting-notes.md
- design.fig
```

这样可以增强报告上下文，但避免误发隐私文件内容。

### 验收标准

- 报告生成时可以看到项目或线程的关联文件名。
- 默认不读取文件正文。
- UI 中明确区分“关联文件”和“已导入证据”。

## P2：文件内容导入

基础关联稳定后，再支持用户主动把文件内容导入为 Evidence。

### 导入分级

第一批支持：

- `.md`
- `.markdown`
- `.txt`

后续按需支持：

- `.pdf`
- `.docx`
- `.xlsx`
- `.csv`

### 关键原则

必须明确区分两种行为：

- 关联文件：只保存路径，不读取正文。
- 导入证据：读取内容并写入 Trace 数据库。

### 验收标准

- 用户必须主动点击“从文件生成证据”。
- 导入前显示将读取的文件路径和类型。
- 导入后生成 Evidence，并能关联到当前 Project / Thread。
- 原文件不被修改。

## P2：失效文件修复

当文件被移动或删除后，Trace 应支持修复关联。

### 功能方向

- 显示失效状态。
- 允许用户重新定位文件。
- 如果新文件名称、大小、mtime 接近，提示可能匹配。

### 验收标准

- 失效附件不影响页面加载。
- 重新定位后附件恢复可打开状态。
- 修复只更新 `file_path` 和元信息。

## P3：智能关联

增强方向：

- 从 Finder 拖文件到项目或线程详情页直接关联。
- 根据文件名推荐关联项目或线程。
- 本地 Markdown 库扫描时，自动把源文件挂到对应 Evidence。
- 最近打开文件出现在首页。
- 支持“文件夹关联”，用于项目资料目录。

这些功能应在基础能力稳定后逐步验证，避免把 Trace 做成复杂文件管理器。

## 推荐实施顺序

### 第一轮：最小可用闭环

1. 新增 `attachment` 数据表和 schema 迁移。
2. 新增附件 API：创建、列表、删除、打开、Finder 显示。
3. ProjectDetail 增加“关联文件”区。
4. ThreadDetail 增加“关联文件”区。
5. Evidence / Inbox 显示关联文件入口。
6. 增加后端测试。
7. 运行前端类型检查。

### 第二轮：体验增强

1. 支持拖拽文件关联。
2. 支持 Note / Report 关联文件。
3. 报告生成上下文加入关联文件名。
4. 增加失效文件重新定位。

### 第三轮：内容导入

1. 支持从 `.md` / `.txt` 生成 Evidence。
2. 支持 PDF / Office 文件解析的可行性验证。
3. 增加导入前确认和隐私提示。

## 风险与注意事项

- 不要把文件关联做成文件管理器；Trace 只负责“引用”和“上下文”。
- 不要默认读取文件内容进入 LLM。
- 不要在删除关联时删除原文件。
- 不要改变原文件位置。
- 需要处理文件路径失效、权限不足、文件被移动、外接硬盘未挂载等情况。
- 需要遵守 workspace 隔离，避免不同工作区串联附件。

## 与 Trace 产品定位的关系

文件关联能力不是普通附件功能，而是 Trace 证据链的一部分：

```text
文件 / 笔记 / 快记 → Evidence → Thread → Project → Report
```

有些文件适合被读取并转成 Evidence；有些文件只需要被记住和快速打开。文件关联功能正是为第二种场景服务，让 Trace 保持本地优先、轻量、可追溯，同时不侵入用户原有文件组织方式。
