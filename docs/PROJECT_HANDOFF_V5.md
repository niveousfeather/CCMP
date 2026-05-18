# NexusAI 项目交接文档 V5

> 更新时间：2026-05-10  
> 工作区：`E:\AI project\codex\WEByunming`  
> 当前重点：Agent 任务路由稳定化、Office 文件生成链路、PPT 高质量生成 V1/V2

## 1. 项目当前阶段

NexusAI 现在已经从“基础平台和多模块搭建”推进到“Agent + 文件生成质量提升”阶段。

目前最核心的开发主线是：

1. 普通对话保持快速响应，由 `gpt-5.4` 作为主聊天模型处理。
2. 只有当用户明确要求生成 Word、PPT、Excel、图片等功能型产物时，才进入后台 Agent 任务链路。
3. 后台任务主模型为 `claudecoder:gpt-5.4`，Kimi 作为文件理解和 fallback。
4. PPT 生成正在从“能生成文件”升级到“内容充实、有配图、有排版、可教学/可汇报”的高质量生成阶段。

一句话概括：现在不是在重做平台，而是在把 Nexus Agent 做成真正能稳定产出文件的工作型智能体。

## 2. 当前已经具备的功能

### 2.1 平台基础能力

项目基于 Next.js 15、React 19、TypeScript、Prisma 构建，已有基础平台能力：

- 登录、用户管理、角色控制和每日配额
- 管理后台和工作台基础页面
- 资产、历史记录、侧边栏等工作台支撑能力
- API 路由、模型配置、任务路由和文件生成模块骨架
- 多模型 provider 配置和前后端展示名解耦

### 2.2 Nexus Agent 对话能力

Agent 对话页已经具备：

- 普通聊天快速回复
- 自动识别任务类型
- 文件上传后的任务处理
- 附件卡片、代码块、网页引用等消息展示
- 前端统一显示为 `Nexus AI`，不暴露底层模型名
- 任务失败时前端可简洁提示用户生成失败并建议重试

当前约定：

- 普通对话、一般问答、无需产物生成的问题，默认由 `gpt-5.4` 处理。
- 文件生成、PPT、Word、Excel、图片等功能任务，进入后台异步任务。
- 用户侧不显示任何底层模型名，统一显示为 “Nexus AI 正在思考 / 正在联网搜索 / 正在生成文件”。

### 2.3 模型路由能力

当前模型分工已经明确：

| 场景 | 模型/服务 | 说明 |
| --- | --- | --- |
| 普通聊天 | `gpt-5.4` | 主聊天模型，优先保证响应速度 |
| 普通问答/一般搜索问答 | `gpt-5.4` | 不触发文件生成时，由主聊天模型完成 |
| 后台任务主模型 | `gpt-5.4` | provider 为 `claudecoder`，用于任务规划和复杂生成 |
| 文件理解/兜底 | `kimi-k2.5` | provider 为 `moonshot`，用于文件解析、总结和 fallback |
| PPT 配图生成 fallback | `jimeng-image-2.1` | 优先联网搜图，搜不到或不合适时再用即梦生成 |

关键配置文件：

- `lib/agent/models.ts`
- `lib/agent/router.ts`
- `lib/agent/task-router.ts`

### 2.4 Word 文档能力

Word 模块已经拆分成独立内部能力，后续可复用到 Agent、独立 Word 页面和文档修改任务。

当前已支持：

- 无文件时生成新的 Word 文档
- 上传 `.docx` 后保留原格式修改
- 上传 `.docx` 后基于批注进行修订
- Word 生成链路已接入 Agent 文件任务体系

关键文件：

- `lib/document/create.ts`
- `lib/document/revise-comments.ts`
- `lib/document/revise-original.ts`
- `lib/document/docx-package.ts`
- `lib/document/docx-comments.ts`
- `lib/document/docx-paragraphs.ts`
- `lib/agent/skills/create-document.ts`

注意：生成的 Word/PPT 文档中不要写入平台宣传语或签名，例如“由 NexusAI 智能文档模块生成”。

### 2.5 PPT 生成能力

PPT 是当前最近一轮开发的重点，已经从基础生成推进到 V2 高质量生成框架。

当前已具备：

