# Trace

把碎片工作连成一份能讲故事的汇报。

## 是什么

Trace 不是"周报生成器"，是一个个人 AI 工作台。底层模型是：

```
碎片捕获 → 证据（Evidence） → 工作线（Thread） → 成文汇报（Narrative）
```

同一批工作线，按周期窗口观察就是周报、月报、季度复盘，按受众窗口观察就是老板版、1on1、自我反思。

详细产品论点见 [docs/00-vision.md](docs/00-vision.md)。

## 技术栈

- **前端**：Vite + React + TypeScript + Tailwind + TipTap 编辑器
- **后端**：FastAPI + SQLite + OpenAI 兼容 LLM 接入
- **桌面壳（P3）**：Tauri，React 代码复用

## 项目结构

```
Trace/
├── docs/              产品思路 / PRD / 数据模型 / 架构
├── backend/           FastAPI + SQLite
├── frontend/          Vite + React UI
├── scripts/dev.sh     一键起前后端
└── Makefile
```

## 快速开始

首次：

```bash
make setup
```

起开发服务器：

```bash
make dev
```

- 前端 http://localhost:5173
- 后端 http://localhost:8787
- API 文档 http://localhost:8787/docs

## 现在能看到什么（P0 骨架）

- **Home / 今日**：侧边栏导航 + 本周热度线程 mock
- **Thread 详情**：时间线 + AI 概览侧栏（Trace 的灵魂屏幕）
- **Report Composer**：大纲 / 编辑器 / 证据 三栏

## 分期路线

- **P0（本阶段）** 骨架 + 两个灵魂屏幕 + mock 数据贯穿
- **P1** LLM 接入 + 真数据闭环（捕获 → 线程 → 报告）
- **P2** Notes / Todos / Inbox 分拣 / ⌘K 命令面板
- **P3** Tauri 桌面版 + 流式 AI + 主题
- **P4** 钉钉闪记抓取、日历、导出到飞书/Notion
