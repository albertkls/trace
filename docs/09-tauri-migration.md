# Trace · Tauri 迁移说明（进行中）

本文档记录 Trace 从 `pywebview` 桌面壳迁移到 `Tauri` 的最小落地路线，以及当前已经完成的迁移骨架。

---

## 1. 迁移原因

现有 `pywebview + macOS Cocoa` 桌面壳在窗口装饰能力上存在明显边界：

- 无法稳定得到真正可用的 frameless 窗口
- 顶部原生标题栏与应用主题存在割裂感
- 自定义窗口控制与拖拽行为扩展成本高

Tauri 更适合承接 Trace 的下一代桌面壳：

- 更成熟的自定义窗口装饰能力
- 更适合做完全一体化标题栏
- 与 React 前端的自定义标题栏模式天然契合

---

## 2. 当前迁移状态

仓库里已经新增并接入：

### 2.1 Tauri 工程骨架

位置：

- `frontend/src-tauri/`

包含：

- `Cargo.toml`
- `build.rs`
- `src/main.rs`
- `src/lib.rs`
- `tauri.conf.json`
- `capabilities/default.json`

### 2.2 前端已完成的适配

- `frontend/src/lib/appInfo.ts`
  - 可识别 Tauri 运行时
- `frontend/src/components/DesktopTitlebar.tsx`
  - 自定义桌面顶部栏
- `frontend/src/lib/desktopWindow.ts`
  - 接入 `@tauri-apps/api/window`
  - 支持 close / minimize / toggleMaximize

### 2.3 npm 脚本

新增：

- `npm run tauri:dev`
- `npm run tauri:build`

---

## 3. 当前目标

当前阶段的目标不是“一次性完全替换 pywebview 打包链路”，而是：

> 先把 Tauri 作为新的桌面壳骨架接进仓库，让前端自定义标题栏和窗口控制先有落脚点。

---

## 4. 当前 Tauri 配置

### 开发模式

- `devUrl = http://127.0.0.1:5173`
- `beforeDevCommand = bash ../start.sh`

含义：

- 仍使用现有 Vite + FastAPI 开发链路
- Tauri 先作为新的桌面壳承载前端

### 构建模式

- `beforeBuildCommand = npm run build:desktop`
- `frontendDist = ../dist`

含义：

- 构建时先生成 desktop 前端 bundle
- Tauri 使用该前端产物

### 窗口配置

- `decorations: false`
- 自定义窗口尺寸与最小尺寸

---

## 5. 当前已完成的能力

### 已完成

- Tauri 工程初始化
- 前端运行时识别 Tauri
- 自定义顶部栏组件
- 顶部栏按钮调用 Tauri 窗口 API
- Tauri 权限配置（close / minimize / toggle-maximize / start-dragging）

### 未完成

- 正式打通 `tauri dev`
- 正式打通 `tauri build`
- 让 Python backend 成为 Tauri 可分发 sidecar
- 完整替换现有 `pywebview + PyInstaller` 打包链路

---

## 6. 推荐迁移路线

### 阶段 1：前端壳替换（当前阶段）

目标：

- 让 Tauri 成为新的桌面窗口壳
- 保留现有 React 前端
- 保留现有 FastAPI backend

### 阶段 2：开发链路打通

目标：

- 让 `npm run tauri:dev` 可跑起来
- 确认：
  - 窗口创建
  - 自定义标题栏
  - 窗口控制
  - 页面加载

### 阶段 3：生产链路打通

目标：

- 让 backend 作为 sidecar 被 Tauri 启动
- 或者让 Tauri 在生产态能稳定连接本地 backend 服务

### 阶段 4：正式替换打包链路

目标：

- 从 `pywebview + PyInstaller` 切到 `tauri build`
- 产出新的 `.app / .dmg`

---

## 7. 当前风险

### 风险 1：后端分发方式还没定型

当前 backend 仍是 Python/FastAPI。  
Tauri 本身是 Rust 壳，后续需要明确：

- sidecar binary 打包方案
- 本地进程生命周期管理
- 日志 / 端口 / 崩溃恢复策略

### 风险 2：当前是“开始迁移”，不是“迁移完成”

当前仓库已经具备 Tauri 迁移骨架，但还没有完全替换正式桌面方案。

---

## 8. 下一步建议

最优先建议：

1. 先跑通 `tauri dev`
2. 再设计 Python backend sidecar 策略
3. 最后替换正式打包链路

---

## 9. 结论

当前状态可以理解为：

> Trace 已从“决定要迁移 Tauri”进入“仓库内正式开始迁移”的阶段。

下一步最重要的不是再调 pywebview，而是：

> **把 Tauri 开发链路真正跑起来。**
