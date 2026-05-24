# NexusAI 主项目交接文档

更新日期：2026-05-23  
项目路径：`E:\AI project\codex\WEByunming`  
技术栈：Next.js 15 / React 19 / TypeScript / Prisma / SQLite / Tailwind CSS  
当前分支：以本地 `git branch --show-current` 为准，近期工作区长期存在多条未提交脏改。  

## 1. 当前总体状态

NexusAI 是一个 AI 聚合工作台，已经具备登录、工作台、聊天 Agent、智能工具、文件生成、图片、视频、3D、知识图谱等多个功能区。

当前主项目不是一个“干净单功能分支”状态，工作区内同时存在：

- Academic PPT 历史脏改和模板相关改动。
- 教学架构图合并进主项目后的新增目录。
- 公共文档解析模块 `lib/document-processing/`。
- package 依赖变更：`jszip`、`mammoth`、`pdfjs-dist@3.11.174` 等。
- 部分旧文档或旧文件在 PowerShell 输出中会显示乱码，新交接内容以本文件为准。

重要原则：

- 不要随意 commit。
- 不要随意 stage。
- 提交前必须先按范围审查 `git status --short` 和 `git diff --cached --name-only`。
- Academic PPT、教学架构图、capability-map、普通聊天/Agent 链路之间要严格隔离。
- `lib/document-processing/` 是主项目公共能力，不是教学架构图私有目录。

## 2. 网站现有模块

### 2.1 基础平台

主要能力：

- 登录 / 登出 / 当前用户识别。
- 用户管理。
- 角色与配额。
- 工作台总览。
- 历史记录。
- 收藏。
- 设置与密码修改。
- 本地开发存储与 OSS 存储适配。

主要路径：

- `app/(auth)/login/`
- `app/(dashboard)/workspace/`
- `app/(dashboard)/users/`
- `app/(dashboard)/analytics/`
- `app/(dashboard)/history/`
- `app/(dashboard)/settings/`
- `components/layout/`
- `lib/storage/`
- `prisma/`

### 2.2 Nexus Agent / 普通聊天

主要能力：

- 普通聊天。
- 文件上传。
- 会话列表与历史。
- 附件展示与下载。
- 自动识别 Word / PPT / Excel 等文件生成任务。
- 后台异步任务轮询。
- 知识图谱入口。
- 前端统一展示 Nexus 品牌，不直接暴露底层模型名。

主要路径：

- `app/(dashboard)/chat/`
- `app/api/ai/chat/`
- `components/chat/`
- `lib/agent/`

注意：

- 普通聊天 route 与智能工具 route 不要混改。
- 后台任务模型配置在 `lib/agent/models.ts`。
- `callChatModel` 位于 `lib/agent/router.ts`，多个工具会复用它。

### 2.3 智能工具总入口

当前已有智能工具：

- 学术 PPT：`/smart-tools/academic-ppt`
- 教学架构图：`/smart-tools/teaching-architecture-diagram`

主要路径：

- `app/(dashboard)/smart-tools/`
- `components/smart-tools/smart-tools-data.ts`
- `components/smart-tools/`

注意：

- 新增智能工具入口优先改 `components/smart-tools/smart-tools-data.ts`。
- 不要把单个工具的业务状态写进智能工具入口 registry。

## 3. Academic PPT 模块

### 3.1 功能定位

Academic PPT 用于上传论文、文档、PDF、已有材料，生成学术汇报 PPTX，并提供任务状态、日志、预览、下载、恢复、取消等能力。

### 3.2 已完成能力

- 前端学术 PPT 工作台。
- 上传资料并创建 PPT 任务。
- 页数、研究选项、外部搜索等配置入口。
- 后端任务存储、任务队列、任务恢复。
- Python `ai-tools-engine` 侧生成 PPTX。
- preview 与 download 链路。
- PPTX sanitizer / validator / retry 相关稳定性处理。
- 内置模板体系。
- 电子科技大学模板 `theme_preset` 方向已经做过多轮视觉修复：
  - 封面使用完整背景图，不裁剪。
  - 封面标题居中，主标题放大。
  - 封面/封底去顶部大横条。
  - 正文顶部条使用 `#811c81 -> #9d229d` 渐变。
  - 正文右上 logo 垂直居中于装饰条。
  - 右上 logo 区域不额外叠加“学术汇报”“汇报分析”等文字。
  - 最后一页只保留“谢谢聆听”，最多加“欢迎交流”。

