# 架构

## 分层

```
┌─────────────────────────────────────────────────┐
│ Frontend  Vite + React + TS + Tailwind + TipTap │
│           React Router · TanStack Query         │
├─────────────────────────────────────────────────┤
│                     HTTP /api                   │
├─────────────────────────────────────────────────┤
│ Backend   FastAPI · Uvicorn · Pydantic v2       │
│           Services: capture / thread / report   │
│           LLM 客户端（OpenAI 兼容）              │
├─────────────────────────────────────────────────┤
│ Storage   SQLite + FTS5 + 本地文件归档           │
└─────────────────────────────────────────────────┘
```

## 部署形态

### Web 模式（开发 + 长期）
```
frontend (5173) ──▶ backend (8787) ──▶ SQLite（新安装默认位于 ~/Library/Application Support/Trace）
```

### 发行模式（生产）
```
backend (静态资源 + /api) ──▶ SQLite
```

### 桌面模式（当前发行版）
pywebview 壳包装前端，启动时在本地拉起 FastAPI 并在 WebView 中打开 Trace。
默认数据目录为：

```
~/Library/Application Support/Trace/db.sqlite
```

## 模块职责

### backend/src/trace_api
- `main.py` FastAPI app 装配 + CORS + lifespan
- `config.py` 运行模式 / 端口 / 数据目录 / CORS 配置
- `db.py` SQLite 连接 + schema 应用 + FTS 维护
- `web.py` 生产静态资源托管 + SPA fallback
- `desktop.py` Mac 桌面入口（pywebview + 内嵌 uvicorn）
- `schema.sql` 建表语句
- `routers/`
  - `captures.py` 导入 / 快记 / 列 Inbox
  - `threads.py` 列表 / 详情 / 合并 / 归档
  - `reports.py` 列表 / 草稿 / 生成 / AI 改写
  - `settings.py` LLM profile CRUD / 测试连通
- `services/`
  - `llm.py` OpenAI 兼容客户端
  - `clustering.py` 证据聚类到线程
  - `rendering.py` 成文 Markdown 生成

### frontend/src
- `app/` 路由壳
- `pages/` 一个文件一个屏
  - `Home.tsx`
  - `ThreadDetail.tsx` ★ 灵魂屏幕
  - `ReportComposer.tsx` ★ 灵魂屏幕
- `components/` 复用组件
  - `Shell` 壳（侧栏 + 顶栏 + 主区）
  - `EvidenceChip` 证据小药丸
  - `StatusDot` 状态指示
  - `CommandPalette` ⌘K（P2）
  - `QuickCapture` ⌘⇧N（P2）
  - `RichEditor` TipTap 封装
- `lib/`
  - `api.ts` 前端 API 客户端（fetch 封装）
  - `mock.ts` P0 mock 数据
  - `types.ts` 与后端 Pydantic 一致的 TS 类型

## 设计原则

1. **本地优先**：所有状态落 SQLite，LLM 只是调用
2. **后端不持有 UI 状态**：前端管页面状态，后端是 REST
3. **Server-Sent Events for streaming**：LLM 输出走 SSE，不是 WebSocket（更简单）
4. **schema 演进**：只加列、只加表，不删；破坏性改动走 migration 脚本
5. **mock 先行**：每个屏先用 mock 数据跑起来，UI 稳定后再接真 API

## 目录命名约定

- Python snake_case
- TypeScript camelCase / PascalCase
- 文件路径全小写，单词间连字符

## Dev 体验

- `make dev` 同时起前后端
- `make desktop` 本地桌面模式运行
- `make package-mac` 构建 `Trace.app` 与 `.dmg`
- `make reset` 清本地 SQLite
- `make fmt` ruff + prettier
- `make test` pytest + vitest
