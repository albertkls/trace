# Trace 1.0 · Mac 发行说明

本文档说明当前仓库如何从开发环境构建出可分发的 Mac 安装包，以及产物包含什么。

## 本次发行做了哪些整理

### 1. 统一了运行形态

过去项目主要面向开发：

- 前端单独跑在 Vite
- 后端单独跑在 FastAPI
- `trace-api` 启动命令默认走 reload
- 没有桌面发行入口

现在整理为三种明确模式：

1. **development**：继续支持 Vite + FastAPI 双进程开发
2. **production**：FastAPI 直接托管构建后的前端静态资源
3. **desktop**：桌面壳启动本地 FastAPI，再通过 pywebview 打开 Trace 窗口

### 2. 加入了发行版基础设施

新增/改造内容：

- `backend/src/trace_api/config.py`
  - 统一读取运行模式、端口、数据目录、CORS 配置
- `backend/src/trace_api/web.py`
  - 自动探测 `frontend/dist`
  - 为 SPA 路由提供 `index.html` fallback
- `backend/src/trace_api/desktop.py`
  - 桌面模式入口
  - 自动找空闲端口、启动内嵌 FastAPI、创建原生窗口
- `scripts/release/build-mac.sh`
  - 自动安装发行依赖
  - 构建 desktop 前端
  - 生成 `Trace.app`
  - 生成 `.dmg`
  - 补写 `Info.plist` 中的版本号与 Bundle Identifier

### 3. 数据目录更适合正式发行

新安装默认使用：

```text
~/Library/Application Support/Trace/db.sqlite
```

桌面发行版默认使用空库启动，不再内置演示数据，也不再自动读取旧开发数据库。

## 构建前提

- macOS
- Python 3.11+
- Node.js / npm
- 系统自带：`hdiutil`、`codesign`、`PlistBuddy`

## 一键打包

在仓库根目录执行：

```bash
make package-mac
```

或：

```bash
bash scripts/release/build-mac.sh
```

## 产物位置

构建完成后可在下面位置找到：

```text
output/macos/Trace.app
output/macos/Trace-1.0.0-macOS.dmg
output/macos/SHA256SUMS.txt
```

同时会生成 PyInstaller 中间产物：

```text
output/macos/pyinstaller-build/
output/macos/pyinstaller-dist/
output/macos/pyinstaller-spec/
```

这些目录默认不入库。

## 安装与运行

### 本机直接运行

双击：

```text
output/macos/Trace.app
```

### 分发给另一台 Mac

优先分发：

```text
output/macos/Trace-1.0.0-macOS.dmg
```

用户打开后，将 `Trace.app` 拖入 `Applications` 即可。

## 未签名说明

当前仓库生成的是**未 notarize / 未 Developer ID 签名**的构建。

因此在目标机器首次运行时，macOS 可能会拦截。常见处理方式：

1. Finder 里右键 `Trace.app` → `Open`
2. 或在终端移除 quarantine：

```bash
xattr -dr com.apple.quarantine /Applications/Trace.app
```

如果后续要做公开分发，建议补充：

- Apple Developer ID 签名
- notarization
- GitHub Release / 官网下载页

## 推荐发布流程

1. 在本机执行 `make test`
2. 执行 `make build-web`
3. 执行 `make package-mac`
4. 手动双击 `Trace.app` 验证首页、线程、汇报、设置页
5. 把源码推送到 GitHub
6. 若需要对外分发，再将 `.dmg` 上传到 GitHub Release

## 本次发行的验证项

建议每次发布至少验证以下内容：

- `/api/health` 可返回 `status/version/mode`
- 前端静态资源由 FastAPI 正常托管
- React Router 深链接（如 `/reports/:id`）不会 404
- 桌面壳能正常打开窗口
- `.app` 与 `.dmg` 都成功生成

## 如果要继续增强

下一步比较值得做的事情：

1. 增加应用图标（`.icns`）
2. 做签名与 notarization
3. 增加自动化 UI smoke test
4. 接入 GitHub Release 自动上传 DMG
5. 增加自动更新机制