- Agent 可识别 PPT 生成意图
- 可返回下载用 `.pptx` 文件
- 可根据用户要求控制页数，例如 6 页、8 页等
- 可读取上传文件内容，并把关键事实写入 PPT
- PPT 任务会自动尝试联网检索资料，不需要用户手动打开联网开关
- 配图策略为优先联网搜图，其次使用即梦生成
- 已去除生成文件中的平台签名和 generated-by 文案
- 已加入更稳定的 V2 视觉模板、节奏线和页面结构

当前 V2 支持的页面预设包括：

- `academic_cover`
- `teaching_cover`
- `section_divider`
- `agenda_list`
- `image_explanation`
- `knowledge_cards`
- `process_steps`
- `comparison_matrix`
- `data_insight`
- `lesson_exercise`
- `summary_closing`

最近新增的 PPT 关键能力：

- `buildRichPresentationDeck` 富内容规划器
- 上传文件事实融合
- Web research 内容融合
- 教学型、学术型、通用汇报型结构规划
- 每页补充 speaker notes、visual brief、image query
- 内容密度检查，避免每页只有几句空话
- V2 视觉节奏组件，保证页面风格更统一

关键文件：

- `lib/agent/skills/create-presentation.ts`
- `lib/presentation/v2/content-planner.ts`
- `lib/presentation/v2/presets.ts`
- `lib/presentation/v2/qa.ts`
- `lib/presentation/v2/image-policy.ts`
- `lib/presentation/v2/html-slide.ts`
- `lib/presentation/v2/artifact-pipeline.ts`
- `lib/presentation/providers/local.ts`
- `lib/presentation/visual-assets.ts`

### 2.6 文件上传到 PPT 的链路

现在已有文件上传到 PPT 的端到端测试链路。

当前能力：

- 用户上传文本/文档后，Agent 能把文件内容纳入 PPT 规划
- PPT 不只是复述短句，而是扩展为教学/汇报可用的结构
- 测试中已验证上传文件里的关键事实会进入生成后的 PPT XML
- 生产环境文件解析仍走 Kimi，测试环境有本地解析 fallback

相关文件：

- `lib/agent/skills/parse-document.ts`
- `scripts/test-ppt-file-upload-e2e.ts`
- `scripts/test-ppt-file-upload-e2e.mjs`

### 2.7 图片、视频、3D、知识图谱等既有模块

这些模块在 V4 时已经存在，近期没有作为主线重构。

已具备或已有骨架：

- 图片生成能力
- 视频生成能力
- 知识图谱页面
- 3D 工作区前端和 Tripo API 对接骨架
- 数据分析页骨架

相关文件可参考：

- `lib/image/config.ts`
- `lib/image/jimeng.ts`
- `lib/video/config.ts`
- `lib/video/volcengine.ts`
- `components/model3d/model3d-page.tsx`
- `components/model3d/model3d-viewer.tsx`
- `components/model3d/model3d-parameter-panel.tsx`
- `components/model3d/model3d-history-panel.tsx`
- `components/model3d/three-model-viewport.tsx`

## 3. 当前正在开发什么

当前正在开发的主线是：PPT 高质量生成和 Agent 文件生成链路稳定化。

已经完成的部分：

- Agent 普通聊天与后台任务路由拆分
- 快速对话默认走 `gpt-5.4`
- 功能任务进入异步后台任务
- 后台任务主模型为 `claudecoder:gpt-5.4`，Kimi 作为文件理解和 fallback
- PPT 任务自动联网检索
- PPT 图片策略：联网搜图优先，即梦生成兜底
- PPT V2 模板和视觉节奏组件
- 上传文件生成 PPT 的端到端测试
- 文件生成链路基础回归测试

正在推进但还没有完全到最终形态的部分：

- PPT 页面质量评分器 V1
- 低质量页面自动重写和重新排版
- 更多真实文件类型输入测试，例如 PDF、DOCX、XLSX 到 PPT
- PPT 版式继续向开源项目 `paper-ppt-agent` 和 `html-slide-to-pptx` 的效果靠近
- Word 模板嵌入和模板化输出
- 生产环境联网检索的 topK、超时、缓存和失败降级策略

## 4. 当前阶段判断

当前可以认为处于以下阶段：

