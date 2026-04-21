# Project 能力 PRD

## 一、文档目的

本文档定义 Trace 中“Project（项目）”能力的产品需求。目标是在不把 Trace 做重成 Jira / Linear 的前提下，为现有 `Thread / Note / Report` 增加一个更高层的归属与聚合容器，让用户可以从“项目视角”理解、整理并输出工作叙事。

Project 在 Trace 里的定位不是“流程引擎”，而是**叙事容器（Narrative Container）**。

---

## 二、背景与问题

### 2.1 当前产品模型

Trace 当前核心模型为：

```text
碎片捕获 → 证据（Evidence） → 工作线（Thread） → 成文汇报（Narrative）
```

其中 Thread 是核心原生概念，已经很好地承载了跨时间推进的一条工作线。

### 2.2 当前缺口

当用户同时推进多个中长期主题时，仅有 Thread 不足以表达更上层的工作上下文：

- 多条 Thread 共同服务于同一个更高层目标
- Notes 可能先属于某个工作域，但暂时还没有拆分成具体 Thread
- Reports 常常希望按“项目”生成，而不是每次手动挑选多个 thread
- 用户希望知道：**这个项目最近做了什么、卡在哪里、有哪些相关记事和报告**

### 2.3 当前仓库里的信号

当前实现已经出现了“项目感”，但还不是一等模型：

- `thread` 已存在 `project` 字段，但仅为字符串
- `note` 目前通过 `thread_ids_json` 间接关联工作上下文
- `report` 目前通过 `thread_ids_json` 决定范围
- 报告中的 Evidence hydrate 已携带 `thread_project`

这意味着产品已需要“项目视角”，但尚未正式建模。

---

## 三、产品目标

### 3.1 本期目标

为 Trace 增加一等的 `Project` 实体，并支持以下对象挂靠到项目：

- Thread
- Note
- Report

用户可因此获得：

1. 项目列表与项目详情页
2. 在线程、记事、报告创建/编辑时选择项目
3. 按项目过滤内容
4. 从项目视角生成周期报告与阶段复盘
5. 为 AI 提供更完整的项目上下文

### 3.2 非目标

本期不做：

- 甘特图、依赖关系、里程碑排期
- 团队协作、权限、评论、审阅流
- Jira / Linear 式 issue 管理
- 一个 Thread 同时属于多个 Project 的多对多模型
- Evidence 直接绑定 `project_id`
- 自动聚类成项目、自动新建项目

---

## 四、产品原则

### 原则 1：Project 是叙事容器，不是流程引擎

Project 的作用是聚合上下文、组织叙事，不承载复杂项目管理逻辑。

### 原则 2：Thread 仍然是推进单元

Project 在 Thread 之上，不替代 Thread。  
Thread 负责“推进什么”，Project 负责“这些推进共同属于哪件事”。

### 原则 3：轻量优先

第一版优先支持：

- 单项目挂靠
- 基础过滤与浏览
- 基于项目生成报告

避免引入重型配置和多对多复杂性。

### 原则 4：直接挂靠优先，继承归属辅助

- Thread / Note / Report 可直接挂靠 Project
- Todo / Evidence 第一版通过 Thread 继承理解其项目归属

### 原则 5：兼容当前心智

用户即使完全不用 Project，现有 Trace 工作流也应继续成立。

---

## 五、核心概念定义

### 5.1 Project

一个中长期工作上下文，用于聚合多条 Thread、相关 Notes 与 Reports。

示例：

- 日本市场验证
- Q3 增长实验
- 新版权限系统
- 个人职业发展

### 5.2 Thread

项目中的一条工作推进线。  
一个 Thread 最多属于一个主 Project，也可以不属于任何 Project。

### 5.3 Note

一个按天归档的 Markdown 长文记录。  
Note 可以：

- 直接挂到某个 Project
- 同时关联多个 Thread

### 5.4 Report

一个在特定周期和受众窗口下的叙事输出。  
Report 可以：

- 基于项目生成
- 基于若干 threads 生成
- 项目内再细化选择 threads

---

## 六、目标用户与场景

### 6.1 目标用户

- 同时推进多个主题的知识工作者
- 经常需要写周报/月报/复盘的人
- 既需要“随手记”，又需要“阶段输出”的个人用户

### 6.2 关键场景

#### 场景 A：一个项目下有多条 Thread

“日本市场验证”项目下可能同时有：

- 用户访谈
- 渠道验证
- 定价策略
- 合作伙伴沟通

