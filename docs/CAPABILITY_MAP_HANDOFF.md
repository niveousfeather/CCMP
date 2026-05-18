# 能力图谱模块交接文档

更新时间：2026-05-14

## 1. 模块定位

「能力图谱」是一个新的独立工作区，用于面向专业领域持续整理能力结构、资料证据和关系网络。

第一版只规划：

```text
具身智能能力图谱
```

该模块不属于 Word、PPT、Excel、图片生成、视频生成、3D 工作区、知识图谱、普通聊天或 Agent 主链路。后续可以扩展到其他专业，但扩展方式应保持独立目录和独立 service。

本轮只建立目录边界、README、架构说明和类型草案，不实现正式页面、真实 API、真实搜索、真实模型调用、真实导出、定时任务或数据库写入。

## 2. 严格边界

本模块只能在 capability-map 相关目录内开发。

禁止修改：

```text
Word
PPT
Excel
图片生成
视频生成
3D 工作区
知识图谱
普通聊天
Agent 主链路
模型路由
用户系统
历史记录
设置页
```

禁止复用 Word/PPT/Excel 的业务生成链路。禁止为了能力图谱调整现有模型配置、API key 读取逻辑、公共组件或已有 route。

允许的目录范围：

```text
app/capability-map/
app/api/capability-map/
components/capability-map/
lib/capability-map/
scripts/capability-map/
data/capability-map/
docs/
```

## 3. 允许调用的能力

能力图谱后续允许调用：

```text
Agent 普通对话模型
Agent 后台任务模型
Image 图像模型
自建网页搜索
```

调用要求：

- 只能通过独立的 capability-map service 调用。
- 不允许修改这些模型本身的配置。
- 不允许改其他模块的调用逻辑。
- 不允许复用 Word/PPT 的业务链路。
- API key 只读，不新增混用逻辑。
- 前端不得暴露底层模型名、provider、baseURL 或 API key。

建议后续封装一个 capability-map 内部 service 层，由它统一调用搜索、摘要、归类、图谱更新和导出模块。

## 4. 未来功能规划

能力图谱模块未来要支持：

```text
定期联网搜集资料
自动整理专业能力结构
生成能力节点和关系
网页可视化查看
导出 CSV / XLSX / Markdown / DOCX
支持手动刷新
支持定时任务
支持资料来源追踪
```

第一版开发时应先做静态展示和本地数据格式校验，再接入搜索和模型摘要。不要一开始把搜索、模型、导出和可视化全部耦合在页面里。

## 5. 具身智能建设建议

建议初始一级能力方向：

```text
感知理解
多模态融合
空间认知
任务规划
运动控制
机器人操作
仿真训练
强化学习
世界模型
人机交互
具身大模型
数据集与评测
硬件平台
产业应用
```

建议资料关键词：

```text
具身智能
embodied AI
embodied intelligence
robot foundation model
vision language action model
VLA model
robot learning
humanoid robot AI
world model robotics
robot manipulation benchmark
```

建议节点类型：

```text
domain
capability
skill
tool
paper
company
dataset
benchmark
application
```

建议关系类型：

```text
includes
depends_on
enables
evaluated_by
used_in
related_to
evidenced_by
```

## 6. 推荐技术架构

推荐数据流：

```text
用户进入能力图谱工作区
→ 选择专业：具身智能
→ 手动/定时 refresh
→ 自建搜索搜集资料
→ Agent 后台任务模型摘要和归类
→ 生成 graph.json / evidence.json
→ 页面读取图谱
→ 可视化展示
→ 导出表格或文档
```

推荐分层：

- 页面层：只负责工作区布局、专业选择、状态展示和交互入口。
- API 层：只暴露 capability-map 自己的读取、刷新、导出接口。
- Service 层：封装搜索、模型摘要、节点抽取、关系合并、证据归档。
- Storage 层：负责读写 graph/evidence/refresh-log/export 文件。
- Export 层：负责 CSV / XLSX / Markdown / DOCX 导出。
- Scheduler 层：负责后续定时刷新，不直接写页面逻辑。

## 7. 建议目录结构

后续建议结构：

```text
lib/capability-map/types.ts
lib/capability-map/sources.ts
lib/capability-map/search.ts
lib/capability-map/extract.ts
lib/capability-map/graph.ts
lib/capability-map/storage.ts
lib/capability-map/export.ts
lib/capability-map/scheduler.ts
components/capability-map/
app/capability-map/
app/api/capability-map/
data/capability-map/
```

本轮实际只创建 README、`lib/capability-map/types.ts` 和 `lib/capability-map/architecture.md`。不要把建议文件误认为已经实现。

## 8. 数据文件规划

建议后续存储：

```text
data/capability-map/embodied-ai/graph.json
data/capability-map/embodied-ai/evidence.json
data/capability-map/embodied-ai/refresh-log.json
data/capability-map/embodied-ai/exports/
```

建议数据职责：

- `graph.json`：节点、关系、版本、更新时间。
- `evidence.json`：资料来源、标题、链接、摘要、关键词、访问时间、关联节点。
- `refresh-log.json`：刷新模式、query、耗时、成功/失败状态、错误摘要。
- `exports/`：导出产物，后续按日期或 refresh id 分目录存放。

本轮不写真实 graph/evidence 数据，不生成 exports。

## 9. 后续实施阶段

阶段 1：工作区页面骨架。

阶段 2：基础图谱静态展示。

阶段 3：自建搜索接入。

阶段 4：资料摘要与归类。

阶段 5：图谱增量更新。

阶段 6：导出 CSV / Markdown。

阶段 7：定时任务。

阶段 8：图谱可视化增强。

阶段 9：多专业扩展。

每个阶段都应先在 capability-map 目录内完成，验收通过后再讨论是否需要最小导航入口。

## 10. 本轮验收标准

本轮只验收：

```text
新增 capability-map 相关目录
新增 README / 架构说明 / 交接文档
新增类型草案
没有正式业务逻辑
没有改动其他模块
TypeScript 不报错
```

本轮明确不做：

```text
真实页面
真实 API
真实搜索
真实模型调用
真实图谱生成
真实导出
定时任务
数据库写入
```

## 11. 当前新增文件

```text
app/capability-map/README.md
app/api/capability-map/README.md
components/capability-map/README.md
lib/capability-map/README.md
lib/capability-map/types.ts
lib/capability-map/architecture.md
scripts/capability-map/README.md
data/capability-map/README.md
docs/CAPABILITY_MAP_HANDOFF.md
```

## 12. 交接提醒

后续开发者接手时，第一步应先阅读本文件和 `lib/capability-map/architecture.md`，确认边界后再开始实现。

若需要接入现有模型、搜索或导出能力，必须先在 `lib/capability-map/` 内建立适配层，不能直接改现有模块调用逻辑。
