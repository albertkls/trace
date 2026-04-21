# Trace

把碎片工作连成一份能讲故事的汇报。

Trace 是一个**本地优先的个人 AI 工作台**，用来把日常工作中的闪记、证据、线程、项目、待办和汇报组织到一起。

它不是 Jira、Notion 或单纯的周报生成器；它更像一个专门为“长期推进 + 周期输出”设计的个人工作上下文系统。

---

## 为什么做 Trace

很多工具只能做“摘要”，但工作中真正难的是：

- 我最近到底推进了什么？
- 这些分散的记录、风险、决定之间有什么关系？
- 怎么把它们整理成一份能对外讲清楚的汇报？

Trace 解决的不是“把文档压短”，而是：

> **把散落的工作线索织成一段可追溯、可复用、可输出的叙事。**

---

## 核心模型

```text
Capture → Evidence → Thread → Report
                     ↘
                      Project
```

### 关键概念

- **Capture**：随手记下的一笔
- **Evidence**：可被引用的工作事实
- **Thread**：一条持续推进的工作线
- **Project**：Thread/Note/Report 的上层上下文
- **Report**：在时间窗口下生成的叙事输出

---

## 现在有哪些功能

### 1. 快速记录

- `⌘⇧N` 打开 Quick Capture
- 记录一句话、一个风险、一个决定、一个计划
- 可以直接选项目、选线程，或先丢进 Inbox

### 2. 收件箱整理

- 管理未归线程的记录
- 调整分类
- 归入已有线程
- 新建线程并归入
- 转为待办
- 自动推荐项目

### 3. 项目管理（轻量）

- 新建项目
- 项目详情页
- 项目内搜索
- 项目时间线
- 项目摘要自动生成
- 一键创建本周项目报告

### 4. 工作线管理

- 创建/编辑线程
- 查看线程时间线
- 管理关联待办
- AI 生成线程摘要
- 合并线程

### 5. Markdown 记事

- 按天记录长文笔记
- 自动保存
- 挂靠项目
- 关联多个线程
- 可晋升为证据
- 自动推荐项目

### 6. 待办管理

- 创建待办
- 设置截止时间
- 挂靠线程
- 标记完成

### 7. 汇报生成

- 周报 / 月报 / 项目报告 / 复盘 / 1:1
- AI 起草
- AI 改写
- 证据引用
- 项目上下文增强

### 8. 全局时间线与搜索

- 全局时间线查看跨模块活动
- `⌘K` 全局搜索
- 搜索项目、线程、证据、待办、笔记

### 9. LLM 配置

- 支持 OpenAI 兼容协议
- 支持 Anthropic
- 支持 DeepSeek / Kimi / 通义 / Ollama / 自定义网关

---

## 当前版本亮点（v1.1）

本次版本重点增强：

- 新增 **Projects** 模块
- 项目详情页与项目时间线
- 项目摘要自动生成
- 项目报告模板
- Quick Capture / Inbox / Notes 的项目推荐
- 项目内搜索与项目活动流

---

## 适合谁

Trace 特别适合：

- 同时推进多个主题的人
- 需要周期性输出周报 / 月报 / 复盘的人
- 喜欢边做边记、但希望最后能沉淀成果的人
- 需要把“零碎工作痕迹”整理成“清楚叙事”的人

---

## 技术栈

- **前端**：Vite + React + TypeScript + Tailwind
- **后端**：FastAPI + SQLite
- **桌面壳**：pywebview
- **打包**：PyInstaller + hdiutil（macOS）
- **AI 接入**：OpenAI 兼容协议 + Anthropic

---

## 项目结构

```text
Trace/
├── backend/                 FastAPI + SQLite + desktop launcher
├── frontend/                React / Vite UI
├── docs/                    产品、架构、用户说明
├── scripts/dev.sh           一键开发启动
├── scripts/release/         发行版与安装包脚本
├── start.sh                 本地开发启动器
└── Makefile
```

---

## 快速开始

### 1) 开发模式

首次安装：

```bash
make setup
```

启动开发环境：

```bash
make dev
```

访问地址：

- 前端：http://localhost:5173
- 后端：http://localhost:8787
- API 文档：http://localhost:8787/docs

### 2) 本地桌面预览

```bash
make desktop
```

### 3) 打包为 Mac 应用

```bash
make package-mac
```

产物位置：

- `output/macos/Trace.app`
- `output/macos/Trace-1.1.0-macOS.dmg`

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
```

---

## 数据与隐私

- 默认数据库位置：
  - `~/Library/Application Support/Trace/db.sqlite`
- 所有工作数据默认保存在本地 SQLite
- LLM 调用使用用户自己的 Key
- 本项目当前不做本地脱敏，调用前请自行判断数据风险

---

## 用户文档

如果你是第一次使用，建议先看：

- [docs/08-user-guide.md](docs/08-user-guide.md)

它会详细介绍：

- 每个模块做什么
- 每个功能怎么用
- 推荐工作流
- 常见问题

---

## 其他文档

- [docs/00-vision.md](docs/00-vision.md)
- [docs/01-prd.md](docs/01-prd.md)
- [docs/02-data-model.md](docs/02-data-model.md)
- [docs/03-architecture.md](docs/03-architecture.md)
- [docs/04-release-macos.md](docs/04-release-macos.md)
- [docs/05-project-prd.md](docs/05-project-prd.md)
- [docs/06-project-ia.md](docs/06-project-ia.md)
- [docs/07-project-technical-design.md](docs/07-project-technical-design.md)
- [docs/08-user-guide.md](docs/08-user-guide.md)

---

## 当前状态

当前仓库最近已通过：

- `cd backend && .venv/bin/pytest -q`
- `cd backend && .venv/bin/ruff check .`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

## 一句话总结

如果你想找一个工具，帮助你把“日常工作痕迹”一步步整理成“能讲清楚的项目叙事和汇报”，Trace 就是为这个场景做的。
