# Project 能力 · 信息架构与页面方案

本文档定义 Project 能力的页面信息架构、主要对象关系、页面级布局建议与关键交互状态，作为 `docs/05-project-prd.md` 的配套文档。

---

## 一、IA 目标

Project 引入后，用户需要同时保留三种视角：

1. **工作线视角**：Thread 是推进单元
2. **项目视角**：Project 是归属与聚合容器
3. **周期视角**：Report 是时间窗口下的叙事输出

信息架构的目标不是新增一个重型模块，而是让用户更顺滑地在这三种视角间切换。

---

## 二、导航调整

## 2.1 一级导航

当前：

- Home
- Inbox
- Threads
- Notes
- Todos
- Reports

调整后：

- Home
- Inbox
- **Projects**
- Threads
- Notes
- Todos
- Reports

### 设计理由

- Project 是新的一级观察窗口
- 它不会替代 Threads / Reports，而是与它们形成互补视角

---

## 三、对象关系的用户心智

建议在产品内始终保持以下心智：

```text
Project（这件事）
  └── Thread（怎么推进）
        └── Evidence / Todo（推进过程中发生了什么）

Note（我对这件事的记录）
Report（我如何把这件事讲出来）
```

### 用户应理解为：

- **Project**：这件事整体是什么
- **Thread**：其中有哪些推进线
- **Note**：我围绕这件事的记录
- **Report**：我如何对外/对内讲述这件事

---

## 四、页面结构

## 4.1 Projects List

### 页面目标

让用户看到“我目前有哪些项目”和“哪些项目最近在动”。

### 页面内容

#### Header

- 页面标题：项目
- 副标题：按更高层上下文组织工作线、记事与汇报
- CTA：`＋ 新建项目`

#### Filters（第一版简单）

- 状态过滤：全部 / active / paused / done / archived
- 排序：最近活跃 / 最近创建 / 名称

#### Project Cards

每张卡片包含：

- 项目名
- 状态 pill
- summary 预览
- 活跃线程数
- 报告数
- 最近活跃时间

### 空状态

- 文案：还没有项目。先为一件中长期工作创建一个容器。
- CTA：创建第一个项目

---

## 4.2 Project Detail

### 页面目标

让用户在单个页面内理解“这个项目整体正在发生什么”。

### 推荐布局

```text
┌────────────────────────────────────────────┐
│ 返回 / 项目名 / 状态 / owner / summary      │
├────────────────────────────────────────────┤
│ 概览卡：线程数 / 活跃线程 / 记事 / 报告      │
├──────────────────────┬─────────────────────┤
│ Threads              │ 最近报告             │
│ - 项目下线程列表      │ - 报告卡片           │
│ - 新建线程            │ - 新建项目报告       │
├──────────────────────┼─────────────────────┤
│ 最近记事              │ 最近活动（可后续）   │
│ - Note 列表           │ - 最近更新摘要       │
│ - 新建项目记事        │                     │
└──────────────────────┴─────────────────────┘
```

### 区域说明

#### A. 项目头部

- 返回 Projects
- 项目名
- 状态
- owner
- summary
- 操作：编辑 / 归档 / 新建报告 / 新建线程

#### B. 概览卡

- 线程数
- active thread 数
- 最近 7 天记事数
- 报告数

#### C. Threads 区域

- 列出该项目下所有 Thread
- 显示状态、最近活跃时间、证据数
- 支持进入 ThreadDetail

#### D. Reports 区域

- 列出挂靠当前项目的 Reports
- 支持快速新建项目报告

#### E. Notes 区域

- 展示最近挂靠当前项目的 Notes
- 支持跳转与快速创建

#### F. Recent Activity（第二阶段增强）

- 第一版可先不做完整项目时间线
- 可先显示“最近更新的 Thread / Note / Report”

---

## 4.3 Threads 页面调整

### 新增内容

- 顶部增加 Project filter
- Thread 卡片上展示项目 pill

### 用户价值

- 用户既可从 Thread 维度扫状态
- 也可快速切到某个 Project 内只看相关 Thread

---

## 4.4 Thread Detail 页面调整

### 新增内容

- 头部展示所属项目 pill
- 点击 pill 可跳到 Project Detail

### 设计价值

让 Thread 不再是孤立页面，而是能回到所属上下文。

---

## 4.5 Notes 页面调整

### 新增内容

- Note 列表支持 Project filter
- 编辑区可选择所属 Project
- Note 行项展示项目名（若存在）

