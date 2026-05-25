# Agent Runtime V2 最终验收与交接文档

## 1. 总体结论

Agent Runtime V2 已完成从聊天分流、当前对话记忆、SSE 流式响应、Tool Adapter、taskCard 展示、回归脚本到聊天页体验收口的主链路建设。当前版本已经可以支撑 ChatGPT 式主聊天体验：

- 普通咨询只聊天；
- 明确生成/导出/创建时才调用工具；
- 缺少信息时先追问；
- 当前 conversation 内能识别 activeTask、上传文件和临时偏好；
- 新 conversation 不继承旧 memory；
- 工具任务统一显示 taskCard；
- 文件分析直接回答，不显示 taskCard；
- SSE 流式只固化一个 assistant 气泡；
- 普通用户看不到 Runtime trace、provider/model、内部 JSON、stack。

本交接文档只描述 Agent Runtime V2 当前状态，不代表长期 memory、完整 Excel 工作区或真实 PPT 编辑器已经完成。

## 2. 当前架构

### 入口与 API

- `app/api/ai/chat/route.ts`
  - Chat API 主入口。
  - 支持 JSON fallback 和 `stream=1` SSE。
  - 创建/更新 conversation 和 chat message。
  - 构建 Runtime V2 输入，接收 Runtime 决策。
  - 调用 `answer_chat`、`ask_clarification` 或工具 adapter。
  - 保存 assistant message、附件、taskCard、stream status。
  - 只在 `debugAgent=1` 时返回精简 Runtime trace。

### 前端聊天页

- `components/chat/chat-page.tsx`
  - 发送普通 JSON / multipart 请求。
  - 默认使用 `stream=1`。
  - 创建单一 pending assistant message。
  - 消费 SSE `runtime_status`、`tool_status`、`token`、`final`、`error`。
  - `final` 只固化 pending message，不追加第二个 assistant。
  - `debugAgent=1` 时才显示精简 debug trace。

- `components/chat/chat-thread.tsx`
  - 渲染聊天列表。
  - 渲染轻量处理状态。
  - 接收 debug trace，但普通用户默认不可见。

- `components/chat/chat-message.tsx`
  - 渲染 assistant / user 气泡。
  - 渲染统一 taskCard。
  - 合并 taskCard 与生成附件下载入口。
  - 文件分析不显示 taskCard。
  - 清洗 taskCard 失败原因，避免泄露内部错误。

- `components/chat/chat-data.ts`
  - 定义 conversation、message、attachment、imageGeneration、webContext、taskCard 等前端类型。

### Runtime V2 核心

- `lib/agent/runtime/**`
  - Runtime V2 编排层。
  - 构建当前 conversation contextPack。
  - 规划意图。
  - 选择 skill。
  - 执行 gate。
  - 输出可序列化 decision / trace。

- `lib/agent/runtime/context-pack.ts`
  - 构建本轮上下文包。
  - 只压缩当前 conversation 的最近消息、附件摘要、activeTask、临时偏好。
  - 普通问题少传上下文。
  - 文件问题只带附件摘要，不无脑塞全文历史。

- `lib/agent/runtime/conversation-memory.ts`
  - 当前 conversation 级 memory 摘要。
  - 不做 user profile memory。
  - 不跨 conversation 查找。

- `lib/agent/runtime/intent-planner.ts`
  - 汇总 legacy task、skill selection、execution gate。
  - 决定 `answer_chat` / `ask_clarification` / `run_legacy_tool`。
  - 处理学术 PPT 模糊请求和 PPT continuation 边界。

- `lib/agent/runtime/skill-router.ts`
  - 根据用户文本、当前 activeTask、上传文件和显式工具选择匹配 Runtime skill。

- `lib/agent/runtime/execution-gate.ts`
  - 判断是否真的允许执行工具。
  - 普通咨询、公式咨询、先给方案等场景不执行工具。
  - 缺少文件、activeTask、图片编辑对象等信息时要求追问。

- `lib/agent/runtime/tool-executor.ts`
  - 根据 Runtime decision 调用对应 Tool Adapter。
  - 统一 validation / failure 用户可读输出。