| 模块 | 阶段 | 状态 |
| --- | --- | --- |
| 平台基础 | 基础可用 | 已完成主要骨架 |
| Agent 对话 | 快速聊天 + 任务路由 | 已完成第一轮稳定化 |
| 模型分工 | 主聊天 `xheai:gpt-5.4` / 后台任务 `claudecoder:gpt-5.4` / Kimi fallback | 已完成默认配置和回归检查 |
| Word 生成 | 文件生成 V1 | 可用，下一步做模板嵌入 |
| PPT 生成 | 高质量生成 V1/V2 | 正在重点开发 |
| PPT 文件上传理解 | E2E 可跑通 | 已完成测试覆盖 |
| PPT 视觉质量 | V2 模板阶段 | 已有统一节奏，仍需继续美化 |
| PPT 内容质量 | 富内容规划阶段 | 已增强，下一步做评分和自动修复 |
| 图片/视频/3D | 既有模块 | 保持稳定，不建议随意大改 |

## 5. 最近完成的关键开发点

### 5.1 Agent 快速对话和后台任务拆分

用户普通聊天时，不再因为后端任务模型思考导致等待很久。

目标行为：

- 用户说“你好”时快速返回。
- 用户问普通问题时由 `gpt-5.4` 回答。
- 用户要求“生成 PPT / 生成 Word / 做 Excel / 生成图片”等产物时，才进入后台 Agent 链路。

### 5.2 PPT 自动联网研究

PPT 任务现在会自动触发 `presentation_research` 模式。

目标是让 PPT 不是只有几段话，而是能结合：

- 用户输入
- 上传文件
- 联网资料
- 主题背景
- 案例、数据、教学活动或汇报要点

### 5.3 PPT 富内容规划器

新增 `lib/presentation/v2/content-planner.ts`，核心导出：

```ts
buildRichPresentationDeck(...)
```

它负责把模型 outline、文件事实、联网资料、fallback 内容整合为更充实的 PPT deck。

### 5.4 PPT V2 视觉一致性

`lib/presentation/providers/local.ts` 中增加了 V2 页面节奏元素：

- `V2 Layout Rhythm Rail`
- `V2 Layout Accent Tab`
- `V2 Layout Section Label`

这些元素已经用于核心页面类型，减少不同页面之间风格割裂的问题。

### 5.5 PPT 内容 QA

`lib/presentation/v2/qa.ts` 增加了 `low_content_density` 检查，用于发现内容太少的页面。

下一步可以基于这个规则做自动修复：评分过低的页面回到 planner 重新生成，或切换更合适的布局。

## 6. 已通过的回归测试

最近一轮已通过的关键命令：

```powershell
cmd /c node scripts\test-ppt-file-upload-e2e.mjs
cmd /c node scripts\test-ppt-agent-e2e.mjs
cmd /c npx tsx scripts\test-ppt-content-planner.ts
cmd /c node scripts\test-ppt-rendered-qa.mjs
cmd /c node scripts\test-chat-async-task-wiring.mjs
cmd /c node scripts\test-file-generation-pipeline.mjs
cmd /c node scripts\test-office-artifact-v1.mjs
cmd /c node scripts\generate-ppt-v2-preview.mjs
cmd /c node scripts\test-task-intents.mjs
cmd /c npx tsx scripts\test-agent-fast-route.ts
cmd /c npx tsc --noEmit --pretty false
```

测试覆盖点包括：

- 快速聊天不误入后台任务
- 文件生成链路可用
- PPT 任务能生成 `.pptx`
- PPT 中不出现平台生成签名
- PPT V2 页面预设可渲染
- 上传文件事实能进入 PPT
- PPT 图片策略保持联网搜图优先、即梦兜底
- 后台任务主模型为 `claudecoder:gpt-5.4`，Kimi 作为文件理解和 fallback

## 7. 当前已知限制和注意事项

### 7.1 工作区不是 Git 仓库

当前工作区执行 `git status` 会失败，说明它不是标准 Git 仓库或没有 `.git`。后续不要依赖 Git diff 判断改动范围，需要直接检查文件。

### 7.2 真实 provider 需要环境变量

测试环境中 `claudecoder:gpt-5.4` 和 Kimi 的真实 Key 可能为空，所以部分测试会走本地 fallback 或模拟路径。

生产联调要重点确认：

