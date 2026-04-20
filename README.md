# Trace 1.0

把碎片工作连成一份能讲故事的汇报。

## 是什么

Trace 不是“周报生成器”，而是一个本地优先的个人 AI 工作台。核心模型是：

```text
碎片捕获 → 证据（Evidence） → 工作线（Thread） → 成文汇报（Narrative）
```

同一批工作线，按周期窗口观察就是周报、月报、季度复盘；按受众窗口观察就是老板版、1on1、自我反思。

详细产品论点见 [docs/00-vision.md](docs/00-vision.md)。

## 1.0 发行版包含什么

- **开发模式**：Vite 前端 + FastAPI 后端，适合功能开发与调试
- **生产模式**：FastAPI 直接托管前端静态资源，形成单端口发行版
- **桌面模式**：`pywebview` 封装本地 WebView，启动内嵌后端并直接打开 Trace 窗口
- **Mac 打包链路**：`PyInstaller` 生成 `Trace.app`，`hdiutil` 生成 `.dmg` 安装包
- **本地优先数据目录**：新安装默认写入 `~/Library/Application Support/Trace/db.sqlite`

## 技术栈

- **前端**：Vite + React + TypeScript + Tailwind
- **后端**：FastAPI + SQLite + OpenAI 兼容 LLM 接入
- **桌面壳**：pywebview
- **打包**：PyInstaller + hdiutil（macOS）

## 项目结构

```text
Trace/
├── backend/                 FastAPI + SQLite + desktop launcher
├── frontend/                React / Vite UI
├── docs/                    产品与架构文档
├── scripts/dev.sh           一键开发启动
├── scripts/release/         发行版与安装包脚本
├── start.sh                 本地开发启动器
└── Makefile
```

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

可访问：

- 前端 http://localhost:5173
- 后端 http://localhost:8787
- API 文档 http://localhost:8787/docs

### 2) 本地桌面预览

```bash
make desktop
```

这会安装桌面依赖，并以本地 WebView 方式启动 Trace。

### 3) 打包为 Mac 安装包

```bash
make package-mac
```

产物位置：

- `output/macos/Trace.app`
- `output/macos/Trace-1.0.0-macOS.dmg`

> 当前为**未签名**构建；在另一台 Mac 首次打开时，可能需要右键 `Open`，或移除下载隔离属性后再运行。

## 常用命令

```bash
make setup         # 安装前后端依赖
make dev           # 启动开发环境
make build-web     # 仅构建前端生产静态资源
make desktop       # 本地桌面模式运行
make package-mac   # 构建 Trace.app 与 DMG
make test          # 跑后端测试
make fmt           # Ruff 检查 / 格式化
```

## 发行版运行方式

### 开发模式

```text
Vite (:5173)  ──proxy──▶ FastAPI (:8787) ──▶ SQLite
```

### 生产 / 发行模式

```text
FastAPI (静态资源 + /api) ──▶ SQLite
```

### 桌面模式

```text
pywebview 窗口 ──▶ 内嵌 FastAPI 服务 ──▶ SQLite
```

## 数据与配置

默认数据库位置：

- 新安装：`~/Library/Application Support/Trace/db.sqlite`

常见环境变量：

- `TRACE_DB_PATH`：手动指定数据库路径
- `TRACE_FRONTEND_DIST`：手动指定前端构建目录
- `TRACE_RUNTIME_MODE`：`development` / `production` / `desktop`

## 校验状态

当前仓库已通过：

- `backend/.venv/bin/pytest -q`
- `backend/.venv/bin/ruff check .`
- `cd frontend && npm run build`
- `scripts/release/build-mac.sh`

## 详细说明

- [docs/03-architecture.md](docs/03-architecture.md)
- [docs/04-release-macos.md](docs/04-release-macos.md)