### 3.3 主要路径

前端：

- `app/(dashboard)/smart-tools/academic-ppt/`
- `components/smart-tools/academic-ppt/`

Next API：

- `app/api/smart-tools/academic-ppt/tasks/`
- `app/api/internal/academic-ppt/model/`

TypeScript 支撑：

- `lib/smart-tools/academic-ppt/`

Python tools engine：

- `services/ai-tools-engine/app/tools/academic_ppt/`
- `services/ai-tools-engine/app/core/model_bridge.py`
- `services/ai-tools-engine/app/core/task_store.py`

### 3.4 当前注意事项

- 不要恢复“用户模板复刻”路线。
- 不要把电子科技大学模板改回解析用户上传模板结构。
- 不要随意改 sanitizer / validator / retry，除非明确修稳定性 bug。
- preview 和下载 PPTX 必须一致。
- PPTX 必须能被 Microsoft PowerPoint 打开。
- 运行产物、任务目录、下载文件不要提交。
- Academic PPT 当前仍是脏改较多的区域，提交前必须人工挑文件。

## 4. 教学架构图模块

### 4.1 功能定位

教学架构图用于上传教学材料或输入文字，自动分析内容，生成教学改革/课程建设/专业建设类架构图。最终前端渲染的是可编辑 SVG，用户可以修改图中文字并下载当前编辑后的图。

设计逻辑必须保持：

1. 上传文档或输入文字。
2. 解析文档。
3. AI 分析文档，生成结构化蓝图 `blueprint.json`。
4. 调用 image 模型生成架构图参考图 `output.png`。
5. 基于蓝图生成可编辑 SVG `output.svg`。
6. 前端渲染 SVG。
7. 用户可点击文字编辑。
8. 保存后生成 `edited-scene.json` 并重新渲染 `output.svg`。
9. 下载 SVG / PNG 必须包含当前修改后的文字。

### 4.2 已完成能力

前端：

- `/smart-tools/teaching-architecture-diagram` 页面。
- 画布占满主要工作区。
- 底部 PromptBar，支持文字输入、文件上传、图型选择。
- 支持拖拽上传。
- 文件上传后在输入框区域显示小卡片。
- 文字输入和文件上传互斥。
- 右侧历史记录卡片。
- 历史记录隐藏原生滚动条，禁止横向滚动。
- 历史卡片右侧删除按钮，可真实删除任务。
- 中间 SVG 画布支持滚轮缩放。
- 支持中键拖动画布。
- 支持 Space + 左键拖动画布。
- 双击空白或按钮可重置视图。
- 普通左键点击文字仍进入编辑。
- 缩放不再用 CSS `scale()`，改为改变 SVG 容器实际尺寸，减少文字模糊。
- 去掉会导致缩放模糊的 `drop-shadow` / `backdrop-blur` 影响。
- PNG 导出从当前前端 SVG 面板导出，下载前会先保存未保存文字编辑。

后端：

- 创建任务。
- 列出任务。
- 读取任务。
- 删除任务。
- 重试任务。
- 下载 SVG。
- 读取 scene。
- 保存 scene 文字 patch。
- task 文件闭环。

文档解析：

- 教学架构图通过 `parseDocuments` 使用公共 `lib/document-processing/`。
- DOCX / PDF / PPTX 不再走私有 pending parser 占位。
- 解析失败或空文本时任务失败，不生成泛图。
- `extraction.json` 保留文件级 parser / status / warning / errorCode。

模型链路：

- `buildTeachingArchitectureBlueprintWithModel` 会调用真实 `callChatModel`。
- AI 主模型和 fallback 都失败时，任务失败，不再假装本地规则成功。
- 本地规则只作为初始蓝图和字段补全参考。
- 蓝图分析超时已调为 5 分钟。
- image 生成超时已调为 5 分钟。

最近真实验证：