### Skills 与 Tool Adapter

- `lib/agent/skills-v2/**`
  - Runtime V2 skill 层扩展预留区域。

- `lib/agent/runtime/tool-adapters/**`
  - Runtime V2 到旧工具链的标准适配层。
  - 已接入：file-analysis、word、excel、ppt-simple、image、teaching-diagram、knowledge-graph。
  - adapter 只封装输入校验、执行和结果卡片，不重写底层生成器。

- `lib/agent/skills/parse-document.ts`
  - 文件解析兼容层。
  - 优先复用 `lib/document-processing/`，必要时保留旧 Kimi fallback。

### 自动化回归

- `scripts/agent-runtime/check-runtime-v2.ts`
  - 不调用真实模型。
  - 不调用真实工具。
  - 直接测试 Runtime planner / skill-router / execution-gate / context 行为。
  - 当前覆盖 17 个用例，当前结果为 17/17 PASS。

## 3. 当前聊天链路

```text
用户消息
→ app/api/ai/chat/route.ts 解析 JSON / multipart
→ 读取当前 conversation 最近消息、上传附件、activeTask
→ contextPack
→ intent-planner
→ skill-router
→ execution-gate
→ Runtime decision
  → answer_chat
    → callChatModel
    → SSE token
    → final message
  → ask_clarification
    → 追问文本
    → final message
  → run_legacy_tool
    → tool-executor
    → tool-adapter
    → old tool chain / local parser / smart-tools API
    → taskCard 或直接回答
    → final message
→ 前端消费 SSE
→ 单一 pending assistant 气泡固化
```

## 4. 当前对话记忆边界

Agent Runtime V2 只做当前 conversation 级 memory：

- 记忆只绑定当前 `conversationId`；
- 新开对话后 memory 为空；
- 新开对话不继承旧 activeTask；
- 新开对话不继承旧文件引用；
- 新开对话不继承旧临时偏好；
- 新开对话不继承旧 `conversationSummary`；
- 不做长期 memory；
- 不做 user profile memory；
- 不做全站 memory；
- 不做“永久记住”；
- 不做记忆管理页；
- 不保存用户长期偏好；
- 不跨 conversation 查 activeTask、文件或偏好。

当前 conversation 内允许记住：

- 最近对话摘要；
- 当前 activeTask；
- 最近上传文件摘要；
- 最近生成的 PPT / Word / Excel / 图片 / 教学架构图 / 知识图谱任务；
- 本对话临时偏好，例如“简短点”“不要生成，先给方案”。

## 5. 已接入能力

- 普通聊天：直接回答，不调用工具。
- simple PPT：明确生成 PPT 时进入 `ppt-simple`，显示 taskCard。
- Word：明确生成 Word 文档时进入 Word adapter，显示 taskCard 和 docx 下载入口。
- 基础 Excel / xlsx 导出：明确导出 Excel 时生成 xlsx，显示 taskCard。
- 图片生成：明确生成图片时创建图片任务，显示 taskCard / 图片预览。
- 文件分析：上传 txt / docx / pdf 等后直接解析并回答，不显示 taskCard。
- 教学架构图入口：通过现有 smart-tools API 创建任务，显示 taskCard / 打开入口。
- 知识图谱入口：通过现有知识图谱 API 创建任务，显示 taskCard / 打开入口。

特别说明：

- Excel 当前只是基础 xlsx 导出能力，不是完整 Excel 工作区。
- simple PPT 当前只支持基于主题重新生成新版，不支持直接编辑已有 PPT 文件。

## 6. 已解决问题

