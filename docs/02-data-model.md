# 数据模型

## 实体关系

```
Source ──has──▶ Capture ──parsed──▶ Evidence ──clustered──▶ Thread
                                                               │
                                                               ├─▶ Todo
                                                               ├─▶ Note（可选关联）
                                                               └─▶ Report.Section
```

## 表定义（SQLite）

### source
归档层。每份原始素材（文件 / 粘贴 / URL / 快记）一行。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | `src_<uuid12>` |
| kind | TEXT | `file` / `paste` / `url` / `quicknote` / `meeting` |
| title | TEXT | 显示标题 |
| file_path | TEXT? | 归档路径（如果是文件） |
| url | TEXT? | 原始 URL（钉钉闪记等） |
| raw_text | TEXT | 原始全文 |
| hash | TEXT UNIQUE | sha256 去重 |
| imported_at | TEXT | ISO8601 |
| event_time | TEXT? | 事件发生时间（meeting 时间 / 快记时间） |
| metadata_json | TEXT | 附加信息 |

### capture
中间层。把 source 切成可处理的原子单位。一个 source 可产出多个 capture。

| 字段 | 类型 |
|---|---|
| id | TEXT PK `cap_<uuid12>` |
| source_id | TEXT FK → source |
| seq | INTEGER |
| section_title | TEXT? |
| text | TEXT |
| speaker | TEXT? |
| time_hint | TEXT? |
| confidence | REAL |
| created_at | TEXT |

### evidence
加工后可入线程的证据。与 capture 一对一或一对多（拆句后）。

| 字段 | 类型 |
|---|---|
| id | TEXT PK `ev_<uuid12>` |
| capture_id | TEXT FK |
| thread_id | TEXT FK? → thread（NULL = 在 Inbox） |
| text | TEXT |
| event_date | TEXT? |
| owners_json | TEXT |
| tags_json | TEXT |
| category | TEXT | progress/decision/risk/plan/support |
| status | TEXT | done/ongoing/blocked/planned |
| importance | REAL |
| created_at | TEXT |

### thread
工作线。长期存在，跨周期。

| 字段 | 类型 |
|---|---|
| id | TEXT PK `th_<uuid12>` |
| title | TEXT |
| project | TEXT? |
| owner | TEXT? |
| status | TEXT | active/blocked/done/archived |
| started_at | TEXT |
| last_active_at | TEXT |
| summary | TEXT | AI 自动生成的概览 |
| pinned | INTEGER |

### todo
可勾选待办，可挂线程。

| 字段 | 类型 |
|---|---|
| id | TEXT PK `td_<uuid12>` |
| thread_id | TEXT FK? |
| text | TEXT |
| due_date | TEXT? |
| done | INTEGER |
| done_at | TEXT? |
| created_at | TEXT |

### note
富文本长文。按天归档。

| 字段 | 类型 |
|---|---|
| id | TEXT PK `nt_<uuid12>` |
| title | TEXT |
| body_md | TEXT |
| day | TEXT | YYYY-MM-DD |
| thread_ids_json | TEXT |
| created_at | TEXT |
| updated_at | TEXT |

### report
汇报。任意周期 × 任意受众。

| 字段 | 类型 |
|---|---|
| id | TEXT PK `rp_<uuid12>` |
| period_label | TEXT | `2026-W15` / `2026-03` / `2026-Q1` / 自定义 |
| period_start | TEXT |
| period_end | TEXT |
| audience | TEXT | boss/internal/1on1/retro/self |
| title | TEXT |
| body_md | TEXT | 编辑器内容 |
| outline_json | TEXT | 大纲 |
| cited_evidence_json | TEXT | 引用编号映射 |
| status | TEXT | draft/final |
| created_at | TEXT |
| updated_at | TEXT |

### llm_profile
LLM 配置，可多套。

| 字段 | 类型 |
|---|---|
| id | TEXT PK |
| name | TEXT | "OpenAI 生产" / "DeepSeek 开发" |
| base_url | TEXT |
| api_key | TEXT |
| model | TEXT |
| temperature | REAL |
| max_tokens | INTEGER |
| is_default | INTEGER |

### settings
单行 KV。

## 索引

- `source(hash)` unique
- `capture(source_id, seq)`
- `evidence(thread_id, event_date)`
- `thread(last_active_at DESC)` 用于首页热度排序
- `report(period_label, audience, created_at DESC)`
- FTS5 虚拟表：`capture_fts(text)` · `note_fts(title, body_md)` 用于 ⌘K 搜索
