# Trace

把碎片工作连成一份能讲故事的汇报。

Trace 是一个**本地优先的个人 AI 工作台**，用来把日常工作中的闪记、证据、线程、项目、待办和汇报组织到一起。

---

## 为什么做 Trace

工作中真正难的不是"写周报"，而是：

- 我最近到底推进了什么？
- 这些分散的记录、风险、决定之间有什么关系？
- 怎么把它们整理成一份能对外讲清楚的汇报？

Trace 解决的不是"把文档压短"，而是：

> **把散落的工作线索织成一段可追溯、可复用、可输出的叙事。**

---

## 核心模型

```text
Capture → Evidence → Thread → Report
                     ↘
                      Project
```

| 概念 | 说明 |
|------|------|
| **Capture** | 随手记下的一笔（闪记） |
| **Evidence** | 可被引用的工作事实，带分类与标签 |
| **Thread** | 一条持续推进的工作线 |
| **Project** | Thread / Note / Report 的上层上下文 |
| **Report** | 在时间窗口下生成的叙事输出（周报、月报、复盘…） |

---

## 功能一览

### Quick Capture（`⌘⇧N`）

- **Enter 直接提交**，无需组合键，默认进入 Inbox
- 输入 `#线程名` 自动归入线程，`@项目名` 自动关联项目
- 连续输入模式：提交后保持弹窗，计数器递增，适合批量补录

### 每日回顾

- Home 页自动展示昨日证据和已完成待办
- 一眼看清"昨天做了什么"

### 收件箱（Inbox）

- 管理未归线程的闪记
- 调整分类（进展 / 决定 / 风险 / 计划 / 协同）
- 归入已有线程或新建线程
- 一键转为待办
- 自动推荐项目

### 项目管理

- 新建 / 编辑 / 删除项目
- 项目详情页：线程、笔记、报告、待办、证据一站式查看
- 项目时间线
- 项目摘要 AI 自动生成
- 一键创建项目报告

### 工作线（Thread）

- 创建 / 编辑 / 删除 / 归档
- 查看线程时间线
- 管理关联待办
- AI 生成线程摘要

### Markdown 记事

- 按天记录长文笔记
- 自动保存，挂靠项目，关联多个线程
- 可晋升为证据

### 待办管理

- 创建待办，设置截止时间，挂靠线程
- 标记完成

### 汇报生成

- 支持多种场景：周报 / 月报 / 项目报告 / 复盘 / 1:1
- AI 起草，AI 改写（续写 / 压缩 / 调性 / 自定义指令）
- 证据引用与项目上下文增强

### 全局搜索（`⌘K`）

- 一次搜索覆盖项目、线程、证据、待办、笔记

### LLM 配置

- 支持 OpenAI 兼容协议（OpenAI / DeepSeek / Kimi / 通义 / Ollama 等）
- 支持 Anthropic 原生协议
- 多 Profile 管理，一键测试连接

---

## 快速开始

### 安装依赖

```bash
make setup
```

### 开发模式

```bash
make dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787
- API 文档：http://localhost:8787/docs

### 桌面预览

```bash
make desktop
```

### 打包 macOS 应用

```bash
make package-mac
```

产物：`output/macos/Trace.app` 和 `output/macos/Trace-{version}-macOS.dmg`

---

## 常用命令

```bash
make setup         # 安装前后端依赖
make dev           # 启动开发环境
make build-web     # 构建前端
make desktop       # 本地桌面模式运行
make package-mac   # 构建 Trace.app 与 DMG
make test          # 后端测试
make fmt           # Ruff 检查 / 格式化
make reset         # 清除本地数据库
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS |
| 后端 | Python 3.11+ / FastAPI + SQLite |
| 桌面壳 | pywebview（macOS native） |
| 打包 | PyInstaller + hdiutil |
| AI 接入 | OpenAI 兼容协议 + Anthropic |

---

## 项目结构

```text
Trace/
├── backend/               FastAPI + SQLite 后端
│   └── src/trace_api/
│       ├── routers/       API 路由（threads, projects, captures, reports, todos, notes, llm, search, activity）
│       ├── llm/           LLM 调用层（OpenAI 兼容 + Anthropic）
│       ├── schema.sql     数据库 Schema
│       ├── db.py          数据库连接与迁移
│       └── desktop.py     pywebview 桌面入口
├── frontend/              React / Vite 前端
│   └── src/
│       ├── components/    通用组件（Shell, QuickCapture, SearchModal…）
│       ├── pages/         页面（Home, Inbox, Projects, Threads, Notes, Todos, Reports, Timeline, Settings）
│       └── lib/           工具函数、API 客户端、类型定义
├── docs/                  产品文档、架构、用户指南
├── scripts/release/       打包脚本
└── Makefile
```

---

## 数据与隐私

- 数据库位置：`~/Library/Application Support/Trace/db.sqlite`
- 所有数据默认保存在本地 SQLite，不上传任何服务器
- LLM 调用使用用户自己的 API Key，直接请求用户配置的端点
- 本项目不做本地脱敏，调用 LLM 前请自行判断数据风险

---

## 文档

- [用户指南](docs/08-user-guide.md) — 每个模块怎么用、推荐工作流
- [产品愿景](docs/00-vision.md)
- [PRD](docs/01-prd.md)
- [数据模型](docs/02-data-model.md)
- [架构设计](docs/03-architecture.md)
- [macOS 发布说明](docs/04-release-macos.md)

---

## 适合谁

- 同时推进多个主题，需要把碎片串成线索的人
- 需要周期性输出周报 / 月报 / 复盘的人
- 喜欢边做边记、但希望最后能沉淀成果的人

---

## License

Private — 仅供个人使用。