- `XHEAI_API_KEY`
- `XHEAI_BASE_URL`
- `AGENT_CHAT_MODEL`
- `AGENT_TASK_MODEL`
- `AGENT_TASK_FALLBACK_MODEL`
- `MOONSHOT_API_KEY`
- `MOONSHOT_BASE_URL`
- `PRESENTATION_IMAGE_GENERATION_MODEL`
- 即梦图片相关环境变量
- Web search / SearXNG / Baidu 搜索相关环境变量

### 7.3 PPT 预览依赖

本地生成 PPT 预览时，当前环境缺少 Poppler 的 `pdftoppm`，所以预览脚本会降级到 HTML image fallback。

这不影响 `.pptx` 文件生成，但会影响严格的 PDF 栅格化截图检查。

### 7.4 不要写入平台署名

用户明确要求生成 Word/PPT 时不要出现以下类似内容：

- `Generated by NexusAI`
- `由 NexusAI 智能文档模块生成`
- `由 NexusAI 生成`
- 平台宣传式页脚或署名

### 7.5 前端不要暴露后台模型名

前端只显示 `Nexus AI`。

后台状态文案应使用：

- `Nexus AI 正在思考`
- `Nexus AI 正在联网搜索`
- `Nexus AI 正在生成文件`
- `生成失败，请重试`

不要显示：

- `底层模型正在处理`
- `某模型正在解析`
- `GPT-5.4 正在回答`

## 8. 下一步开发建议

### 优先级 1：PPT 内容质量评分器 V1

目标：每页 PPT 生成后自动评分，低分页面重新生成或重新排版。

建议评分维度：

- 是否有足够事实信息
- 是否包含案例、步骤、课堂活动或数据点
- 是否有视觉建议或配图查询词
- 是否适合当前页面类型
- 是否避免空泛表述
- 是否有 speaker notes

落点文件：

- `lib/presentation/v2/qa.ts`
- `lib/presentation/v2/content-planner.ts`
- `lib/agent/skills/create-presentation.ts`

### 优先级 2：真实文件到 PPT 的多格式测试

目标：用户上传 PDF、DOCX、XLSX 后，Agent 能自动提取材料并生成内容丰富的 PPT。

建议新增测试：

- PDF 论文到学术风 PPT
- DOCX 教案到教学 PPT
- XLSX 数据表到数据汇报 PPT
- 多文件合并生成一套 PPT

### 优先级 3：PPT 版式继续升级

目标：向用户参考的 `paper-ppt-agent` 效果靠近，做到每页有清晰层次、配图、图表和教学/学术风格。

建议方向：

- 增加更多 HTML slide 模板
- 引入页面级设计 tokens
- 针对教学、学术、企业汇报做不同主题
- 增加图文混排、步骤图、对比表、案例卡、时间线、练习页
- 使用视觉 QA 检查重叠、空白、文字溢出

### 优先级 4：Word 模板嵌入

目标：让 Word 不只是生成普通文档，而是能套用用户上传或系统预置模板。

建议方向：

- 模板字段识别
- 原格式区域替换
- 标题/正文/表格样式继承
- 教案、报告、合同、论文格式模板

### 优先级 5：生产环境联网检索稳定化

目标：PPT/报告类任务能稳定获取资料，但不会拖慢普通聊天。

建议方向：

- 搜索次数和 topK 分级
- 超时降级
- 搜索结果缓存
- 失败后继续生成，但明确使用已有资料
- 区分普通聊天搜索和 PPT 深度研究搜索

## 9. 后续接手建议

如果下一个会话继续开发，建议优先读取：

1. `docs/PROJECT_HANDOFF_V5.md`
2. `lib/agent/router.ts`
3. `lib/agent/models.ts`
4. `lib/agent/skills/create-presentation.ts`
5. `lib/presentation/v2/content-planner.ts`
6. `lib/presentation/v2/qa.ts`
7. `lib/presentation/v2/presets.ts`
8. `lib/presentation/providers/local.ts`
9. `scripts/test-ppt-file-upload-e2e.ts`
10. `scripts/test-ppt-content-planner.ts`

建议下一轮直接做：

> PPT 内容质量评分器 V1 + 低质量页面自动重写。

这是当前最自然的下一步，因为文件上传、联网资料、PPT V2 模板和内容密度检查都已经具备基础，继续补评分和自动修复可以最快提升用户看到的 PPT 质量。