- `PPT怎么做？` 不再误生成 PPT，只聊天。
- Excel 公式咨询不生成 xlsx。
- `生成学术PPT` 不误进 simple PPT，也不默认进入 Academic PPT，先追问。
- 当前 conversation 内 activeTask 可识别。
- 新 conversation 不继承旧任务。
- `刚才那个`、`上一张图`、`继续刚才的PPT`、`这个文件再总结短一点` 等语义已有当前 conversation 级处理。
- SSE 双 assistant 气泡已修复。
- `final` 不覆盖已流式正文，不再整体重放第二遍。
- 流式中断后 partial 内容不消失。
- taskCard 已统一展示。
- 文件分析不显示 taskCard。
- debug 信息普通用户不可见，`debugAgent=1` 才显示精简 trace。
- provider/model/internal JSON/stack 不面向普通用户展示。

## 7. 当前遗留问题

- 文件分析真实 multipart 场景仍建议继续补浏览器自动化测试，尤其是 txt / docx / pdf 上传与刷新恢复。
- simple PPT 不支持直接编辑已有 PPT，只支持重新生成新版。
- Excel 不是完整工作区，不支持复杂单元格编辑、公式工作台、数据透视等完整 Excel 体验。
- “继续生成”和 taskCard “重试”能力仍是 UI 占位，后续需要单独接入恢复/重试链路。
- GitNexus MCP 当前未暴露，因此本阶段 impact / detect_changes 仍不可用，只能用显式 diff、显式 stage 和测试做保护。
- 当前工作区仍有大量历史脏改，包括 Academic PPT、`services/**`、`data/**`、package lock、patch 文件等；这些不属于 Agent Runtime V2 已提交快照。

## 8. 回归测试方式

Runtime 回归：

```bash
npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts
```

类型检查：

```bash
npm.cmd exec -- tsc --noEmit
```

构建验证：

```bash
npm.cmd run build
```

当前 `check-runtime-v2.ts` 结果：

- 17/17 PASS；
- 输出 `Agent Runtime V2 regression passed.`。

## 9. 安全提交链

- `7ade063 feat(agent): add runtime v2 chat orchestration`
  - Runtime V2 核心聊天编排、SSE、taskCard、Tool Adapter 主链路。

- `d26a6d5 feat(agent): improve conversation memory and active task handling`
  - 当前对话记忆、activeTask 识别、真实登录态验收补强。

- `a10ea72dc0b0e11450d98293d34e1b69e00f2ece fix(agent): scope memory to current conversation`
  - 明确 memory 只绑定当前 conversation，不做长期记忆。

- `1ddf932 test(agent): add runtime v2 regression checks`
  - 新增 Runtime V2 自动化回归脚本，修复学术 PPT 模糊请求分流。

- `38f9fe4e45ab5c723f7dcc20aad215be32392471 test(agent): verify tool task card flows`
  - 真实工具端到端 taskCard 验收与教学架构图 adapter 入口修正。

- `863690fe2bb8ca95f8070e627d9c83cedcbcc62f fix(agent): stabilize file analysis and ppt continuation boundaries`
  - 文件分析解析链路收口，明确 simple PPT 延续边界。

- `16cce8dba355a8ca50c15bdda409465303074790 fix(agent): polish chat task card experience`
  - 聊天页 taskCard 体验收口，debug trace 隐藏，普通用户展示优化。

## 10. 后续建议

优先级 A：文件分析真实上传自动化测试

- 补 Playwright 或 API E2E fixture；
- 覆盖 txt / docx / pdf multipart；
- 覆盖 SSE、刷新恢复、无文件追问。

优先级 B：Excel 独立能力规划

- 明确基础 xlsx 导出与完整 Excel 工作区的边界；
- 设计后续 spreadsheet workspace / formula assistant / data cleaning 能力。

优先级 C：PPT 修改 adapter 单独设计

- 区分“基于上次主题重新生成”和“上传已有 PPT 后修改”；
- 不把真实编辑硬塞进 simple PPT 旧生成器。

优先级 D：继续/重试任务能力

- 将 interrupted partial、taskCard retry、继续生成统一成可恢复动作；
- 避免重复 assistant 气泡和重复任务。

优先级 E：ChatGPT 式耗时展示

- 增加“思考 1m32s”等用户可见状态；
- 不展示思考链、内部 JSON、provider/model。

优先级 F：清理历史脏改和分支合并准备