- 失败任务 `tad-51b5b8b9-ead7-4dcd-8287-7e7aea06669d` 原因是旧的 `AGENT_ANALYSIS_TIMEOUT=90s`。
- 调整为 5 分钟后，对同一任务重试成功。
- 重试结果：
  - `parser=ai_model`
  - 进入 `generating_image`
  - provider=`xheai`
  - status=`completed`
  - 已生成 `blueprint.json`、`diagram-scene.json`、`output.png`、`output.svg`

### 4.3 主要路径

前端：

- `app/(dashboard)/smart-tools/teaching-architecture-diagram/page.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureWorkbench.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitecturePromptBar.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureCanvas.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureSvgTextEditor.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureHistoryPanel.tsx`

API：

- `app/api/smart-tools/teaching-architecture-diagram/route.ts`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/route.ts`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/route.ts`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/retry/route.ts`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/download/route.ts`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/scene/route.ts`

业务库：

- `lib/smart-tools/teaching-architecture-diagram/types.ts`
- `lib/smart-tools/teaching-architecture-diagram/client.ts`
- `lib/smart-tools/teaching-architecture-diagram/task-store.ts`
- `lib/smart-tools/teaching-architecture-diagram/content-extractor.ts`
- `lib/smart-tools/teaching-architecture-diagram/blueprint-builder.ts`
- `lib/smart-tools/teaching-architecture-diagram/diagram-scene.ts`
- `lib/smart-tools/teaching-architecture-diagram/prompts.ts`
- `lib/smart-tools/teaching-architecture-diagram/image-provider.ts`
- `lib/smart-tools/teaching-architecture-diagram/image-generator.ts`
- `lib/smart-tools/teaching-architecture-diagram/renderers/`

任务产物：

- `data/smart-tools/teaching-architecture-diagram/tasks/<taskId>/`

典型文件：

- `input/`
- `raw-input.txt`
- `extracted-content.txt`
- `extraction.json`
- `blueprint.json`
- `prompt.txt`
- `diagram-scene.json`
- `edited-scene.json`
- `output.png`
- `output.svg`
- `task.json`
- `logs.jsonl`

### 4.4 当前注意事项

- 不要把教学架构图改成只输出不可编辑 PNG。
- 最终前端主编辑面板必须保持 SVG。
- image 生成是流程的一部分，但不是前端编辑的唯一产物。
- 修改文字后下载必须导出当前修改版本。
- 只允许编辑文字：
  - `scene.title`
  - `scene.nodes[].title`
  - `scene.nodes[].tags[]`
  - `scene.edges[].label`
- 不允许前端修改坐标、颜色、布局、连线结构、节点增删。
- `taskId` 必须防路径穿越。
- SVG 文本必须转义，防止脚本注入。
- `data/smart-tools/teaching-architecture-diagram/tasks/` 是运行产物，不要提交。

## 5. 公共文档分析模块

### 5.1 定位

`lib/document-processing/` 是主项目级公共基础能力，不是教学架构图私有目录。

后续这些功能如果要解析文件，都应该复用它：

- 前端对话上传文件。
- Agent 文件理解。
- 教学架构图。
- 学术总结。
- 课程方案生成。
- 申报书分析。
- 论文图生成。
- PPT 生成。
- 其他智能工具。

### 5.2 已完成能力

支持格式：

- TXT
- MD / Markdown
- DOCX
- PDF 文本层
- PPTX

能力：

- 根据文件类型选择 parser。
- 提取文本。
- 清洗 normalize。
- 文本分块 chunk。
- 返回统一 `DocumentParseResult`。
- 返回统一 warning / errorCode。

错误码包括：

- `DOCUMENT_EMPTY_TEXT`
- `DOCUMENT_UNSUPPORTED_TYPE`
- `DOCUMENT_PARSE_FAILED`

### 5.3 主要路径

- `lib/document-processing/types.ts`
- `lib/document-processing/parser.ts`
- `lib/document-processing/normalize.ts`
- `lib/document-processing/chunker.ts`
- `lib/document-processing/errors.ts`
- `lib/document-processing/parsers/txt.ts`
- `lib/document-processing/parsers/markdown.ts`
- `lib/document-processing/parsers/docx.ts`
- `lib/document-processing/parsers/pdf.ts`
- `lib/document-processing/parsers/pptx.ts`

### 5.4 使用方式

```ts
import { parseDocuments } from "@/lib/document-processing/parser";