用户需要项目级总览，而不是只看到分散线程。

#### 场景 B：先记事，后整理

用户知道某条笔记属于“Q3 增长实验”，但还没拆到具体 Thread。  
此时 Project 提供一个稳定的上层归属。

#### 场景 C：项目周报 / 项目复盘

用户希望直接生成：

- 这个项目本周进展
- 这个项目 4–6 月阶段复盘

而不是每次重新选 Thread 范围。

#### 场景 D：项目内浏览与回顾

用户想回答：

- 这个项目最近有哪些风险？
- 这个项目有哪些相关记事？
- 这个项目已经输出过哪些报告？

---

## 七、功能范围

## 7.1 模块一：Project 基础实体

### 用户能力

- 创建 Project
- 编辑 Project 名称 / 状态 / Owner / 摘要 / 颜色
- 查看 Project 列表
- 查看 Project 详情
- 归档 Project

### 字段建议

- `id`
- `name`
- `status`
- `owner`
- `summary`
- `color`
- `created_at`
- `updated_at`

### 状态

- `active`
- `paused`
- `done`
- `archived`

---

## 7.2 模块二：Thread 挂靠 Project

### 用户能力

- 创建 Thread 时可选 Project
- 编辑 Thread 时可修改 Project
- Threads 页面支持按 Project 过滤
- Project 详情页展示其下 Threads

### 约束

- 一个 Thread 最多属于一个主 Project
- Thread 可不属于任何 Project

---

## 7.3 模块三：Note 挂靠 Project

### 用户能力

- 创建 Note 时可选 Project
- 编辑 Note 时可修改 Project
- Notes 页面支持按 Project 过滤
- Project 详情页展示最近 Notes

### 关系说明

Note 允许同时：

- 直接挂 `project_id`
- 关联多个 `thread_ids`

这是允许且合理的，因为 Project 是上层上下文，Thread 是更细粒度的推进线。

---

## 7.4 模块四：Report 挂靠 Project

### 用户能力

- 创建 Report 时可选 Project
- Reports 页面支持按 Project 过滤
- Project 详情页展示相关 Reports
- 用户可直接“新建项目报告”

### 范围规则

#### 模式 A：按项目出报告

- 指定 `project_id`
- 默认纳入该项目下所有线程在周期内的 Evidence

#### 模式 B：项目内限定线程

- 指定 `project_id`
- 再指定 `thread_ids`
- 表示项目内的局部观察窗口

#### 模式 C：保持旧逻辑

- 不指定 `project_id`
- 继续按 `thread_ids` 使用

---

## 7.5 模块五：Project 详情页

Project 详情页是第一版的核心承载页。

### 页面目标

让用户从“一个项目”的角度看到：

- 这件事是什么
- 最近推进了什么
- 有哪些工作线
- 有哪些记事
- 输出过哪些报告

### 信息结构

1. **项目头部**
   - 名称
   - 状态
   - owner
   - summary
   - 最近活跃时间

2. **聚合概览**
   - 线程总数
   - 活跃线程数
   - 最近记事数
   - 报告数

3. **Threads**
   - 项目下工作线列表

4. **Notes**
   - 最近挂靠项目的记事

5. **Reports**
   - 已有报告
   - 新建项目报告入口

6. **Recent Activity（可选）**
   - 第一版可不做完整时间线
   - 可先以“最近更新列表”形式出现

---

## 7.6 模块六：项目过滤与导航

### 一级导航

在现有导航中新增：

- `Projects`

### 过滤需求

- Threads 支持按 Project 过滤
- Notes 支持按 Project 过滤
- Reports 支持按 Project 过滤

### 第一版不做

- 全局项目上下文锁定
- 项目级命令面板作用域

---

## 7.7 模块七：AI 与项目上下文

当用户基于 Project 生成 Report 时，LLM 除 evidence_lines 之外，需额外获得：

- Project.name
- Project.summary
- Project.status
- 项目下 thread 标题集合

### 预期收益

- 生成更连贯的项目叙事
- 输出更稳定地围绕项目目标组织
- 更适合阶段复盘与项目周报

---

## 八、用户故事

### US-01

作为一个同时推进多个主题的用户，我希望创建 Project，以便把不同 Thread 组织到同一工作上下文。

### US-02

作为一个经常先写 Note 再整理的人，我希望 Note 能先挂靠某个 Project，以便我先确定“属于哪件事”。

### US-03

作为一个需要定期汇报的人，我希望直接按 Project 生成报告，而不是每次重新选择多个 Threads。

