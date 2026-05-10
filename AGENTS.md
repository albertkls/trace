# Trace 项目开发规范

> 本项目由 AI 开发，本文件是给 AI 阅读的开发流程指南。

## 项目概述

- **项目名**: Trace
- **技术栈**: FastAPI (Python) + React (TypeScript) + pywebview，使用 PyInstaller 打包成 macOS .app
- **版本**: 1.3.0
- **用途**: 个人使用的桌面应用

> 仓库内同时保留了 `frontend/src-tauri/`（Tauri 2.x 实验外壳），但**正式发布不使用 Tauri**。
> Tauri 打包只产出前端，没有捆绑后端，运行时所有 API 调用都会失败（典型报错：`The string did not match the expected pattern`）。
> **不要使用** `npm run tauri:build` 来产出发布版本。

## 分支策略

```
main        ─────── v1.2.0 ─────── v1.3.0 (正式发布分支)
                             ↖ 合并
dev         ──┬─── 功能A ──── 功能B ──── (日常开发)
              └─── 功能C
```

### 分支说明

| 分支 | 用途 | 保护策略 |
|------|------|----------|
| `main` | 稳定版本，只接收来自 dev 的合并 | 不直接提交 |
| `dev` | 开发版本，所有功能集成地 | 不直接提交 |

### 分支操作

```bash
# 创建开发分支（首次）
git checkout -b dev
git push -u origin dev

# 切换分支
git checkout dev   # 切换到开发
git checkout main  # 切换到正式
```

## 开发流程

### 1. 日常开发

1. 切换到 `dev` 分支
2. 开发新功能或修复问题
3. 本地测试通过后提交并推送到 GitHub

```bash
git checkout dev
# ... 开发代码 ...
git add .
git commit -m "描述: 完成功能X"
git push origin dev
```

### 2. 验证通过后的上传规则

后续所有开发任务在验证通过后，必须直接上传到 GitHub：

1. 代码改动通过必要验证后，提交并推送到 GitHub 对应分支；发布分支为 `main` 时必须推送 `origin/main`
2. 面向用户可见的功能、修复或版本更新，必须按发布流程创建 GitHub Release，并上传 `make package-mac` 生成的 DMG
3. GitHub Release 的版本标签和 DMG 文件名必须与应用版本号一致，确保旧版本 Trace 能通过应用内更新接口发现新版本
4. 发布前必须确认设置页的更新提醒功能可用：旧版本应能检查到 GitHub 最新 Release，并提示用户下载/安装
5. 不允许只在本地完成构建而不上传 GitHub；否则我和其他用户无法从旧版本软件直接更新到最新版本

### 3. 提交信息规范

```
类型: 简短描述

类型可选: Feature | Fix | Refactor | Docs | Chore
```

### 4. 开发与构建命令

```bash
# 一键启动后端 + 前端开发服务器（Vite + FastAPI）
./start.sh

# 只启动前端
cd frontend && npm run dev

# 只启动后端
cd backend && .venv/bin/trace-api --mode development --reload

# 桌面联调（pywebview 运行真实后端窗口）
make desktop

# 类型检查
cd frontend && npm run typecheck
```

## 发布流程

### 发布正式版本

当 `dev` 分支累积了足够的功能或修复后，按以下步骤发布：

### 步骤 1: 合并到 main

```bash
git checkout main
git merge dev
git push origin main
```

### 步骤 2: 打版本标签

```bash
git tag v1.3.0              # 创建标签
git push origin v1.3.0     # 推送标签
```

### 步骤 3: 打包 macOS .app + DMG

> 这是**唯一**正确的发布打包路径。脚本会用 PyInstaller 把 FastAPI 后端、前端 dist、pywebview 打成一个独立的 `.app`，再生成 DMG。

```bash
make package-mac
# 等价于
PY=python3.11 bash scripts/release/build-mac.sh
```

产物位置:

```
output/macos/Trace.app                     # 可直接拖到 /Applications
output/macos/Trace-{版本号}-macOS.dmg      # 可分发的 DMG
output/macos/SHA256SUMS.txt                # 校验和
```

### 步骤 4: 安装到本机测试

```bash
# 删除旧版本（如果存在）
rm -rf /Applications/Trace.app

# 拷贝新版本
cp -R output/macos/Trace.app /Applications/

# 由于未签名，去掉 quarantine 标记
xattr -dr com.apple.quarantine /Applications/Trace.app
```

打开 `/Applications/Trace.app` 验证：新建项目、新建线索、删除项目等核心流程不报错。

### 步骤 5: 创建 GitHub Release 并启用旧版更新提醒

```bash
gh release create v1.3.0 \
  --title "Trace v1.3.0" \
  --notes "版本说明" \
  "output/macos/Trace-1.3.0-macOS.dmg"
```

或通过 GitHub 网页上传 DMG 文件。

> GitHub Release 是应用内更新提醒的来源。发布后，旧版本 Trace 会通过后端 updater 接口读取最新 Release；只要版本号高于当前版本且 Release 内包含 macOS DMG，用户就应该看到更新提醒并能下载更新。

## 目录结构

```
Trace/
├── frontend/               # 前端 (React + Vite)
│   ├── src/               # React 源码
│   ├── src-tauri/         # 实验性 Tauri 外壳（不用于正式发布）
│   └── dist/              # 前端构建产物（被 PyInstaller 打入 .app）
├── backend/               # FastAPI 后端 (Python)
│   └── src/trace_api/    # API 源码 + desktop.py（pywebview 入口）
├── scripts/release/       # macOS 打包脚本
├── output/macos/          # 打包产物（.app / .dmg）
├── docs/                  # 文档
└── AGENTS.md             # 本文件
```

## 环境要求

- Node.js 18+
- Python 3.11（脚本默认 `python3.11`，可用 `PY=...` 覆盖）
- macOS（用于构建 DMG）

## 常用命令

```bash
# 安装依赖
make setup            # 同时初始化 backend venv 和前端依赖

# 开发模式（同时启动 backend + frontend）
./start.sh

# 桌面联调
make desktop

# 打包发布版（macOS）
make package-mac

# 运行测试
make test

# 代码格式化
make fmt
```

## 版本号规范

采用语义化版本 `主版本.次版本.修订号`：

- **主版本**: 不兼容的重大改动
- **次版本**: 新功能（向后兼容）
- **修订号**: Bug 修复（向后兼容）

发布前需要同步更新版本号的位置：

- `frontend/package.json` → `version`
- `frontend/src-tauri/tauri.conf.json` → `version`
- `frontend/src-tauri/Cargo.toml` → `[package] version`
- `backend/pyproject.toml` → `[project] version`（**打包脚本读取这里**）

## 注意事项

1. 所有开发在 `dev` 分支进行
2. `main` 分支保持稳定，不直接提交
3. 发布前用 `make package-mac` 产出的 `.app` 实际打开测试一遍
4. **不要使用** `npm run tauri:build` 产出发布版本——那条路径没有打包后端，运行时 API 调用全部失败
5. 代码修改后运行 `npm run typecheck` 确保类型正确
6. 开发验证通过后必须推送 GitHub；用户可见版本必须发布 GitHub Release + DMG，保证旧版应用可直接收到更新提醒并升级