const result = await parseDocuments({
  files,
  maxChars,
  chunkSize
});
```

调用方自己决定：

- 文件保存在哪里。
- taskId 是什么。
- 解析结果怎么用于业务。
- 是否进入 Agent / RAG / blueprint / PPT / 总结。

### 5.5 禁止事项

`lib/document-processing/` 不允许写死：

- teaching-architecture-diagram
- chatId
- taskId
- conversationId
- academic-ppt
- output.svg
- blueprint.json

它不负责：

- 教学架构图 blueprint。
- SVG 生成。
- 图片生成。
- 聊天回答。
- Agent 推理。
- PPT 生成。
- Academic PPT。
- 任何业务 task 状态。

## 6. 其他模块状态

### 6.1 Word 文档能力

已有能力：

- 新建 Word 文档。
- 根据 prompt 生成教案、报告、方案、总结、会议纪要等。
- 上传 DOCX 后按要求修改正文。
- 保留原格式的最小替换式修改。
- 按 Word 批注生成修订版。
- Word 视觉验收脚本曾经跑通。

主要路径：

- `lib/agent/skills/create-document.ts`
- `lib/document/`

当前状态：

- Word 属于已达到可交付基线的能力。
- 后续重点是补复杂真实 DOCX 样本，而不是重写主链路。

### 6.2 Excel / 表格能力

已有能力：

- 识别 Excel / spreadsheet / xlsx 任务。
- 生成 `.xlsx`。
- 支持常见模板型表格。
- 支持公式、筛选、列宽等基础能力。

主要路径：

- `lib/agent/skills/create-spreadsheet.ts`
- `lib/spreadsheet/`

当前状态：

- 可用但偏模板化。
- 尚未达到 Word 那样的深度验收。

### 6.3 图片生成

已有能力：

- 图片生成页面。
- 文生图。
- 部分图生图/参考图能力。
- 图片历史。
- 任务状态与下载。

主要路径：

- `app/api/ai/image/`
- `components/image-generation/`
- `lib/image/`

注意：

- 前端展示 Nexus 品牌，不直接暴露 provider/model。
- 教学架构图 image provider 会复用部分图片底层能力。

### 6.4 视频生成

已有能力：

- 视频生成页面。
- 文本生成视频。
- 参考图生成视频。
- 视频历史。
- 视频预览与任务轮询。

主要路径：

- `app/api/video/`
- `components/video-generation/`
- `lib/video/`

### 6.5 3D 生成

已有能力：

- 3D 工作区。
- 参数面板。
- Three.js 预览。
- Tripo API 对接骨架。
- 任务创建、查询、历史、导出。

主要路径：

- `app/api/model3d/`
- `components/model3d/`
- `lib/model3d/`

注意：

- 真实 3D 任务依赖 `TRIPO_API_KEY`。
- 前端不要暴露 Tripo 名称给普通用户。

### 6.6 知识图谱

已有能力：

- 聊天页内知识图谱视图。
- 根据主题、文件、联网结果生成图谱。
- 异步任务和历史记录。

主要路径：

- `app/api/ai/knowledge-graph/`
- `components/chat/knowledge-graph-canvas.tsx`

### 6.7 capability-map

已有 capability-map 相关页面和 API，但近期任务明确要求不要触碰。

主要路径：

- `app/capability-map/`
- `app/api/capability-map/`
- `components/capability-map/`
- `lib/capability-map/`

注意：

- 当前交接只记录它存在。
- 后续没有明确需求，不要改 capability-map。

## 7. 公共支撑模块

### 7.1 Agent 与模型路由

主要路径：

- `lib/agent/models.ts`
- `lib/agent/router.ts`
- `lib/agent/types.ts`
- `lib/agent/task-router.ts`
- `lib/agent/task-intents.ts`
- `lib/agent/tools/web-context.ts`

注意：

- 多个工具复用 `callChatModel`。
- 修改 provider、timeout、错误分类会影响多模块。
- 前端用户侧不展示底层模型名。

### 7.2 存储

主要路径：

- `lib/storage/`
- `app/api/ai/chat/attachments/[id]/download/route.ts`

能力：

- 本地 mock storage。
- Aliyun OSS。
- 附件下载代理。

### 7.3 文件生成与 Office 能力

主要路径：

- `lib/document/`
- `lib/presentation/`
- `lib/spreadsheet/`
- `lib/smart-tools/academic-ppt/`

注意：

- 普通 Agent 文件生成和 smart-tools Academic PPT 不是同一条链路。
- 改动前必须确认调用方。

### 7.4 Python tools engine

主要路径：

- `services/ai-tools-engine/`

当前主要承载：

- Academic PPT 生成。
- 模型桥接。
- task store。
- 未来可能继续承载其他工具。

注意：

- `services/` 当前有历史脏改。
- 用户多次要求某些任务不要碰 `services/`，除非明确是 Academic PPT 后端修复。

## 8. 当前开发进度

### 已稳定或接近可交付

- 基础平台。
- 登录、用户、工作台、历史、设置。
- 普通聊天主界面。
- Word 生成和部分上传修改。
- 图片/视频/3D 基础入口。
- 智能工具总入口。
- 公共文档解析模块。

### 正在重点开发/修复

- Academic PPT：
  - 稳定性、preview/download 一致性、模板视觉。
  - 电子科技大学模板视觉仍是近期高频修复点。
- 教学架构图：
  - 已合入主项目。
  - 已有可编辑 SVG、历史记录、删除、缩放、PNG 导出当前编辑图。
  - 刚修复 AI 分析 90 秒超时过短问题，改为 5 分钟。
  - 下一步重点应是提高 SVG 视觉质量和 image 参考图到 SVG 布局的利用效率。

### 仍需加强

- Excel 深度业务化。
- PPT 完整视觉 QA。
- 复杂 DOCX 样本验收。
- 生产 provider 稳定性与错误提示。
- 旧乱码文档清理。

## 9. 运行与验证

常用启动：

```powershell
npm.cmd run dev -- -p 3099
```

常用验证：

```powershell
npm.cmd exec -- tsc --noEmit
npm.cmd run build
python -m compileall -q services/ai-tools-engine
```

Academic PPT 常用验证：

```powershell
npm.cmd exec -- tsx scripts/academic-ppt/check-stability.ts
npm.cmd exec -- tsx scripts/academic-ppt/check-model-bridge.ts
```

教学架构图手工验收：

1. 打开 `/smart-tools/teaching-architecture-diagram`。
2. 上传 DOCX / PDF / PPTX / TXT / MD 或输入文字。
3. 创建任务。
4. 确认阶段经过解析、AI 分析、image 生成、SVG 渲染。
5. 打开历史记录。
6. 缩放、平移画布。
7. 点击文字编辑。
8. 保存。
9. 下载 SVG。
10. 下载 PNG。
11. 删除历史任务。

注意：

- `npm.cmd run build` 如果遇到 Prisma DLL `EPERM rename`，通常是 dev server 占用 `.prisma/client`，先停止 `next dev` 再 build。
- 不要提交 `data/smart-tools/**/tasks/` 运行产物。

## 10. Git 与提交注意事项

当前工作区长期存在历史脏改。提交前必须：

```powershell
git status --short
git branch --show-current
git diff --name-only
git diff --cached --name-only
```

要求：

- 不允许有意外 staged 文件。
- 不要把 Academic PPT 历史脏改混入教学架构图提交。
- 不要把 teaching-architecture-diagram 混入 Academic PPT 提交。
- 不要提交 `.env`、key、token。
- 不要提交 `package-lock.json`，项目使用 `pnpm-lock.yaml`。
- 不要提交运行产物、下载文件、临时 PPTX/SVG/PNG。

运行产物不要提交：

- `data/smart-tools/teaching-architecture-diagram/tasks/`
- `output.svg`
- `output.png`
- `edited-scene.json`
- `diagram-scene.json`
- `tmp/`
- 测试下载文件
- `package-lock.json`

## 11. GitNexus 注意事项

项目 `AGENTS.md` 要求使用 GitNexus 做影响分析：

- 修改函数、类、方法前应运行 `gitnexus_impact`。
- 提交前应运行 `gitnexus_detect_changes()`。
- 若提示索引过期，先运行 `npx gitnexus analyze`。

但在最近一次 Codex 会话中，GitNexus MCP 工具没有暴露，`tool_search` 也找不到 GitNexus 工具。因此当工具不可用时，需要在交接或最终回复里明确说明限制，并尽量通过本地代码阅读、`rg`、类型检查、页面验证降低风险。

## 12. 禁止误动范围

除非用户明确要求，不要碰：

- `capability-map`
- 普通聊天 / Agent 主链路
- Word / Excel 主链路
- 图片 / 视频 / 3D 主链路
- Academic PPT sanitizer / validator / retry
- Academic PPT 用户模板复刻路线
- 教学架构图以外的 smart-tools 目录
- `services/`，除非任务就是 Academic PPT Python 后端

对于教学架构图任务，通常只允许：

- `components/smart-tools/teaching-architecture-diagram/`
- `app/(dashboard)/smart-tools/teaching-architecture-diagram/`
- `app/api/smart-tools/teaching-architecture-diagram/`
- `lib/smart-tools/teaching-architecture-diagram/`
- 必要时 `lib/document-processing/`
- 必要时 `components/smart-tools/smart-tools-data.ts`

对于 Academic PPT 任务，通常只允许：

- `components/smart-tools/academic-ppt/`
- `app/(dashboard)/smart-tools/academic-ppt/`
- `app/api/smart-tools/academic-ppt/`
- `app/api/internal/academic-ppt/`
- `lib/smart-tools/academic-ppt/`
- `services/ai-tools-engine/app/tools/academic_ppt/`

## 13. 环境变量注意事项

真实能力依赖环境变量：

- `XHEAI_API_KEY`
- `AGENT_TASK_API_KEY`
- `MOONSHOT_API_KEY`
- `CLAUDECODER_API_KEY`
- `ALI_OSS_*`
- `VOLCENGINE_*`
- `TRIPO_API_KEY`

教学架构图相关：

- `TEACHING_ARCHITECTURE_ANALYSIS_PROVIDER`
- `TEACHING_ARCHITECTURE_ANALYSIS_MODEL`
- `TEACHING_ARCHITECTURE_ANALYSIS_FALLBACK_PROVIDER`
- `TEACHING_ARCHITECTURE_ANALYSIS_FALLBACK_MODEL`
- `TEACHING_ARCHITECTURE_IMAGE_PROVIDER`
- `TEACHING_ARCHITECTURE_IMAGE_MODEL`
- `TEACHING_ARCHITECTURE_IMAGE_BASE_URL`
- `TEACHING_ARCHITECTURE_IMAGE_TIMEOUT_MS`

注意：

- 不要在日志或文档中输出真实 key。
- 可以记录变量名是否存在，但不要打印值。

## 14. 下一步建议

优先级 1：教学架构图视觉质量

- 优化 SVG renderers，让图更像正式汇报/论文架构图。
- 更好地利用 image 模型生成的 `output.png` 作为布局/风格参考。
- 增加 SVG 视觉 QA。
- 增强复杂 PDF/DOCX 输入的蓝图提炼质量。

优先级 2：Academic PPT 冻结前审计

- 按模板逐项验收 preview/download 一致性。
- 验证电子科技大学模板封面、正文、封底。
- 确认 PPTX 可打开。
- 清理运行产物。
- 冻结功能，不继续发散。

优先级 3：公共文档解析复用

- 前端聊天上传文件可逐步迁移到 `lib/document-processing/`。
- 后续智能工具统一复用它。
- 不再为 DOCX / PDF / PPTX 重复造 parser。

优先级 4：提交候选整理

- 先分清 Academic PPT 和教学架构图两套变更。
- 分别准备提交候选文件列表。
- 不要一次性 stage 所有脏改。

## 15. 一句话总结

当前 NexusAI 已经从单纯聊天工作台发展为多智能工具平台：基础平台和 Agent 已成型，Word 较成熟，Academic PPT 正在稳定性和模板视觉收口，教学架构图已经合入主项目并具备“文档解析 -> AI 蓝图 -> image 参考图 -> 可编辑 SVG -> 下载当前编辑图”的闭环；`lib/document-processing/` 是后续所有文件理解功能应复用的公共模块。后续开发最重要的是控制范围、不要混提交、不要破坏公共模块边界。