### 设计价值

支持“项目先行，线程后置”的记录方式。

---

## 4.6 Reports 页面调整

### 新增内容

- Report 列表支持 Project filter
- Report 卡片展示项目名
- New Report Modal 支持选择项目

### 创建报告的推荐交互

用户新建报告时：

1. 先选时间范围
2. 再选视角（audience）
3. 可选项目
4. 若已选项目，再可选“限定 threads”

---

## 五、关键创建流程

## 5.1 新建 Project

### 表单字段

- name（必填）
- status（默认 active）
- owner（可选）
- summary（可选）
- color（可选）

### 成功后去向

- 建议直接进入 Project Detail

---

## 5.2 新建 Thread

### 入口

- Threads 页面
- Project Detail 页面

### 规则

- 从 Project Detail 发起时，默认带上 `project_id`
- 从全局 Threads 发起时，用户可选是否挂靠项目

---

## 5.3 新建 Note

### 入口

- Notes 页面
- Project Detail 页面

### 规则

- 从 Project Detail 发起时，默认带当前 `project_id`
- 用户仍可 later 挂多个 threads

---

## 5.4 新建 Report

### 入口

- Reports 页面
- Project Detail 页面
- Thread Detail 页面

### 范围优先级

#### 从 Project Detail 发起

默认：

- `project_id = 当前项目`
- `thread_ids = []`

#### 从 Thread Detail 发起

默认：

- `thread_ids = [当前线程]`
- 若该 Thread 有 Project，可显示项目但不强制绑定

#### 从 Reports 页面发起

由用户自主选择：

- 项目
- 线程范围
- 受众
- 时间周期

---

## 六、过滤与浏览策略

## 6.1 过滤优先级

在 Threads / Notes / Reports 页面中，Project filter 应作为轻量筛选项，而非全局锁定上下文。

### 建议优先级

1. 先按 Project 筛
2. 再按状态 / 时间 / audience 等细分

---

## 6.2 跨页面跳转

建议提供以下跨页跳转：

- Project Detail → Thread Detail
- Thread Detail → Project Detail
- Project Detail → Note
- Project Detail → Report
- Report Card → Project（若存在）

这样用户可以在“项目视角”和“线程视角”之间自然来回切换。

---

## 七、关键状态与空状态

## 7.1 Project 无 Thread

文案建议：

> 这个项目还没有工作线。先创建第一条推进线。

CTA：

- 新建线程

## 7.2 Project 有 Thread 无 Report

文案建议：

> 这个项目已经有工作内容，但还没有形成正式汇报。

CTA：

- 新建项目报告

## 7.3 Project 有 Note 无 Thread

文案建议：

> 你已经围绕这个项目积累了记事，但还没有整理成工作线。

CTA：

- 新建线程
- 从记事整理线程（后续能力）

---

## 八、与现有页面的兼容策略

### 原则

Project 是新增观察窗口，不改变原有主路径：

- 不使用 Project 的用户仍可直接用 Thread / Note / Report
- 原有 Home / Inbox / Threads / Reports 的核心路径不被阻断

### 体现方式

- 所有项目选择器都允许“无项目”
- 所有与项目相关的入口都作为增强而非强制项

---

## 九、未来可扩展但本期不做

### 9.1 项目主页时间线

聚合 Evidence / Note / Todo / Report 的真正时间线。

### 9.2 项目内搜索

支持只在某个项目内搜索。

### 9.3 项目模板

比如“客户项目”“研究项目”“个人成长项目”。

### 9.4 项目推荐

在 Note / Inbox 中自动推荐应归属哪个项目。

---

## 十、页面级验收清单

### Projects List

- [ ] 可查看所有项目
- [ ] 可按状态筛选
- [ ] 可创建新项目

### Project Detail

- [ ] 可查看项目基础信息
- [ ] 可查看其下 Threads
- [ ] 可查看其下 Notes
- [ ] 可查看其下 Reports
- [ ] 可从该页发起新建 Thread / Report

### Threads / Notes / Reports

- [ ] 均可按 Project 过滤
- [ ] 均可展示项目归属

### 创建流程

- [ ] 新建 Thread 可选择项目
- [ ] 新建 Note 可选择项目
- [ ] 新建 Report 可选择项目

---

## 十一、推荐设计原则总结

用一句话概括这一套 IA：

> 用户可以继续像现在一样使用 Trace；但一旦他开始同时推进多件中长期事情，Project 会成为那个把线程、记事和报告串起来的上层视角。