- 单独整理 Academic PPT 历史脏改；
- 单独整理 `services/**` 历史脏改；
- 排除 `data/**` 运行产物、patch、package lock 等不应提交内容；
- 再准备正式 merge / PR。

## 11. 第 21 阶段补充：文件分析真实上传自动化测试与当前对话文件续接

第 21 阶段继续保持 Agent Runtime V2 的记忆边界：只在当前 `conversationId` 内恢复文件引用，不做长期记忆，不查用户历史全部会话，不写 user profile memory。

### 文件分析链路现状

- multipart 上传入口在 `app/api/ai/chat/route.ts`，通过 `request.formData()` 读取 `files`。
- file-analysis adapter 主路径直接调用 `lib/document-processing/parser` 的 `parseDocuments()`。
- `lib/agent/skills/parse-document.ts` 是兼容层，仍然是公共 parser 优先，旧 Kimi fallback 只作为后备。
- 本阶段未发现 file-analysis 主路径存在新的私有 txt/docx/pdf parser。
- 文件分析成功后，解析摘要写入当前 conversation 的 `chatAttachment.extractedText`。

### 当前 conversation 文件续接

新增 `ConversationFileReference` 传给 Tool Adapter，用于当前 conversation 内文件续接：

- `attachmentId`
- `fileName`
- `mimeType`
- `sizeBytes`
- `objectKey`
- `providerFileId`
- `extractedText`
- `textPreview`
- `parseStatus`
- `sourceMessageId`
- `conversationId`

chat route 查询范围严格限定为当前 `conversationId + userId` 的用户附件。adapter 处理规则：

- 有新上传文件时，优先解析本轮 multipart 文件；
- 没有新文件时，只复用当前 conversation 的 `extractedText`；
- 没有可复用文件时，要求用户上传文件；
- 新 conversation 不继承旧文件引用；
- 不把完整大文件全文塞进跨会话记忆。

### 自动化测试

新增脚本：

```bash
npm.cmd exec -- tsx scripts/agent-runtime/check-file-analysis-upload.ts
```

真实 API E2E 可选：

```bash
AGENT_E2E_BASE_URL=http://localhost:3099
AGENT_E2E_COOKIE=<真实浏览器登录 cookie>
```

没有 `AGENT_E2E_COOKIE` 时，脚本明确跳过真实 API E2E，不把跳过当作真实上传通过。

当前覆盖结果：

- txt parser fixture：通过；
- docx parser fixture：通过；
- pdf parser fixture：通过，存在 pdfjs/canvas optional polyfill warning，但文本层解析成功；
- txt file-analysis adapter：通过，无 taskCard，无生成附件；
- 无文件请求：通过，要求上传文件；
- 同一 conversation 文件续接：通过；
- partial parsed 文件续接：通过；
- 新 conversation 不继承文件：通过；
- 真实 multipart API E2E：缺少登录 cookie 时跳过。

### interrupted / partial 恢复边界

已支持的情况：

- 文件解析成功并写入当前 conversation 的 attachment metadata 后，即使后续回答中断，下一轮可通过 `extractedText` 继续总结。

未覆盖的情况：

- 如果中断发生在解析结果写入前，目前只保留原始附件记录；storage adapter 没有统一读取原始对象接口，本阶段不做重新拉取原文件解析。

后续建议：

- 补真实登录 cookie 下的 multipart API E2E；
- 补浏览器上传流程自动化；
- 如需覆盖“解析前中断恢复”，先为 storage adapter 增加受控读取接口，并继续限制在当前 conversation 内。

## 12. 第 22 阶段补充：聊天原生 Excel 能力与独立 Excel Engine

第 22 阶段把 Excel 从“旧技能链路里的基础占位能力”收束为一个独立后端模块。聊天仍然只是入口，不做 Excel 独立页面，不做在线编辑器。

### 架构边界

- Agent Runtime：只负责判断是否需要 Excel、是否缺少文件或数据。
- `excel-adapter`：只负责桥接、输入校验、整理请求和返回 taskCard / generatedFiles。
- `lib/excel-engine/**`：负责真正的 `.xlsx` 生成、解析、修改、样式化和输出。
- Chat UI：继续使用统一 taskCard 和现有附件下载入口，不新增 Excel 页面。