### US-04

作为一个需要回顾项目的人，我希望进入项目详情页后就能看到相关 Threads / Notes / Reports。

### US-05

作为一个已有旧数据的用户，我希望即使不使用 Project，也不会破坏现有使用方式。

---

## 九、关键交互要求

### 9.1 项目选择器

适用于：

- New Thread
- Note Editor
- New Report
- Thread Report

要求：

- 支持“不挂项目”
- 支持快速搜索
- 默认展示最近活跃项目

### 9.2 项目标识

在以下位置显示 Project pill：

- Thread 卡片
- Thread Detail 头部
- Note 列表 / 编辑页
- Report 卡片 / 编辑页

### 9.3 新建入口

至少有三类入口：

- Projects 页内新建项目
- 项目详情页内新建 Thread / Report
- 通用创建表单中选择项目

---

## 十、成功指标

### 10.1 使用指标

1. 创建项目后 7 天内，有内容挂靠的项目占比
2. 基于项目创建报告的比例
3. 平均每个项目下关联 Thread 数
4. 项目详情页的周访问次数

### 10.2 体验指标

1. 创建报告时手动挑选 Threads 的频次下降
2. 用户在 Note / Thread / Report 创建时更快确定归属
3. AI 生成报告后的人手改写量下降

---

## 十一、风险与权衡

### 风险 1：产品变重

用户可能误以为 Trace 要转向项目管理工具。

**缓解：**

- 文案强调“工作上下文 / 项目视角”
- 不引入 issue、依赖、排期等机制

### 风险 2：归属不一致

比如 Note 属于项目 A，但关联的 Thread 属于项目 B。

**缓解：**

- 第一版允许
- 在 UI 中做轻提示，不做强阻断

### 风险 3：历史数据迁移复杂

`thread.project` 当前是自由文本，不是结构化 ID。

**缓解：**

- 自动按名称尝试匹配或创建 Project
- 无法可靠映射的保留为空

### 风险 4：项目下证据过多导致 AI 输入膨胀

**缓解：**

- 严格按周期筛选 Evidence
- 后续可按 importance / recent activity 裁剪

---

## 十二、验收标准

### 功能验收

- [ ] 用户可创建 / 编辑 / 归档 Project
- [ ] Thread 可挂靠 Project
- [ ] Note 可挂靠 Project
- [ ] Report 可挂靠 Project
- [ ] 存在 Projects 列表页
- [ ] 存在 Project 详情页

### 浏览与过滤验收

- [ ] Threads 可按 Project 过滤
- [ ] Notes 可按 Project 过滤
- [ ] Reports 可按 Project 过滤

### 报告验收

- [ ] 用户可基于 `project_id` 创建报告
- [ ] compose 时可纳入项目上下文
- [ ] 若同时传入 `project_id + thread_ids`，范围正确收敛到项目内选定线程

### 兼容性验收

- [ ] 不挂项目的 Thread / Note / Report 仍可正常工作
- [ ] 旧数据不会因 Project 能力引入而损坏
- [ ] `thread.project` 有迁移路径

---

## 十三、分期建议

### Phase 1：最小可用版本

- 新增 Project 表
- Thread / Note / Report 增加 `project_id`
- Projects List
- Project Detail（基础版）
- 创建与编辑时项目选择器
- 按项目过滤 Threads / Notes / Reports

### Phase 2：项目视角增强

- 项目详情页聚合统计优化
- 项目报告入口与更细的过滤
- 更明确的最近活动视图

### Phase 3：智能推荐

- Inbox 整理时推荐项目
- Note 自动推荐项目
- AI 项目风险 / 下步总结

---

## 十四、决策摘要（ADR 简版）

### Decision

引入一等 Project 实体，作为 Thread / Note / Report 的上层归属与叙事容器。

### Drivers

- 更强的上下文聚合
- 更低的报告生成成本
- 更好的 AI 输出质量
- 保持现有 Thread 中心模型不变

### Alternatives

#### A. 继续使用 `thread.project` 字符串

优点：实现最简单  
缺点：无法承载项目详情、过滤、统一归属与聚合视图

#### B. 只让 Thread 支持 Project

优点：改动较小  
缺点：无法满足“项目记事”和“项目报告”的核心场景

#### C. 引入一等 Project，并扩展到 Thread / Note / Report

优点：模型完整、收益最大  
缺点：需要 schema、API、UI 和迁移配套

### Chosen

选择 C。
