# NexusAI 项目交接文档

更新时间：2026-05-12  
工作区：`E:\AI project\codex\WEByunming`  
项目类型：Next.js 15 + React 19 + TypeScript + Prisma 的 AI 聚合工作台

## 1. 当前项目状态

NexusAI 目前已经从“基础平台搭建”推进到“Agent 文件生成能力可交付基线”阶段。

当前可认为已经完成的主线：

- 平台登录、用户、配额、工作台、历史记录、收藏、设置等基础能力已具备。
- 普通聊天和后台 Agent 功能任务已经拆开。
- Word 新建与上传修改链路已完成可交付基线，并做过真实前端视觉验收。
- PPT、Excel、图片、视频、3D、知识图谱等模块已有独立入口和后端链路。
- 后台任务主模型已经统一为 `claudecoder:gpt-5.4`，Kimi/moonshot 作为文件理解和 fallback。

当前刚完成的收口工作：

- 暂停继续扩 Word 功能。
- 只做 Word 真实视觉验收与最终收口。
- 新增 DOCX 视觉预览验收工具：`DOCX -> LibreOffice PDF -> Chrome PNG screenshot`。
- 更新 Word 视觉验收报告。

## 2. 技术栈与目录结构

核心技术：

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Prisma`
- `SQLite` 开发库，配置来自 `DATABASE_URL`
- `xlsx` 用于 Excel 生成
- `three` 用于 3D 前端展示
- 本地 mock storage + Aliyun OSS 双存储路径

重要目录：

| 路径 | 作用 |
| --- | --- |
| `app/` | Next.js 页面和 API route |
| `components/` | 前端页面组件和 UI 组件 |
| `lib/agent/` | Agent 路由、模型配置、后台任务、工具能力 |
| `lib/document/` | Word 生成、DOCX 包解析、上传修改、质量检查 |
| `lib/presentation/` | PPT 生成、V2 规划、视觉模板、预览、QA |
| `lib/spreadsheet/` | Excel 创建、检查、修改 |
| `lib/image/` | 图片模型配置与即梦图片调用 |
| `lib/video/` | 视频模型配置与即梦视频任务 |
| `lib/model3d/` | Tripo 3D 任务、历史、结果、导出 |
| `lib/storage/` | OSS / 本地 mock storage 适配 |
| `scripts/` | 回归测试、验收脚本、预览脚本 |
| `docs/` | 项目文档、验收报告、交接文档 |

注意：当前工作区不是标准 Git 仓库，`git status` 会失败。后续接手不能依赖 git diff 判断改动范围，需要直接查看文件。

## 3. 已实现的网站功能

### 3.1 基础平台

已实现：

- 登录 / 登出 / 当前用户识别
- 用户管理
- 角色与配额
- 管理端数据统计
- 工作台总览
- 历史记录
- 收藏
- 设置与修改密码
- 本地开发存储与 OSS 存储适配

关键页面：

- `app/(auth)/login/page.tsx`
- `app/(dashboard)/workspace/page.tsx`
- `app/(dashboard)/users/page.tsx`
- `app/(dashboard)/analytics/page.tsx`
- `app/(dashboard)/history/page.tsx`
- `app/(dashboard)/settings/page.tsx`

关键 API：

- `app/api/auth/*`
- `app/api/users/*`
- `app/api/admin/*`
- `app/api/dashboard/stats/route.ts`
- `app/api/history/route.ts`
- `app/api/favorites/route.ts`

### 3.2 Nexus AI 聊天 / Agent 工作台

已实现：

- 普通聊天。
- 自动识别用户是否需要生成文件。
- 文件上传。
- Word / PPT / Excel 等功能任务进入后台异步任务。
- 前端 pending file generation 卡片。
- Agent 任务状态轮询。
- 附件展示与下载。
- 聊天历史、会话列表、引用面板。
- 知识图谱视图入口。
- 前端统一显示 `Nexus AI`，不暴露 GPT、Kimi、Gemini 等底层模型名。

关键文件：

- `components/chat/chat-page.tsx`
- `components/chat/chat-composer.tsx`
- `components/chat/chat-thread.tsx`
- `components/chat/chat-message.tsx`
- `components/chat/chat-attachment-card.tsx`
- `app/api/ai/chat/route.ts`
- `app/api/ai/chat/tasks/[id]/route.ts`
- `app/api/ai/chat/attachments/[id]/download/route.ts`
- `lib/agent/router.ts`
- `lib/agent/async-tasks.ts`
- `lib/agent/task-router.ts`
- `lib/agent/task-intents.ts`

当前约定：

- 普通聊天走 fast chat route。
- 只要识别到 Word / PPT / Excel 等功能产物任务，就进入后台 Agent 异步任务。
- 用户侧不显示底层模型名，只显示平台统一文案和文件生成状态。

### 3.3 Word 文档能力

当前状态：已达到可交付基线。

已实现：

- 根据用户 prompt 新建 Word。
- 支持教案、报告、方案、工作总结、会议纪要等正式文档结构。
- Word 生成前做 intent extraction。
- WordDocumentPlan 支持段落、表格、列表、callout、checklist、rubric、timeline、responsibility matrix 等块。
- 远程主模型优先生成完整 WordDocumentPlan。
- 主模型失败后可以 Kimi / local fallback。
- local fallback 必须基于用户 prompt 和 intent。
- Word QA 会检查主题贴合、结构完整、重复、模板痕迹、平台署名等问题。
- renderer 层处理标题、正文、表格、编号、页码、章节概览。
- 每个 numbered list 独立编号，不从文档开头连续编号。
- 标题和普通正文不编号。
- 新建 Word 有页脚页码。
- 长文档有章节概览。
- 表格列宽按内容加权，不再简单等分。
- 上传 DOCX 后可以保留原格式修改正文。
- 上传 DOCX 后可以按批注修改并清除批注。
- 上传 DOCX 修改不会走整篇重写作为默认策略。

关键文件：

- `lib/agent/skills/create-document.ts`
- `lib/document/create.ts`
- `lib/document/plan.ts`
- `lib/document/quality.ts`
- `lib/document/docx-package.ts`
- `lib/document/docx-paragraphs.ts`
- `lib/document/docx-comments.ts`
- `lib/document/revise-original.ts`
- `lib/document/revise-comments.ts`
- `lib/document/templates.ts`

最近新增的 Word 视觉验收工具：

- `scripts/export-word-visual-preview.ts`
- `scripts/test-word-visual-preview.ts`
- `docs/WORD_VISUAL_ACCEPTANCE.md`

最近验收结论：

- 真实前端生成 5 类 Word：教案、报告、方案、工作总结、会议纪要。
- 上传 DOCX 修改 4 类：改标题、扩写指定章节、段落转表格、按批注修改。
- 9 个真实前端输出均成功导出 PDF/PNG 预览。
- 新建 Word 肉眼检查可交付：标题区、章节层级、段距、表格、页码正常。
- 上传 DOCX 修改保留原紧凑格式。
- 未发现平台署名或 `DocTemplate` 内部标记。

已知小问题：

- 新建 Word 标题区已修正，不再显示 `Lesson Plan`、`Proposal`、`Document`、`Meeting Minutes` 等模板标签。
- 真实上传 DOCX 验收夹具较短，不包含真实复杂图片、页眉页脚、复杂表格长文档；复杂场景主要由脚本级 package 测试覆盖。

### 3.4 PPT 生成能力

当前状态：基础能力已可用，V2 高质量生成框架已搭建，仍是后续重点优化方向。

已实现：

- Agent 可识别 PPT 生成意图。
- 可生成 `.pptx` 下载文件。
- 可根据用户要求控制页数。
- 可读取上传文件内容并融合到 PPT。
- PPT 任务可自动联网补充资料。
- 配图策略支持联网搜图优先、即梦图片 fallback。
- 已去除生成文件中的平台署名和 generated-by 文案。
- V2 模板体系和内容规划器已存在。
- 支持 speaker notes、visual brief、image query。
- 支持内容密度检查，避免每页只有空泛短句。
- 支持 PPT 预览和多级 fallback。

关键文件：

- `lib/agent/skills/create-presentation.ts`
- `lib/presentation/types.ts`
- `lib/presentation/provider.ts`
- `lib/presentation/providers/local.ts`
- `lib/presentation/providers/remote.ts`
- `lib/presentation/v2/content-planner.ts`
- `lib/presentation/v2/planner.ts`
- `lib/presentation/v2/presets.ts`
- `lib/presentation/v2/qa.ts`
- `lib/presentation/v2/image-policy.ts`
- `lib/presentation/v2/html-slide.ts`
- `lib/presentation/v2/artifact-pipeline.ts`
- `lib/presentation/v2/preview.ts`
- `lib/presentation/v2/rendered-qa.ts`
- `lib/presentation/v2/repair.ts`
- `lib/presentation/visual-assets.ts`

当前仍建议继续优化：

- PPT 内容质量评分器。
- 低质量页面自动重写 / 重排。
- 更多真实文件输入到 PPT 的验收。
- 视觉布局继续贴近正式教学课件 / 汇报材料。

### 3.5 Excel / 表格能力

已实现：

- Agent 可识别 Excel / spreadsheet / xlsx 类型任务。
- 可生成 `.xlsx` 文件。
- 支持常见模板型表格：销售统计、项目进度、预算、客户跟进等。
- 支持公式写入、自动筛选、列宽。
- 支持 Excel 上传后的检查和修改骨架。

关键文件：

- `lib/agent/skills/create-spreadsheet.ts`
- `lib/spreadsheet/create.ts`
- `lib/spreadsheet/inspect.ts`
- `lib/spreadsheet/modify.ts`
- `lib/spreadsheet/storage.ts`
- `app/api/ai/chat/route.ts`

当前状态：

- Excel 已有可生成链路，但还没有像 Word 一样做过深度视觉/真实业务验收。
- 后续如果要强化，建议做 Excel 真实公式、数据透视、图表、上传修改回归。

### 3.6 图片生成能力

已实现：

- 图片生成页面。
- 图片参数面板。
- 图片历史。
- 图片预览。
- 支持文生图。
- 支持部分模型的图生图 / 参考图能力。
- 支持 OSS 或本地 fallback 存储。
- 任务入队、重试、历史恢复。

当前图片模型配置：

| 前端显示 | provider | provider model | 状态 |
| --- | --- | --- | --- |
| `Nexus Image2` | `xheai` | `gpt-image-2` | 启用 |
| `Nexus nano PRO` | `xheai` | `gemini-3.1-flash-image-preview` | 禁用 |
| `Nexus Image mini2` | `jimeng` | `jimeng_high_aes_general_v21_L` | 启用 |

关键文件：

- `components/image-generation/image-page.tsx`
- `components/image-generation/image-parameter-panel.tsx`
- `components/image-generation/image-result-grid.tsx`
- `app/api/ai/image/route.ts`
- `app/api/ai/image/tasks/[id]/route.ts`
- `lib/image/config.ts`
- `lib/image/jimeng.ts`

注意：

- 前端只显示 Nexus 品牌名，不直接暴露 provider/model。
- Gemini 图像通道当前禁用，不作为默认可用能力。

### 3.7 视频生成能力

已实现：

- 视频生成页面。
- 参数面板。
- 视频历史。
- 预览面板。
- 支持文本生成视频。
- 支持上传参考图生成视频。
- 后台视频任务队列。
- 视频任务状态查询。
- OSS 存储与可访问 URL 检查。

当前视频模型：

- 前端显示：`Nexus Video3.0`
- provider model：`jimeng-3.0-720p`
- provider：Volcengine Visual / JiMeng
- 支持分辨率：`720P`
- 支持时长：`5s`、`10s`
- 支持比例：`16:9`、`9:16`、`1:1`、`4:3`

关键文件：

- `components/video-generation/video-page.tsx`
- `components/video-generation/video-parameter-panel.tsx`
- `components/video-generation/video-preview-panel.tsx`
- `app/api/video/route.ts`
- `app/api/video/tasks/[id]/route.ts`
- `lib/video/config.ts`
- `lib/video/tasks.ts`
- `lib/video/volcengine.ts`

### 3.8 3D 生成能力

当前状态：已有前端工作区和 Tripo 后端对接骨架，属于 staged integration。

已实现：

- 3D 工作区页面。
- 3D 参数面板。
- 3D 历史面板。
- Three.js 模型预览 viewport。
- Tripo API 配置。
- 创建 3D 任务。
- 导出模型任务。
- 任务历史和结果记录。
- 任务队列和状态查询。
- 健康检查 route。

默认配置：

- provider：Tripo
- base URL：`https://api.tripo3d.com/v2/openapi`
- default model version：`v2.5-20250123`
- timeout：`300000ms`

关键文件：

- `components/model3d/model3d-page.tsx`
- `components/model3d/model3d-viewer.tsx`
- `components/model3d/three-model-viewport.tsx`
- `components/model3d/model3d-parameter-panel.tsx`
- `app/api/model3d/route.ts`
- `app/api/model3d/tasks/[id]/route.ts`
- `app/api/model3d/upload/route.ts`
- `app/api/model3d/health/route.ts`
- `lib/model3d/config.ts`
- `lib/model3d/execution.ts`
- `lib/model3d/tasks.ts`
- `lib/model3d/tripo.ts`
- `lib/model3d/history.ts`

注意：

- 真实 3D 任务需要配置 `TRIPO_API_KEY`。
- 前端展示名保持 Nexus 化，不直接暴露 Tripo 给普通用户。

### 3.9 知识图谱能力

已实现：

- 聊天页内知识图谱视图。
- 根据主题、文件、联网结果生成知识图谱。
- 支持异步任务状态。
- 支持历史记录。
- 支持文件内容理解。
- 支持联网资料补充。
- 支持 fallback graph。

关键文件：

- `components/chat/knowledge-graph-canvas.tsx`
- `app/api/ai/knowledge-graph/route.ts`
- `app/api/ai/knowledge-graph/tasks/[id]/route.ts`
- `app/api/ai/knowledge-graph/history/route.ts`

后端会综合：

- 用户主题
- 上传文档解析
- Web context
- 主聊天模型能力
- Kimi 文件理解能力

### 3.10 存储、历史与下载

已实现：

- Aliyun OSS 存储适配。
- 本地 mock storage fallback。
- 附件下载代理 route。
- 图片、视频、3D、聊天附件历史。
- 生成文件通过 `ChatAttachment` 关联到会话和用户。

关键文件：

- `lib/storage/index.ts`
- `lib/storage/oss.ts`
- `lib/storage/local.ts`
- `app/api/ai/chat/attachments/[id]/download/route.ts`
- `lib/dashboard-stats.ts`

## 4. 后端模型服务与路由

### 4.1 Agent 模型配置

当前代码入口：`lib/agent/models.ts`

当前配置逻辑：

```ts
chat: {
  provider: "xheai",
  model: AGENT_CHAT_MODEL || "gpt-5.4"
}

taskPrimary: {
  provider: "claudecoder",
  model: AGENT_TASK_MODEL || "gpt-5.4"
}

taskFallback: {
  provider: "moonshot",
  model: AGENT_TASK_FALLBACK_MODEL || "kimi-k2.5"
}
```

也就是说：

| 场景 | provider | model | 用途 |
| --- | --- | --- | --- |
| 普通聊天 | `xheai` | `gpt-5.4` | 快速聊天、普通问答 |
| 后台功能任务主模型 | `claudecoder` | `gpt-5.4` | Word / PPT / Excel 等任务规划与生成 |
| 文件理解 / fallback | `moonshot` | `kimi-k2.5` | 文档理解、文件解析、降级兜底 |

注意：

- 主聊天 GPT-5.4 和后台任务 GPT-5.4 不是同一套 provider。
- 后台任务不复用主聊天 OpenAI/XHEAI provider。
- 前端不显示底层模型名。

### 4.2 Provider base URL

`.env.example` 当前关键配置：

```env
XHEAI_BASE_URL=https://api.xheai.cc
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
CLAUDECODER_BASE_URL=https://china.claudecoder.me/v1

AGENT_CHAT_MODEL=gpt-5.4
AGENT_TASK_MODEL=gpt-5.4
AGENT_TASK_FALLBACK_MODEL=kimi-k2.5
```

后台任务主模型最终应理解为：

```text
provider = claudecoder
baseURL = https://china.claudecoder.me/v1
model = gpt-5.4
```

Kimi fallback：

```text
provider = moonshot
baseURL = https://api.moonshot.cn/v1
model = kimi-k2.5
```

### 4.3 Timeout 与后台任务

当前 Agent timeout 配置：

```env
AGENT_FAST_CHAT_TIMEOUT_MS=15000
AGENT_TASK_TIMEOUT_MS=240000
AGENT_TASK_PRIMARY_TIMEOUT_MS=15000
AGENT_TASK_FALLBACK_TIMEOUT_MS=10000
AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS=420000
AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS=240000
AGENT_WORD_TASK_REPAIR_TIMEOUT_MS=240000
AGENT_WORD_ASYNC_TASK_TIMEOUT_MS=600000
```

含义：

- 普通聊天保持短超时，避免聊天卡住。
- Word 任务允许更长主模型生成、fallback 和 repair。
- Word 异步任务总超时收紧到 10 分钟左右，远程 provider 超时后快速 fallback。

### 4.4 Web Search 服务

当前配置：

```env
AGENT_WEB_PRIMARY=self_hosted
AGENT_WEB_SELF_HOSTED_ENABLED=true
AGENT_SEARXNG_ENDPOINT=http://127.0.0.1:8080/search
AGENT_WEB_SEARCH_ENDPOINT=https://qianfan.baidubce.com/v2/ai_search/web_search
AGENT_WEB_SEARCH_MODEL=ernie-4.5-turbo-32k
```

当前策略：

- self-hosted SearXNG 优先。
- Baidu Qianfan AI Search fallback。
- Word / PPT / 报告类任务可以做资料补充。
- 搜索失败不阻断文件生成。

关键文件：

- `lib/agent/tools/web-context.ts`

### 4.5 图片 / 视频 / 3D 外部服务

图片：

- XHEAI：`gpt-image-2`
- Volcengine / JiMeng：`jimeng_high_aes_general_v21_L`

视频：

- Volcengine / JiMeng：`jimeng-3.0-720p`

3D：

- Tripo：`v2.5-20250123`

环境变量：

```env
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_REGION=cn-north-1
VOLCENGINE_VISUAL_ENDPOINT=https://visual.volcengineapi.com

TRIPO_API_KEY=
TRIPO_BASE_URL=https://api.tripo3d.com/v2/openapi
TRIPO_MODEL_VERSION=v2.5-20250123
TRIPO_TIMEOUT_MS=300000
```

## 5. 当前正在修改和刚完成的内容

当前这一轮实际修改的是交接和 Word 视觉验收相关文件，不再继续扩 Word 功能。

刚完成的文件：

- `scripts/export-word-visual-preview.ts`
- `scripts/test-word-visual-preview.ts`
- `docs/WORD_VISUAL_ACCEPTANCE.md`

当前新增文件：

- `docs/PROJECT_HANDOFF_CURRENT.md`

本轮明确没有修改：

- 模型 provider 配置
- 普通聊天 route
- PPT 生成链路
- Excel 生成链路
- 图片生成链路
- 视频生成链路
- 3D 生成链路
- 知识图谱链路
- Word 内容生成策略
- Word 上传修改策略

上一阶段的 Word 收口结论：

- Word 核心链路已经进入可交付基线。
- 新建 Word 文档视觉验收通过。
- 上传 DOCX 修改基础验收通过。
- local fallback 只作为兜底。
- 后台任务主路径优先 `claudecoder:gpt-5.4`。

## 6. 最近通过的验收与测试

最近 Word 相关验证：

```powershell
npx.cmd tsx scripts\run-word-acceptance.ts
npx.cmd tsx scripts\run-word-upload-acceptance.ts
npx.cmd tsx scripts\test-word-visual-preview.ts
npx.cmd tsx scripts\test-word-visual-layout.ts
npx.cmd tsx scripts\test-word-long-document.ts
npx.cmd tsx scripts\test-word-complex-upload-acceptance.ts
npx.cmd tsc --noEmit
```

之前已通过的 Agent / Office / PPT 回归：

```powershell
node scripts\test-file-generation-pipeline.mjs
node scripts\test-office-artifact-v1.mjs
npx.cmd tsx scripts\test-word-generation-intent.ts
npx.cmd tsx scripts\test-word-quality-plan.ts
npx.cmd tsx scripts\test-word-stability-and-qa.ts
npx.cmd tsx scripts\test-word-content-quality.ts
npx.cmd tsx scripts\test-word-professional-document-types.ts
npx.cmd tsx scripts\test-word-model-plan-diversity.ts
```

注意：

- 真实前端验收可能需要访问远程 provider 和 OSS，受沙箱网络限制时需要放行。
- 工作区不是 git 仓库，所以测试通过记录比 git diff 更重要。

## 7. 已知限制与风险

### 7.1 编码显示问题

部分旧文档和脚本里的中文在终端输出中显示为乱码。这通常是历史文件编码或 PowerShell/终端编码问题，不代表业务逻辑一定错误。

新交接文档使用正常中文重新整理，后续尽量不要继续复制旧乱码文本。

### 7.2 Word 小问题

Word 当前可交付，但仍有小风格问题：

- 新建文档标题区已去除英文类型标签，如 `Lesson Plan`、`Proposal` 不会再作为可见标题元素渲染。
- 真实复杂上传 DOCX 的人工样本仍需继续补充。
- Word COM 导出不稳定，当前视觉预览改用 LibreOffice + Chrome。

### 7.3 PPT 仍是后续重点

PPT 生成已有 V2 框架，但还未达到 Word 当前的可交付收口程度。

建议后续优先做：

- PPT 内容质量评分器。
- PPT 低质量页自动 repair。
- PPT 真实前端 5-10 类样本视觉验收。
- 上传 PDF/DOCX/XLSX 生成 PPT 的真实验收。

### 7.4 Excel 仍偏模板化

Excel 目前能生成可打开的 xlsx，并支持公式和几类常见表格，但还没做深度业务化：

- 真实上传 Excel 修改。
- 图表。
- 多 sheet 复杂报表。
- 数据透视。
- 公式正确性验收。

### 7.5 外部 provider 依赖

真实生产能力依赖环境变量：

- `XHEAI_API_KEY`
- `CLAUDECODER_API_KEY`
- `MOONSHOT_API_KEY`
- `AGENT_WEB_SEARCH_API_KEY`
- `ALI_OSS_*`
- `VOLCENGINE_*`
- `TRIPO_API_KEY`

如果这些为空：

- 普通聊天可能失败或 fallback。
- Word/PPT 后台任务可能走 local fallback。
- 图片/视频/3D 真实生成不可用。
- OSS 文件下载可能只能走本地 mock storage。

### 7.6 前端模型名约束

前端不要暴露：

- GPT
- Gemini
- Kimi
- Moonshot
- ClaudeCoder
- Tripo
- JiMeng

用户侧统一使用：

- `Nexus AI`
- `Nexus Image`
- `Nexus Video`
- `Nexus 3D Preview`

底层模型名只允许出现在服务端日志、内部验收报告和开发文档里。

## 8. 建议下一步开发顺序

### 优先级 1：PPT 可交付质量收口

目标：让 PPT 像 Word 一样从“能生成文件”升级为“能直接汇报/教学/展示”。

建议任务：

- 强化 `lib/presentation/v2/qa.ts`。
- 给每页 PPT 做内容密度、结构、视觉元素检查。
- 低分页面自动 repair。
- 对真实前端生成的 PPT 做 PDF/PNG 视觉验收。
- 建立 PPT 视觉验收报告。

### 优先级 2：Excel 真实业务化

目标：从模板表格升级为可用业务报表。

建议任务：

- 增强 intent extraction。
- 让模型规划 workbook/sheets/formulas。
- 加 Excel QA。
- 加上传 Excel 修改能力验收。
- 加公式、图表、列宽、冻结窗格、筛选验收。

### 优先级 3：复杂上传 DOCX 样本

目标：验证真实复杂 DOCX 不会一改就坏。

建议补样本：

- 带图片。
- 带页眉页脚。
- 带复杂表格。
- 长文档只改指定章节。
- 带批注。
- 带修订痕迹。

### 优先级 4：生产环境 provider 稳定性

目标：减少真实前端验收中的 provider fetch failed、OSS 403、搜索失败等问题。

建议任务：

- 服务端日志保留 provider/model/stage/timeout，但不打印 API Key。
- 统一签名 URL 获取逻辑。
- Web search self-hosted 与 Baidu fallback 做健康检查。
- 对远程模型失败原因分 timeout / provider error / client abort。

### 优先级 5：文档和编码清理

目标：减少旧文档乱码和过期说法。

建议任务：

- 用本文件替代旧 V3/V4/V5 交接文档作为最新入口。
- 清理旧文档中“Gemini 作为后台主模型”等过期描述。
- 保留 `docs/WORD_VISUAL_ACCEPTANCE.md`、`docs/WORD_GENERATION_ACCEPTANCE.md` 作为 Word 验收记录。

## 9. 接手时优先阅读

建议新接手者按顺序读：

1. `docs/PROJECT_HANDOFF_CURRENT.md`
2. `docs/WORD_VISUAL_ACCEPTANCE.md`
3. `docs/WORD_GENERATION_ACCEPTANCE.md`
4. `lib/agent/models.ts`
5. `lib/agent/router.ts`
6. `lib/agent/async-tasks.ts`
7. `lib/agent/skills/create-document.ts`
8. `lib/document/create.ts`
9. `lib/document/plan.ts`
10. `lib/document/quality.ts`
11. `lib/agent/skills/create-presentation.ts`
12. `lib/presentation/v2/content-planner.ts`
13. `lib/presentation/v2/qa.ts`
14. `.env.example`

## 10. 一句话总结

当前 NexusAI 已经具备完整工作台、普通聊天、后台 Agent 文件任务、Word 可交付生成/修改、PPT V2 框架、Excel 基础生成、图片/视频/3D/知识图谱入口和后端骨架。

最近刚完成的是 Word 真实视觉验收与最终收口。下一阶段最值得继续投入的是 PPT 可交付质量收口，其次是 Excel 真实业务化和复杂上传 DOCX 样本扩展。
