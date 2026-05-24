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
