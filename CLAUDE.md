# Trace 项目开发规范

> 本项目由 AI 开发，本文件是给 AI 阅读的开发流程指南。

## 项目概述

- **项目名**: Trace
- **技术栈**: Tauri 2.x (Rust + React + TypeScript) + FastAPI (Python)
- **版本**: 1.1.0
- **用途**: 个人使用的桌面应用

## 分支策略

```
main        ─────── v1.1.0 ─────── v1.2.0 (正式发布分支)
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
3. 本地测试通过后提交

```bash
git checkout dev
# ... 开发代码 ...
git add .
git commit -m "描述: 完成功能X"
git push origin dev
```

### 2. 提交信息规范

```
类型: 简短描述

类型可选: Feature | Fix | Refactor | Docs | Chore
```

### 3. 构建测试

```bash
# 前端开发
cd frontend && npm run dev

# Tauri 开发模式
cd frontend && npm run tauri:dev

# 全量构建
cd frontend && npm run tauri:build
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
git tag v1.2.0              # 创建标签
git push origin v1.2.0     # 推送标签
```

### 步骤 3: 构建 DMG

```bash
cd frontend
npm run tauri:build
```

DMG 文件位置:
```
frontend/src-tauri/target/release/bundle/dmg/Trace_{版本号}_aarch64.dmg
```

### 步骤 4: 创建 GitHub Release

```bash
gh release create v1.2.0 \
  --title "Trace v1.2.0" \
  --notes "版本说明" \
  "frontend/src-tauri/target/release/bundle/dmg/Trace_1.2.0_aarch64.dmg"
```

或通过 GitHub 网页上传 DMG 文件。

## 目录结构

```
Trace/
├── frontend/               # Tauri 前端 (React)
│   ├── src/               # React 源码
│   ├── src-tauri/         # Tauri/Rust 源码
│   └── dist/              # 构建产物
├── backend/               # FastAPI 后端 (Python)
│   └── src/trace_api/    # API 源码
├── docs/                  # 文档
└── CLAUDE.md             # 本文件
```

## 环境要求

- Node.js 18+
- Rust 1.77+
- Python 3.10+
- macOS (用于构建 DMG)

## 常用命令

```bash
# 安装依赖
cd frontend && npm install
cd backend && pip install -r requirements.txt

# 开发模式
cd frontend && npm run tauri:dev

# 构建发布版
cd frontend && npm run tauri:build

# 运行后端
cd backend && uvicorn src.trace_api.main:app --reload
```

## 版本号规范

采用语义化版本 `主版本.次版本.修订号`：

- **主版本**: 不兼容的重大改动
- **次版本**: 新功能（向后兼容）
- **修订号**: Bug 修复（向后兼容）

## 注意事项

1. 所有开发在 `dev` 分支进行
2. `main` 分支保持稳定，不直接提交
3. 发布前确保 DMG 能正常打开
4. 每次发布前更新 `package.json` 和 `Cargo.toml` 中的版本号
5. 代码修改后运行 `npm run typecheck` 确保类型正确