### Excel Engine 目录

```text
lib/excel-engine/
  README.md
  generate-xlsx.ts
  index.ts
  parse-xlsx.ts
  style-presets.ts
  types.ts
  validate-blueprint.ts
  workbook-blueprint.ts
```

### 依赖选择

项目已有：

- `xlsx`
- `jszip`
- `papaparse`

本阶段没有新增 `exceljs`，没有修改 package 或 lock 文件。实现策略是用 `xlsx` 读写 workbook 基础结构，再用 `jszip` 后处理 OOXML 样式、冻结窗格和筛选等结构。

### WorkbookBlueprint

Excel Engine 的核心输入是可序列化蓝图：

- `WorkbookBlueprint`
- `SheetBlueprint`
- `ColumnBlueprint`
- `FormulaBlueprint`

蓝图负责描述标题、sheet、列、行、公式、汇总行、冻结表头、自动筛选和列宽。Agent 不直接拼 Excel 文件。

### 默认样式

当前只有一个正式模板 `formal`：

- 标题行合并；
- 表头深色背景、白字、加粗；
- 数据区细边框；
- 斑马纹；
- 冻结标题/表头区域；
- 自动筛选；
- 数字、金额、百分比列使用基础格式；
- 汇总行强调；
- sheet 名和文件名会清理非法字符。

### 数据来源边界

允许的数据来源：

- 用户当前消息里的结构化数据；
- 当前 conversation 文件解析出的 `extractedText` / `textPreview`；
- 当前请求上传的 txt/docx/pdf；
- 当前请求上传的 xlsx；
- 用户明确要求的空白模板字段。

禁止：

- 没有数据时编造真实成绩、销售额、金额；
- 跨 conversation 查文件；
- 读取长期用户记忆；
- 保存长期偏好；
- 把 Excel 生成逻辑塞进 chat route 或 Runtime。

缺少数据时返回：

```text
请提供要整理的数据，或上传文件后我再生成 Excel。
```

### 当前支持能力

- 文本数据导出 Excel；
- 学生成绩统计模板；
- 销售统计模板；
- 多 sheet 工作簿；
- 当前 conversation 文件摘要整理成 Excel；
- 上传 xlsx 后导出新版，当前支持增加平均分等基础公式列；
- 统一 Excel taskCard，下载入口复用现有附件链路。

### 当前不支持

- Excel 独立页面；
- 在线表格编辑器；
- 复杂 BI；
- 数据透视；
- 复杂图表；
- 公式工作台；
- 跨 conversation 修改旧 Excel；
- 没有上传 xlsx 时直接修改已有 Excel；
- 完整保留旧 xlsx 的复杂样式、宏、图表。

### 回归测试

新增：

```bash
npm.cmd exec -- tsx scripts/agent-runtime/check-excel-engine.ts
```

当前结果：

- `check-excel-engine.ts`：通过；
- `check-runtime-v2.ts`：通过，22/22 PASS；
- `check-file-analysis-upload.ts`：通过，真实 API E2E 因缺少 `AGENT_E2E_COOKIE` 明确跳过；
- `tsc --noEmit`：通过。

### 后续建议

- 补真实登录态聊天 E2E，验证 Excel taskCard 下载链接；
- 增加 CSV 上传整理；
- 扩展预算、项目进度、客户跟进等模板；
- 单独设计 Excel 修改能力矩阵；
- 若后续需要复杂图表和更强样式，再评估 `exceljs` 或专用 OOXML 写入层。
## 30I. Word 链路收口快照

### 当前完整链路

聊天原生 Word 生成当前已从旧 legacy 生成路径收口到独立包装链路：

```text
用户消息
-> Agent Runtime V2 intent-planner / skill-router / execution-gate
-> word-adapter
-> lib/word-engine
-> lib/document/**
-> generatedFiles / taskCard.downloadUrl
-> 前端生成文件卡片下载 .docx
```

