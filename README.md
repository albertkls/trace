# Trace

**一个本地优先的个人 AI 工作台，把零散记录沉淀成可追溯的工作线和汇报。**

Trace 解决的是一个很具体的问题：你每天在会议、聊天、文档和脑子里留下很多工作碎片，但到了周报、复盘、项目总结的时候，还是要重新翻、重新想、重新组织。

Trace 把这个过程变成一条连续的链路：

```text
快记 / 文件 / 笔记 → 证据 → 工作线 → 项目上下文 → 汇报
```

它不是 Jira、Notion 或 Linear 的替代品，也不是只会总结文档的工具。Trace 更像一个只为个人服务的工作记忆层：平时低摩擦记录，事后按线程和项目整理，最后用 AI 帮你生成有上下文、有证据来源的文字输出。

数据默认全部保存在本机 SQLite 中，AI 调用只走你自己配置的模型端点和 API Key。

---

## 当前状态

- 版本：`2.0.3`
- 技术栈：FastAPI + SQLite + React + TypeScript + pywebview
- 发行形态：macOS 桌面应用，使用 PyInstaller 打包 `.app` 和 DMG
- 数据目录：`~/Library/Application Support/Trace`
- 发布路径：只使用 `make package-mac`

仓库里保留了 `frontend/src-tauri/` 作为 Tauri 2.x 实验外壳，但正式发布不使用 Tauri。不要用 `npm run tauri:build` 产出发布版本，因为那条路径不会捆绑后端，运行后 API 调用会失败。

---

## 适合谁

Trace 适合这些人：

- 同时推进多个项目、主题或实验的人
- 经常需要写周报、月报、项目汇报、复盘或 1:1 对齐稿的人
- 喜欢随手记录，但不想每次输出前都从零整理的人
- 希望工作资料留在本机，并自己控制 AI 模型和 API Key 的人

它尤其适合个人使用。当前项目目标不是多人协作平台，而是一个稳定、可控、长期可用的本地工作台。

---

## 核心概念

### Capture / 快记

随手记录的一句话、一段会议结论、一个风险、一个决定或一个待办线索。

### Evidence / 证据

可以被引用的工作事实。快记、本地 Markdown 文件、笔记内容都会沉淀成证据，后续用于线程整理和报告生成。

### Thread / 工作线

一件持续推进的事情。它可以跨多天、多周、多素材，记录这个主题从开始、推进、阻塞到完成的过程。

### Project / 项目

项目是线程、证据、待办、笔记和报告的上层上下文。一个项目下可以有多条工作线。

### Workspace / 工作区

工作区用于隔离不同生活或工作上下文。项目、线程、证据、待办、笔记和报告都会按工作区过滤。

### Report / 汇报

基于证据和线程生成的成文输出。可以用于周报、月报、项目报告、复盘、1:1 或自定义场景。

---

## 主要功能

### 快速捕获

- 全局快记入口，适合会议中或工作间隙快速记录
- 支持把内容送入收件箱，再统一整理
- 可以把证据归入线程、挂到项目、转成待办

### 收件箱整理

- 查看尚未归入线程的证据
- 将证据挂到已有线程或创建新线程
- 基于项目和内容进行整理

### 项目与工作线

- 按项目聚合线程、证据、待办、笔记和报告
- 线程详情页按时间组织证据
- 支持线程摘要、状态、项目关联和证据追溯

### 本地 Markdown 库

- 在设置页挂载本地 Markdown 文件夹
- 扫描 `.md` / `.markdown` 文件到收件箱
- 自动同步开关按工作区保存
- 记录最近一次同步批次、耗时、错误数量和错误明细
- 大文件、不可读文件、编码错误不会中断整个批次
- 支持定位源文件

### 笔记与待办

- Markdown 笔记可按项目组织
- 待办可关联线程和截止时间
- 统一的应用内时间选择器，支持快捷时间、月历、小时/分钟选择和清除时间
- 首页和项目页汇总关键工作状态

### 搜索

- 全局搜索覆盖项目、线程、证据、待办和笔记
- 使用 SQLite FTS5
- 保留工作区隔离，避免跨工作区串数据

### AI 汇报与改写

- 支持报告草稿、报告生成和局部改写
- 支持 OpenAI 兼容协议和 Anthropic 协议
- 可配置多个 LLM Profile
- 使用你自己的 API Key，不经过中间服务

### 数据备份与恢复

- 设置页可立即备份数据库
- 自动更新前会自动创建备份
- 备份文件位于 `~/Library/Application Support/Trace/backups`
- 备份文件名包含版本、时间和数据库 SHA256 校验信息
- 恢复前会创建安全快照
- 恢复需要二次确认
- 恢复失败不会覆盖当前数据库

### 自动更新

- 通过 GitHub Release 检查新版本
- 下载 DMG 后进行 SHA256 校验
- 安装更新前自动备份数据库

### 桌面体验

- macOS 关闭按钮可选择最小化到程序坞或直接退出程序

---

## 快速开始

### 环境要求

- macOS
- Python 3.11
- Node.js 18+

### 安装依赖

```bash
make setup
```

### 启动开发环境

```bash
make dev
```

开发模式会同时启动：

- 前端：`http://localhost:5173`
- 后端：`http://127.0.0.1:8787`

也可以分开启动：

```bash
make frontend
make backend
```

### 运行桌面联调

```bash
make desktop
```

### 构建 macOS 发布包

```bash
make package-mac
```

产物位置：

```text
output/macos/Trace.app
output/macos/Trace-2.0.3-macOS.dmg
output/macos/SHA256SUMS.txt
```

---

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `make setup` | 初始化后端虚拟环境并安装前端依赖 |
| `make dev` | 同时启动前端和后端开发服务 |
| `make backend` | 只启动 FastAPI 后端 |
| `make frontend` | 只启动 Vite 前端 |
| `make build-web` | 构建前端静态产物 |
| `make desktop` | 运行 pywebview 桌面联调版本 |
| `make package-mac` | 构建 macOS `.app` 和 DMG |
| `make test` | 运行后端测试 |
| `make fmt` | 运行 Ruff 自动修复与格式化 |
| `make reset` | 删除本地 SQLite 数据库 |
| `make clean` | 删除后端虚拟环境、前端依赖和构建产物 |

前端类型检查：

```bash
cd frontend && npm run typecheck
```

后端全量测试：

```bash
cd backend && .venv/bin/python -m pytest
```

---

## 技术架构

```text
┌───────────────────────────────────────────────┐
│ Frontend                                      │
│ React 18 · TypeScript · Vite · TailwindCSS    │
│ React Router · TanStack Query                 │
├───────────────────────────────────────────────┤
│ HTTP /api                                     │
├───────────────────────────────────────────────┤
│ Backend                                       │
│ FastAPI · Pydantic · SQLite · FTS5            │
│ LLM clients · updater · backup/restore        │
├───────────────────────────────────────────────┤
│ Desktop                                       │
│ pywebview · bundled FastAPI · PyInstaller     │
└───────────────────────────────────────────────┘
```

开发模式下，前端由 Vite 提供，后端由 FastAPI 提供 API。

发布模式下，PyInstaller 将 FastAPI 后端、前端 dist、pywebview 入口打进独立 `.app`，再生成 DMG。

---

## 项目结构

```text
Trace/
├── backend/
│   ├── pyproject.toml
│   ├── tests/
│   └── src/trace_api/
│       ├── routers/          API 路由
│       ├── llm/              LLM 客户端与提示词
│       ├── config.py         运行配置
│       ├── db.py             SQLite 连接与 schema 演进
│       ├── desktop.py        pywebview 桌面入口
│       ├── main.py           FastAPI 应用装配
│       ├── schema.sql        数据库结构
│       └── web.py            静态资源托管
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── components/       通用组件
│   │   ├── lib/              API、类型、工具函数
│   │   └── pages/            页面
│   └── src-tauri/            实验外壳，不用于正式发布
├── docs/                     产品、架构、发布和用户文档
├── scripts/release/          macOS 打包脚本
├── output/macos/             本地打包产物
├── Makefile
└── AGENTS.md                 AI 开发规范
```

---

## 数据与隐私

Trace 默认不依赖云端数据库。

- SQLite：`~/Library/Application Support/Trace/db.sqlite`
- 备份目录：`~/Library/Application Support/Trace/backups`
- AI 调用：直连你在设置页配置的模型端点
- API Key：保存在本地数据库

使用云端 LLM 时，被选中的上下文会发送给你配置的模型服务商。处理敏感资料前，请先确认该工作区和模型配置是否适合发送这些内容。

---

## 发布流程摘要

正式发布只走 macOS 打包脚本：

```bash
make package-mac
```

不要使用：

```bash
npm run tauri:build
```

发布时需要：

1. 合并开发分支到 `main`
2. 更新版本号
3. 创建 Git tag
4. 运行 `make package-mac`
5. 本机安装 `Trace.app` 验证核心流程
6. 创建 GitHub Release
7. 上传 `Trace-{版本号}-macOS.dmg`

GitHub Release 是应用内更新提醒的来源。旧版本只有在 Release 版本号更高且包含 macOS DMG 时，才能检测并安装更新。

---

## 文档

- [用户使用说明](docs/08-user-guide.md)
- [产品愿景](docs/00-vision.md)
- [PRD](docs/01-prd.md)
- [数据模型](docs/02-data-model.md)
- [架构设计](docs/03-architecture.md)
- [macOS 发布说明](docs/04-release-macos.md)
- [优化路线图](docs/10-optimization-roadmap.md)

---

## 开发约定

- 日常开发在 `dev` 分支进行
- `main` 保持稳定，只接收验证后的发布合并
- 数据库演进遵循“只加表、只加列”的原则
- 代码修改后至少运行相关后端测试和前端类型检查
- 发布版只使用 `make package-mac`

---

## License

Private. 当前仅供个人使用。