职责边界：

- Runtime 只判断是否真的需要 Word，以及是否缺主题、文件或当前任务。
- `word-adapter` 只负责组装 `WordRequest`、读取当前 conversation 文件/摘要/任务记忆、调用 `word-engine`、返回 `taskCard` 和下载元数据。
- `lib/word-engine/**` 是聊天原生 Word 的独立后端包装层，不调用真实模型，不重写底层 docx 生成器。
- `lib/document/**` 继续负责底层 docx 渲染、样式和包结构。
- Chat UI 继续使用统一生成文件卡片和现有下载入口，不新增 Word 独立页面。

### 已完成能力

- Word 咨询不生成文件，例如“Word 怎么排版？”只走普通聊天回答。
- 明确 Word / docx 生成会进入 `word-adapter`，生成可下载 `.docx`。
- 上传 txt 后生成 Word 时，文件真实内容会进入正文。
- “根据这个文件总结一下”等总结/分析请求优先进入 file-analysis，不误生成 Word。
- 同一 conversation 内支持基于 `wordTaskMemory` 续写当前 Word 任务。
- 新 conversation 不继承旧 Word 任务、旧文件或长期用户记忆。
- 真实 API E2E 已验证 taskCard、downloadUrl、docx package 可读和正文非空。
- 正文清理污染词，避免出现 AI 过程稿、`wordTaskMemory`、stage、mock、placeholder、TODO 等内部内容。

### 关键提交

- `4c4f9f0` - 30B Word routing regression：固定 Word 生成/咨询/file-analysis/追问边界。
- `c5d9855` - 30C word-engine：新增 `lib/word-engine/**` 包装层，复用 `lib/document/**`。
- `5aec347` - 30D adapter 接入：`word-adapter` 默认调用 `word-engine`，停止默认 legacy Word 生成。
- `58fe810` - 30E task memory/resume：增加 `wordTaskMemory` 和同 conversation 续写状态。
- `0163132` - 30F content quality：优化正式报告/方案/总结正文结构和污染词清理。
- `4ca3f50` - 30G real chat validation：补本地真实聊天链路验收脚本。
- `1487dde` - 30H authenticated chat E2E：补真实登录 API E2E，修正 Word 真实聊天走 adapter 下载链路。

### 当前不支持

- 不做 Word 独立编辑器页面。
- 不做复杂在线 Word 编辑体验。
- 不做已有 docx 的复杂样式级修改。
- 不做自动目录、页眉页脚等高级版式控制。
- 不做多模板选择。
- 不做长文分章节真实模型续写。

### 验证结果

30H 后 Word 相关验证全部通过：

```bash
npm.cmd exec -- tsx scripts/agent-runtime/check-word-real-chat.ts
npm.cmd exec -- tsx scripts/agent-runtime/check-word-quality.ts
npm.cmd exec -- tsx scripts/agent-runtime/check-word-memory.ts
npm.cmd exec -- tsx scripts/agent-runtime/check-word-adapter.ts
npm.cmd exec -- tsx scripts/agent-runtime/check-word-engine.ts
npm.cmd exec -- tsx scripts/agent-runtime/check-word-runtime.ts
npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

`check-word-real-chat.ts` 在设置 `AGENT_E2E_COOKIE` 后已跑真实 `/api/ai/chat`，覆盖：

- Word 咨询不生成 taskCard；
- 明确 Word 请求生成 completed Word taskCard；
- 下载 URL 可用且不是内部 task polling URL；
- 下载 `.docx` 可被基础 docx/zip 校验读取；
- 上传 txt 中的 `张三`、`李四`、`90`、`85`、`AI 教育测试数据` 进入正文；
- 文件总结不生成 Word。

### 后续建议

- 增加 Word 模板风格预设。
- 增加自动目录。
- 增加页眉页脚基础控制。
- 增强表格生成和表格样式。
- 设计上传 docx 后的受控修改能力。
- 设计长文分段生成和恢复策略，但继续保持当前 conversation 边界。
