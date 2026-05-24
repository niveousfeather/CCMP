# NexusAI 主聊天 Agent Runtime V2 第一阶段实施计划

日期：2026-05-23

## 1. 当前聊天链路分析

主入口是 `app/api/ai/chat/route.ts`。前端 `components/chat/chat-page.tsx` 将文本消息、附件和工具选择发送到 `/api/ai/chat`，后端完成鉴权、请求解析、附件校验、会话创建、用户消息保存，再按模式进入 manual chat 或 agent chat。

Agent 模式当前主要依赖旧链路：

- `lib/agent/router.ts`
  - `extractAgentTask`：把用户文本、附件状态、工具选择、pending clarification 合并成 `AgentTask`。
  - `getAgentDecision`：把 `AgentTask` 映射为旧版 action。
  - `runAgent`：执行真实能力，包括快速聊天、文件解析、Word、Excel、PPT、联网上下文等。
  - `callChatModel`：封装 provider/model 调用。
- `lib/agent/task-intents.ts`
  - 通过显式输出动词和目标类型识别 Word/PPT/Excel 生成意图，并避免把“如何做”误判为生成。
- `lib/agent/task-router.ts`
  - 判断是否走快速聊天，避免普通聊天被功能任务阻塞。
- `lib/agent/async-tasks.ts`
  - 对较长的 Word/PPT/文件任务排队异步执行，并轮询 `/api/ai/chat/tasks/[id]`。

前端对 API 响应中的未知字段具备天然兼容性，本阶段新增的 `agentRuntimeDecision` 不会改变已有 UI 行为。

## 2. 可复用旧模块

第一阶段不重写旧能力，Runtime V2 只做判断层并复用已有模块：

- Word：`lib/agent/skills/create-document.ts`、`lib/document/**`
- Excel：`lib/agent/skills/create-spreadsheet.ts`、`lib/spreadsheet/**`
- 简单 PPT：`lib/agent/skills/create-presentation.ts`、`lib/presentation/**`
- 图片：`app/api/ai/image/route.ts`、`lib/image/**`
- 文件理解：`lib/agent/skills/parse-document.ts`、`parse-image.ts`、`parse-video.ts`、`lib/document-processing/**`
- 知识图谱：`app/api/ai/knowledge-graph/**`
- 教学架构图：`app/api/smart-tools/teaching-architecture-diagram/**`、`lib/smart-tools/teaching-architecture-diagram/**`

## 3. 要废弃或绕开的旧逻辑

暂不删除任何旧逻辑。后续可逐步收敛这些点：

- `app/api/ai/chat/route.ts` 中图片任务解析、异步任务计划和 provider 错误处理仍集中在路由文件里，后续可迁入 Runtime V2。
- `lib/agent/router.ts` 同时承担意图识别、上下文收集、模型调用、工具执行和文件渲染，后续应拆成 planner/executor/tool adapter。
- 旧 `AgentTask` 继续作为兼容层，V2 决策先包裹它，不直接替换。

## 4. Agent Runtime V2 目录设计

新增目录 `lib/agent/runtime/`：

- `types.ts`：定义 V2 输入、会话记忆、skill match、execution gate、decision、trace。
- `context-manager.ts`：整理最近消息并提取最新用户文本。
- `conversation-memory.ts`：构建会话级 memory，仅包含对话摘要、上传文件摘要、当前任务状态、当前会话偏好。
- `skill-router.ts`：在旧 `AgentTask` 基础上选择 Skill V2，覆盖教学架构图、知识图谱、图片等旧链路未统一表达的能力。
- `execution-gate.ts`：判断是否需要工具、是否需要确认、缺失输入和是否允许执行。
- `intent-planner.ts`：输出用户要求的内部决策结构。
- `tool-executor.ts`：第一阶段只返回执行计划，不真实调用新工具。
- `response-stream.ts`：序列化稳定的内部决策结构。
- `index.ts`：导出 `planAgentRuntimeTurn`。

当前内部决策结构：

```json
{
  "intent": "general_chat",
  "targetTool": "none",
  "confidence": 0.25,
  "needsTool": false,
  "needsConfirmation": false,
  "missingInputs": [],
  "activeTaskId": null
}
```

## 5. Skill V2 规范

新增目录 `lib/agent/skills-v2/`：

- `README.md`：说明 Skill V2 是模型无关的能力契约，不是执行器。
- `types.ts`、`registry.ts`：注册 skill id、说明文件、允许和禁止工具。
- `file-analysis/SKILL.md`
- `word/SKILL.md`
- `excel/SKILL.md`
- `ppt-simple/SKILL.md`
- `image/SKILL.md`
- `teaching-diagram/SKILL.md`
- `knowledge-graph/SKILL.md`

每个 SKILL.md 只写：

- 什么时候触发；
- 什么时候不要触发；
- 缺什么信息要追问；
- 允许调用哪些现有工具；
- 禁止调用哪些工具；
- 输出格式；
- 失败处理。

## 6. 第一阶段修改清单

本阶段已完成：

- 新增 Runtime V2 骨架和 `planAgentRuntimeTurn`。
- 新增 Skill V2 registry 和 7 个 SKILL.md。
- 在 `app/api/ai/chat/route.ts` 中计算 `agentRuntimePlan`。
- 在同步聊天响应中返回 `agentRuntimeDecision`。
- 在 assistant message metadata 中保存 `agentRuntimeV2` trace。
- 在异步任务完成后通过 `lib/agent/async-tasks.ts` 保存 `agentRuntimeV2` trace。

本阶段明确不做：

- 不替换 `runAgent`。
- 不重写 Word/Excel/PPT/图片/知识图谱/教学架构图执行器。
- 不做长期记忆。
- 不引入外部 Agent 框架或新依赖。
- 不改前端 UI。

## 7. 架构参考资料

仅作为设计参考，未复制外部代码：

- OpenAI Agents SDK：参考 agent、tool、handoff、trace 的分层思想。参考：https://openai.github.io/openai-agents-python/
- MCP tools/resources/prompts：参考能力边界和工具契约的显式化。参考：https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- LangGraph stateful/durable agent：参考状态与执行分离的思路。参考：https://docs.langchain.com/oss/python/langgraph/overview
- Claude Skills / SKILL.md：参考 Markdown skill 契约，保持可读、可移植。参考：https://code.claude.com/docs/en/skills

## 8. 风险与验证方式

风险：

- `app/api/ai/chat/route.ts` 是主聊天入口，任何改动都需要重点回归。
- 当前 V2 判断层复用旧 `extractAgentTask`，中文乱码历史常量仍会影响部分 legacy intent 识别，后续应逐步迁移到更清晰的规则/模型规划器。
- `agentRuntimeDecision` 已返回给 API 调用方，但当前前端未展示；如果未来展示，需要避免暴露 provider、内部错误、敏感上下文。
- GitNexus MCP/CLI 在当前环境不可用，本次使用 `rg` 做替代影响面分析；提交前如 GitNexus 恢复，应补跑 `gitnexus_detect_changes()`。

验证：

- `npm.cmd exec -- tsc --noEmit`
- `git status --short`
- `git diff --name-only`
- `git diff --cached --name-only`
- 手工请求 `/api/ai/chat` 时检查响应和 assistant metadata 是否包含 `agentRuntimeDecision` / `agentRuntimeV2`。

## 9. 未触碰模块

按要求未修改：

- Academic PPT 业务代码
- 教学架构图业务代码
- capability-map
- 图片/视频/3D 主业务链路
- Word/Excel 底层生成器
- `services/ai-tools-engine/**`
- `data/smart-tools/**/tasks/**`

## 10. 第二阶段中控行为

第二阶段将 Runtime V2 从旁路观察升级为聊天决策中控，但仍不重写工具执行器：

- `agentRuntimeDecision` 不再直接返回给普通前端 UI。
- 完整 `agentRuntimeV2` 只保存在 assistant message metadata、异步任务 metadata 和开发日志中。
- `nextAction=ask_clarification`：直接保存一条自然语言追问，不调用工具。
- `nextAction=answer_chat`：走普通聊天模型回答，并清空内容工具选择，避免用户只是提到 PPT/Excel/图片就触发生成。
- `nextAction=run_legacy_tool`：交给旧 `getAsyncAgentTaskPlan`、`runChatImageGeneration`、`runAgent`、`task-router`、`task-intents` 等链路执行。
- Runtime progress stages 只记录处理阶段：`analyzing_context`、`planning_intent`、`selecting_skill`、`checking_execution_gate`、`calling_model`、`calling_tool`、`completed`；不记录或展示模型思考链。

当前门控会追问的典型情况：

- 用户只是咨询“怎么做/如何写/怎么制作”。
- 用户只提到 PPT、Excel、图片，但没有明确生成/导出/修改意图。
- 生成 PPT/Word/教学架构图时缺少主题。
- 导出 Excel 时缺少数据来源。
- 编辑图片时缺少要修改的图片或当前任务引用。
- skill 置信度低于执行阈值。

当前会调用旧工具的典型情况：

- 明确生成普通 PPT，且主题足够：继续走 simple PPT 旧链路。
- 明确生成 Word/Excel 文件，且输入足够：继续走旧 Word/Excel 链路。
- 明确图片生成/编辑，且输入足够：继续走 `/api/ai/image` 旧链路。
- 明确文件分析或上传文件总结：继续走旧 `runAgent` 文件解析链路。

## 11. 第二阶段测试矩阵

| 输入 | 预期 Runtime V2 行为 | 预期用户可见结果 |
| --- | --- | --- |
| `PPT怎么做？` | `answer_chat`，不选择工具执行 | 只回答制作建议，不生成 PPT |
| `帮我生成一个10页PPT` | `ask_clarification`，`missingInputs=["subject"]` | 追问 PPT 主题/受众/页数细节 |
| `这个Excel公式怎么写？` | `answer_chat`，不执行 Excel 工具 | 只回答公式写法，不生成 `.xlsx` |
| `帮我导出成Excel` | `ask_clarification`，缺少数据来源 | 追问要导出的数据或源文件 |
| `根据这个文件总结一下` | 有附件时 `run_legacy_tool`，目标 `file-analysis` | 复用旧文件解析/总结链路 |
| `生成教学架构图` | `ask_clarification`，目标 `teaching-diagram` 但缺少主题 | 追问架构图主题或材料 |
| `围绕数字赋能课程改革生成教学架构图` | `run_legacy_tool`，目标 `teaching-diagram` | 当前阶段仍保留旧链路兜底，后续再接真实教学架构图工具 |
| `把刚才那张图标题改一下` | `run_legacy_tool` 或追问当前图片任务，目标 `image` | 识别为图片继续任务，不进入 Word/PPT/Excel |
| `随便聊聊` | `answer_chat`，目标 `none` | 普通聊天回答 |

说明：第二阶段中控已经能影响 chat route 分流；但除旧链路已支持的工具外，教学架构图、知识图谱等跨产品工具的真实调用仍留到后续 tool adapter 阶段。

## 12. 第三阶段 Tool Adapter 设计

第三阶段新增 `lib/agent/runtime/tool-adapters/`，把 Runtime V2 的 `targetTool` 标准化映射到现有项目能力。Adapter 只做薄封装、输入校验、权限/上下文门控、结果封装和失败文案，不重写任何业务工具内部实现。

统一接口字段：

- `id`
- `targetTool`
- `canHandle(decision, context)`
- `validateInputs(decision, context)`
- `execute(decision, context)`
- `getResultCard(result)`
- `failureToUserMessage(error)`

`tool-executor.ts` 现在负责：

- 根据 `decision.targetTool` 查 adapter registry；
- 先调用 `validateInputs`；
- validate 失败时返回自然语言追问，不抛内部错误；
- validate 通过才调用 `execute`；
- 无 adapter 或 adapter 不匹配时 fallback 到 `legacy-agent-adapter`；
- adapter 执行失败转成用户可读错误。

## 13. Adapter 映射表

| targetTool | Adapter | 当前接入方式 |
| --- | --- | --- |
| `file-analysis` | `file-analysis-adapter` | 薄封装旧 `runAgent` 文件分析；附件解析优先 `lib/document-processing/`，失败回退 Kimi |
| `word` | `word-adapter` | 薄封装旧 Word 生成链路 |
| `excel` | `excel-adapter` | 薄封装旧 Excel 生成链路 |
| `ppt-simple` | `ppt-simple-adapter` | 薄封装普通 PPT 旧链路，不进入 Academic PPT |
| `image` | `image-adapter` | 薄封装旧图片生成/编辑任务，保留 imageGeneration metadata |
| `teaching-diagram` | `teaching-diagram-adapter` | 通过现有 smart-tools API 创建教学架构图任务，不改内部实现 |
| `knowledge-graph` | `knowledge-graph-adapter` | 通过现有知识图谱 API 创建任务 |
| `none` / 未匹配 | `legacy-agent-adapter` | 兜底旧 `runAgent` / task-router / task-intents |

已真实接入：

- file-analysis
- word
- excel
- ppt-simple
- image
- teaching-diagram
- knowledge-graph

仍保留 legacy fallback：

- 未匹配 targetTool；
- adapter `canHandle` 不匹配；
- Runtime V2 后续尚未覆盖的普通 agent 任务；
- 旧 `runAgent` 内部支持但 V2 尚未独立建模的边缘任务。

## 14. Active Task 识别

第三阶段新增当前会话内 active task 识别，只读取当前 conversation 最近的 assistant message，不做长期记忆，不跨会话搜索。

当前识别来源：

- assistant metadata 中的 `imageGeneration` -> `image`
- assistant metadata 中的 `asyncTask.kind` -> `ppt` / `word` / `file-analysis`
- assistant metadata 中的 route reason -> `teaching-diagram` / `knowledge-graph`
- 最近生成附件扩展名 -> `ppt` / `word` / `excel`

典型用途：

- “把刚才那张图标题改成 XXX”可以在存在当前图片/教学架构图任务时进入图片修改 adapter。
- 找不到当前任务时，adapter 会追问用户指哪张图/哪个文件。

## 15. 第三阶段测试矩阵

| 输入 | 预期结果 |
| --- | --- |
| `PPT怎么做？` | `answer_chat`，不调用 adapter |
| `帮我生成10页PPT，主题是AI教育` | `ppt-simple-adapter`，进入旧普通 PPT 链路 |
| `生成学术PPT` | `ask_clarification`，不默认调用 Academic PPT，提示明确使用专项工具 |
| `这个Excel公式怎么写？` | `answer_chat`，不生成 xlsx |
| `把这些数据导出成Excel：姓名，成绩` | `excel-adapter`，进入旧 Excel 链路 |
| `根据上传文件总结一下` | `file-analysis-adapter`，进入旧文件分析链路，解析优先公共 document-processing |
| `生成教学架构图，主题是数字赋能课程改革` | `teaching-diagram-adapter`，通过现有 smart-tools API 创建任务 |
| `把刚才那张图标题改成XXX` | 有当前 image/teaching-diagram activeTask 时走 `image-adapter`；找不到时追问 |
| `生成知识图谱，主题是人工智能发展史` | `knowledge-graph-adapter`，通过现有知识图谱 API 创建任务 |
| `随便聊聊` | `answer_chat` |

风险：

- teaching-diagram 和 knowledge-graph adapter 通过内部 HTTP API 调用现有路由，依赖 cookie 和现有鉴权；失败会转成用户文案。
- Academic PPT 仍不作为普通 PPT 默认分流目标，避免误触发受限业务链路。
- Adapter 层已统一失败文案，但旧 `runAgent` 内部的 provider 错误仍由旧链路处理。

## 16. 第四阶段真实验收与前端体验

第四阶段目标是先验收真实聊天体验，不继续扩展新 adapter。主原则：

- 普通提问只聊天。
- 明确生成、修改、导出才调用工具。
- 缺少信息先追问。
- “刚才那个”“上一张图”“继续刚才的 PPT”等只在当前 conversation 内识别 activeTask。
- 前端只展示短状态，不展示 Runtime JSON、provider/model 或模型思考链。

后端新增规则：

- `agentRuntimeDecision` 不给普通 API 响应返回。
- `agentRuntimeV2` 继续写入 assistant metadata。
- `runtimePublicStatus` 写入 metadata，并在响应中返回短状态。
- `agentRuntimeTrace` 只在 `NODE_ENV=development` 或 `?debugAgent=1` 时返回，字段限制为 `intent`、`targetTool`、`confidence`、`nextAction`、`adapterId`、`missingInputs`、`activeTaskId`。

前端状态文案：

- `正在理解你的需求`
- `正在分析上下文`
- `已识别为：文件分析 / 图片修改 / PPT生成`
- `正在检查输入`
- `正在创建任务`
- `已开始处理`

当前对话记忆规则：

- 只读当前 conversation 最近 assistant message。
- 可识别最近图片、教学架构图、PPT、Word、Excel、文件分析、知识图谱任务。
- 不写长期记忆。
- 不跨会话搜索任务。
- 找不到 activeTask 时追问用户具体指哪个对象。

第四阶段验收结果：

| 输入 | intent/targetTool/nextAction | adapter | 结果 |
| --- | --- | --- | --- |
| `PPT怎么做？` | `general_chat` / `none` / `answer_chat` | 无 | 只聊天，不调用工具 |
| `帮我生成一个10页PPT，主题是AI教育` | `ppt_simple` / `ppt-simple` / `run_legacy_tool` | `ppt-simple-adapter` | 进入普通 PPT 旧链路 |
| `生成学术PPT` | `ppt_simple` / `ppt-simple` / `ask_clarification` | 无 | 追问/引导，不误进 Academic PPT |
| `这个Excel公式怎么写？` | `general_chat` / `none` / `answer_chat` | 无 | 只回答公式，不生成 xlsx |
| `把这些数据导出成Excel：姓名，成绩` | `excel` / `excel` / `run_legacy_tool` | `excel-adapter` | 进入旧 Excel 链路 |
| `根据上传文件总结一下` | `file_analysis` / `file-analysis` / `run_legacy_tool` | `file-analysis-adapter` | 进入文件分析链路 |
| `生成教学架构图，主题是数字赋能课程改革` | `teaching_diagram` / `teaching-diagram` / `run_legacy_tool` | `teaching-diagram-adapter` | 通过现有 smart-tools API 创建任务 |
| `把刚才那张图标题改成XXX` | `image` / `image` / `ask_clarification` 或 activeTask 存在时执行 | `image-adapter` | 找不到当前图时追问；有当前图片/教学图任务时执行 |
| `生成知识图谱，主题是人工智能发展史` | `knowledge_graph` / `knowledge-graph` / `run_legacy_tool` | `knowledge-graph-adapter` | 通过现有知识图谱 API 创建任务 |
| `随便聊聊` | `general_chat` / `none` / `answer_chat` | 无 | 普通聊天 |

真实 API 验收说明：

- 本地 dev server `http://localhost:3099/chat` 可打开。
- 直接调用 `/api/ai/chat?debugAgent=1` 被鉴权拦截，返回 `请先登录`。
- in-app browser 页面可打开，但浏览器插件 evaluate 环境不提供 `fetch/XMLHttpRequest` 构造器，无法在该环境直接发登录态 API 矩阵请求。
- 因此本阶段记录为：已完成 planner/route 类型验收、前端页面可视打开、鉴权行为确认；未伪造登录态真实 API 全矩阵结果。

验证：

- `npm.cmd exec -- tsc --noEmit` 通过。
- `npm.cmd run build` 在 Prisma generate 阶段失败：Windows `query_engine-windows.dll.node` rename `EPERM`，属于 node_modules DLL 权限/占用问题。提升权限重试请求被审批系统拒绝，未绕过。

未解决问题：

- 需要在已登录浏览器会话中用可用网络执行能力补跑完整 `/api/ai/chat` 矩阵。
- `chat-thread.tsx` 存在历史乱码默认文案，本轮实际 loading label 由 `chat-page.tsx` 传入短状态；后续可单独做编码清理。

## 17. 第五阶段性能优化与流式事件体验

第五阶段目标是减少普通聊天和文件问答的上下文负载，并让用户等待时马上看到可理解的处理状态。本阶段不新增 adapter，不重写工具执行链路。

新增 `lib/agent/runtime/context-pack.ts`：

- `latestUserMessage`：最新用户输入，截断到执行需要的长度。
- `recentSummary`：当前会话最近摘要，优先使用本地规则压缩。
- `attachmentSummaries`：附件名、类型、大小和短摘要。
- `activeTask`：当前 conversation 内的最近任务摘要。
- `sessionPreferences`：本轮会话偏好，例如中文、正式学术、简洁/详细。
- `selectedSkills`：最多 3 个候选 skill。
- `tokenBudgetHint`：`minimal`、`standard`、`file_summary`、`tool_execution` 四种预算模式。

上下文预算规则：

- 普通闲聊：`minimal`，只保留最新问题和少量最近摘要。
- 长对话：`standard`，使用本地摘要替代完整历史。
- 文件问答：`file_summary`，附件只传摘要和关键片段，不传无关历史。
- 工具调用：`tool_execution`，只保留 adapter 执行所需字段。

当前会话摘要缓存：

- 只写入 assistant message metadata 的 `conversationSummaryCache`。
- 只在当前 conversation 内读取，不跨会话使用。
- 使用本地规则摘要最近消息；不写入长期记忆，不保存敏感个人信息。
- 历史很短且没有旧摘要时不写缓存，避免无意义 metadata 膨胀。

聊天模型输入优化：

- `answer_chat` 改用 `buildRuntimeChatMessagesFromContextPack()` 构造模型消息。
- 普通聊天不再把完整 `parsed.messages.slice(-20)` 直接交给模型。
- 文档附件仍复用 `lib/document-processing/` 优先解析，但传给聊天模型的是压缩摘要和片段，不再按每文件 24k 字符塞入。
- 工具调用仍由 adapter/旧链路执行，不把无关聊天历史交给工具。

Runtime 事件设计：

| stage | 用户可见文案 |
| --- | --- |
| `analyzing_context` | 正在整理上下文 |
| `planning_intent` | 正在理解你的需求 |
| `selecting_skill` | 已识别为：文件分析 / 图片修改 / PPT 生成等 |
| `checking_execution_gate` | 正在判断是否需要工具 |
| `calling_model` | 正在生成回复 |
| `calling_tool` | 正在创建任务 |
| `completed` | 已完成 |

API 响应新增 `runtimeStatus.events`，前端优先展示这些短状态；普通用户看不到 `agentRuntimeDecision` 原始 JSON、provider/model、API key 或思考链。`agentRuntimeTrace` 仍只在 `NODE_ENV=development` 或 `?debugAgent=1` 时返回。

Provider streaming 策略：

- `callChatModel` 增加兼容型 `stream` 和 `onToken` 参数。
- 当前默认仍使用非流式 JSON 返回，避免破坏现有 chat API、任务卡片和保存逻辑。
- 当后续 provider 返回 `text/event-stream` 或 stream content-type 时，可以消费 SSE token 并触发 `onToken`。
- 不支持真实 token streaming 的 provider 继续使用本地 progress events 兜底，避免用户 100-200 秒无反馈。

快慢模型分层预留：

- `AgentModelConfig` 新增 `planner` 和 `reasoning` endpoint。
- 默认沿用现有 chat 模型配置。
- 支持后续通过 `AGENT_PLANNER_MODEL`、`AGENT_PLANNER_PROVIDER`、`AGENT_REASONING_MODEL`、`AGENT_REASONING_PROVIDER` 切换。
- 模型名不返回给普通前端 UI。

第五阶段验证样例：

| 输入 | 预期 | 本地 Runtime 验证结果 |
| --- | --- | --- |
| `随便聊聊` | 少上下文，快速 `answer_chat` | `targetTool=none`，`nextAction=answer_chat`，`contextMode=minimal` |
| `PPT怎么做？` | 不调用工具，快速回答 | `targetTool=none`，`nextAction=answer_chat`，`contextMode=minimal` |
| `根据上传文件总结一下` | 使用附件摘要/文件分析，不传整段无关历史 | `targetTool=file-analysis`，`nextAction=run_legacy_tool`，`contextMode=tool_execution` |
| `帮我生成一个10页PPT，主题是AI教育` | 进入 simple PPT adapter，状态显示正在创建任务 | `targetTool=ppt-simple`，`nextAction=run_legacy_tool` |
| `把刚才那张图标题改成XXX` | 识别 activeTask，检查当前图片任务 | 带 activeTask 时 `targetTool=image`，`nextAction=run_legacy_tool`，`activeTaskId` 存在 |

验证命令：

- `npm.cmd exec -- tsc --noEmit` 通过。
- 本地 `tsx` Runtime 决策样例通过。
- `npm.cmd run build` 需要单独记录结果；若 Prisma query engine DLL 被占用，按 Windows 环境问题处理，不改业务代码。

未解决问题：

- 后端已预留 token streaming 消费，但主 `/api/ai/chat` 仍是 JSON 响应，尚未切换 SSE/ReadableStream。
- 真实登录态 `/api/ai/chat` 全矩阵仍需在可用登录会话内补跑。
- GitNexus MCP 工具未暴露，本阶段已用 `rg` 和本地调用关系替代影响分析；提交前如工具恢复应补跑 `gitnexus_detect_changes()`。

## 18. 第六阶段真实流式 Chat API 与前端消费

第六阶段把主聊天从“JSON 完成后一次性返回”升级为可选 SSE 流式模式，同时保留旧 JSON fallback。

Stream 开关：

- request body: `stream: true`
- multipart form: `stream=true`
- query: `?stream=1`
- header: `Accept: text/event-stream`

默认不传 stream 时仍走旧 JSON 响应，兼容现有调用、异步任务轮询和测试。

SSE 事件协议：

```text
event: runtime_status
data: {"stage":"analyzing_context","message":"正在整理上下文"}

event: token
data: {"text":"..."}

event: tool_status
data: {"message":"正在创建任务"}

event: final
data: {"messageId":"...","conversationId":"...","taskId":"...","attachments":[]}

event: error
data: {"message":"用户可读错误"}
```

安全边界：

- 不输出 `agentRuntimeDecision` 原始 JSON。
- 不输出 provider/model/API key。
- 不输出 stack trace。
- 不输出模型思考链。
- `agentRuntimeTrace` 仍只在 `NODE_ENV=development` 或 `debugAgent=1` 时返回精简字段。

后端流式行为：

- stream=true 时创建 `ReadableStream` 并立刻发送 `runtime_status`。
- Runtime V2 完成规划后，按 `runtimeStatus.events` 发送 `analyzing_context`、`planning_intent`、`selecting_skill`、`checking_execution_gate`。
- `ask_clarification`：直接发送追问 token，保存 assistant message，然后发送 `final`。
- `answer_chat`：调用 `runRuntimeChatAnswer(..., { stream: true, onToken })`；provider 返回 SSE token 时逐 token 转发，不支持时最后一次性发送完整文本。
- `run_legacy_tool`：先发送 `tool_status`；如命中 async task plan，保存任务卡片并发送 `final`；否则复用 adapter/旧链路执行后发送结果。
- 出错时发送 `error` 用户可读文案，并尽力保存失败 assistant message。

前端消费方式：

- `chat-page.tsx` 默认请求 `/api/ai/chat?stream=1`，并设置 `Accept: text/event-stream`。
- 发送后先插入一条本地 pending assistant message。
- `runtime_status` / `tool_status` 更新等待态文案和状态列表。
- `token` 追加到 pending assistant message。
- `final` 用服务端保存后的 assistant message 替换 pending message，并刷新 conversation 列表。
- `error` 把 pending message 标为用户可读失败文案。
- 如果服务端返回旧 JSON，前端仍走原来的 JSON fallback 处理。

Provider streaming 支持：

- `callChatModel` 已支持 `stream` / `onToken`，并只在响应 `content-type` 是 event-stream/stream 时消费 token。
- 当前主 API 真实 token streaming 取决于 provider 是否返回兼容 SSE。
- 不支持 streaming 的 provider 仍通过本地 `runtime_status` 兜底，最后用完整文本补齐。

第六阶段测试矩阵：

| 输入 | 预期流式行为 | 当前验证 |
| --- | --- | --- |
| `随便聊聊` | 先显示“正在理解你的需求/正在整理上下文”，然后 token 文本 | 本地 Runtime 为 `answer_chat`；SSE 路径已实现 |
| `PPT怎么做？` | 不调用工具，只流式回答建议 | 本地 Runtime 为 `answer_chat` |
| `帮我生成一个10页PPT，主题是AI教育` | 显示“正在创建任务”，进入 ppt-simple 旧链路 | 本地 Runtime 为 `run_legacy_tool`，async task SSE final 支持 |
| `根据上传文件总结一下` | 显示整理上下文/创建任务或文件分析状态 | 有附件时 Runtime 为 `file-analysis` |
| `把刚才那张图标题改成XXX` | 有 activeTask 时显示检查/创建任务并进入 image adapter | 本地 Runtime 带 activeTask 为 `image/run_legacy_tool` |

未解决问题：

- 真实登录态 `/api/ai/chat?stream=1` 仍需要在可用浏览器会话中补跑端到端矩阵。
- stream path 与 JSON path 目前有少量重复保存逻辑，后续可提取共享 helper。
- Build 仍可能卡在 Prisma Windows DLL rename `EPERM`，属于本地环境占用/权限问题。

## 19. 第七阶段流式双 Assistant 气泡修复

问题表现：

- 用户发送消息后先出现一个本地 pending assistant 气泡。
- `token` 事件会持续写入这个 pending 气泡。
- `final` 事件已经把 pending 气泡替换成服务端保存后的正式 assistant message。
- 但 `consumeChatStream()` 返回后，`sendMessage()` 仍继续走旧 JSON 完成后的插入/替换逻辑，导致再次出现一个完整 assistant 气泡。

根因：

- 流式路径和 JSON fallback 共用 `AiChatResult`，缺少“final 已在流里处理”的标记。
- `sendMessage()` 无法区分“需要插入服务端 assistant message”和“pending 已经被 final 固化”。
- pending message id 使用时间戳，不够清晰，缺少 request 级防重保护。

修复策略：

- `AiChatResult` 新增 `handledInStream` 和 `requestId`。
- 发送消息时创建唯一 `requestId`，pending assistant id 固定为 `assistant-temp-${requestId}`。
- 前端维护：
  - `currentStreamingAssistantIdRef`
  - `currentStreamingRequestIdRef`
  - `streamingFinalizedRef`
- `runtime_status` / `tool_status` 只更新同一个 pending message 的 `statusText`，不创建单独状态气泡。
- `token` 只 append 到当前 pending assistant。
- `final` 调用 `finalizeStreamingAssistant()`，用服务端 `assistantMessage.id` 替换 temp id，并固化 content、attachments、任务卡片等字段。
- `sendMessage()` 收到 `handledInStream=true` 后直接跳过旧 JSON assistant 插入逻辑，只做 conversation 切换、侧栏刷新、loading 收尾。
- 本地图片 / Word / PPT pending 任务卡片也复用同一个 pending id；stream final 直接固化这张任务卡片，避免工具路径产生第二个 assistant 气泡。
- 如果服务端退回旧 JSON 响应，只要本轮已有 pending assistant，也使用正式 assistant message 替换 pending，而不是追加新 message。
- `consumeChatStream()` 使用流消费过程中的本地 `accumulatedText` 作为 final content 兜底，避免 React state 闭包过期导致 final 固化为空。

final 固化规则：

- 正常路径必须先查找 `assistant-temp-${requestId}`。
- 找到则替换，不 append。
- 只有找不到 pending message 时才 fallback append。
- `streamingFinalizedRef=true` 后，迟到 token 会被忽略。
- 当前 streaming id 不匹配的 runtime/token/final/error 事件会被忽略，避免旧请求污染新请求。

JSON fallback 防重复规则：

- 服务端不是 `text/event-stream` 或流消费失败时，仍允许走 JSON fallback。
- 一旦 SSE final 成功并返回 `handledInStream=true`，前端禁止再走旧的 assistant append/replace 逻辑。
- JSON fallback 不再无条件 append assistant；存在本轮 pending assistant 时统一替换 pending。
- 本地 pending 失败时会移除 pending 并恢复输入。

验证结果：

- `npm.cmd exec -- tsc --noEmit` 通过。
- 本阶段未改 API 业务工具和底层生成器。
- 需要在登录态浏览器中补充观察：
  - `随便聊聊`：单 assistant 气泡流式输出，final 后不消失、不重复。
  - `PPT怎么做？`：单 assistant 气泡，不调用工具。
  - `帮我生成一个10页PPT，主题是AI教育`：单 assistant 气泡，状态显示正在创建任务，final 固化任务提示/任务卡片。
  - `根据上传文件总结一下`：单 assistant 气泡内完成状态和结果。
## Phase 7 Follow-Up: Stream Final Must Not Replay Content

User testing still showed a second visual replay after streaming completed. The root cause was front-end reconciliation, not a second API answer:

- `final` replaced `assistant-temp-*` with the saved server message id, so React remounted the message component because `key={message.id}` changed.
- `finalizeStreamingAssistant()` called `revealAssistantMessage()`, so the already streamed text re-entered the reveal/typewriter path and looked like a whole second answer.

Follow-up fix:

- Add `ChatMessage.clientKey` as a stable render key.
- `ChatThread` uses `key={message.clientKey || message.id}`.
- Streaming pending messages set `clientKey` to the temp id.
- `final` may update the persisted message id, attachments, task card, and metadata, but keeps the stable `clientKey`.
- Stream final no longer calls `revealAssistantMessage()` and explicitly sets `reveal=false`.
- JSON fallback replacement also preserves the pending `clientKey` when replacing a pending assistant.

Browser verification:

- `你在吗，简单回复一句` early state: 1 assistant bubble with status text.
- Final state: 1 assistant bubble with `在。`, no status text, no duplicate bubble, no whole-answer replay.
## 20. 第八阶段流式稳定性与中断恢复

本阶段继续限定在主聊天 SSE 稳定性，不新增 adapter，不修改底层工具生成器。

后端 accumulatedText 规则：
- `requestId` 由前端传入，缺失时后端生成，所有 SSE event 都带同一个 `requestId`。
- stream writer 内维护 `serverSideFullText`，每次 `token` 先追加到该变量，再发送给前端。
- `ask_clarification`、`answer_chat`、async task、adapter/legacy tool 四条出口统一使用 `serverSideFullText || result.content` 作为保存和 `final` 内容。
- assistant message metadata 写入 `requestId` 与 `streamStatus:"completed"`，方便刷新后识别已完成流式消息。

中断恢复策略：
- provider 断流、debug 人工断流、client abort、SSE enqueue 失败进入统一 partial 保存。
- partial assistant 作为普通 assistant message 保存，`content=serverSideFullText || 用户可读中断文案`。
- metadata 写入 `streamStatus:"interrupted"`、`partial:true`、`requestId`、`runtimeStage`、`accumulatedText`、`errorCode`。
- 前端收到 `error` 或 stream 结束但没有 `final` 时，不回滚 pending message，而是保留已生成内容并标记 `interrupted`。

前端 message 状态机：
- `ChatMessage` 增加 `requestId`、`streamStatus`、`streamError`。
- `runtime_status` / `tool_status` 只更新当前 `requestId` 的同一个 pending assistant 的 `statusText`。
- `token` 只追加到当前 streaming message。
- `final` 只固化当前 message：替换服务端 id、附件、任务卡片和 metadata；已有流式正文优先保留，不再用 final 整段内容重放。
- `interrupted` / `failed` 消息显示“回复中断，已保留已生成内容，可以重试。”以及后续“继续生成”占位入口。

刷新恢复规则：
- conversation detail GET 读取 assistant metadata 中的 `partial`、`streamStatus`、`requestId`。
- `partial=true` 的历史 assistant 恢复为 `streamStatus:"interrupted"`，展示已保存内容和中断提示。
- completed 历史消息不恢复为 pending，也不显示状态文案。

Debug 人工断流：
- dev/debug 请求可使用 `debugStreamAbortAfterChars` 模拟 token 后中断。
- 该开关仅用于开发验收，不向普通用户展示内部错误、provider/model、stack 或 agentRuntimeDecision。

当前验证计划：
- `npm.cmd exec -- tsc --noEmit`
- 前端改动较多时执行 `npm.cmd run build`；若 Prisma `query_engine-windows.dll.node` rename `EPERM`，记录为 Windows DLL 占用问题。
- 登录态浏览器验证：`随便聊聊`、`PPT怎么做？`、`帮我生成一个10页PPT，主题是AI教育`、`根据上传文件总结一下`、`把刚才那张图标题改成XXX`。
- 人工断流验证：确认已生成 token 不丢、前端显示 interrupted、刷新后 partial message 仍存在、不出现第二条 assistant。
## 21. 第九阶段真实工具验收与统一任务卡片

本阶段限定在主聊天工具结果展示与端到端验收，不新增 adapter，不修改底层工具生成器。

统一任务卡片结构：
```json
{
  "kind": "task_card",
  "taskType": "ppt | word | excel | image | file-analysis | teaching-diagram | knowledge-graph",
  "status": "queued | running | completed | failed",
  "title": "...",
  "description": "...",
  "taskId": "...",
  "downloadUrl": "...",
  "openUrl": "...",
  "retryable": true
}
```

兼容策略：
- 保留旧的 `pendingFileGeneration`、`pendingAgentTask`、`imageGeneration`、attachments、asyncTask metadata。
- 新增 `taskCard` 作为前端统一展示层，旧字段继续用于轮询、下载和结果兼容。
- `final` / JSON fallback / conversation detail GET / async task polling 都透传 `taskCard`。
- 本地 pending 文件和图片任务也先生成 `taskCard`，服务端 final 后再用真实 taskId 和结果信息固化。

targetTool 展示方式：
- `ppt-simple` -> `taskType=ppt`，进入旧 simple PPT / async task 链路，不进入 Academic PPT。
- `word` -> `taskType=word`，复用旧 Word 生成链路。
- `excel` -> `taskType=excel`，复用旧 Excel 生成链路，生成附件后卡片提供下载入口。
- `image` -> `taskType=image`，复用旧图片任务，完成后仍展示图片预览。
- `file-analysis` -> `taskType=file-analysis`，以聊天总结为主，任务卡仅在异步分析场景展示进度。
- `teaching-diagram` -> `taskType=teaching-diagram`，通过现有 smart-tools API 创建任务，卡片提供工具页入口和下载入口。
- `knowledge-graph` -> `taskType=knowledge-graph`，通过现有知识图谱 API 创建任务，卡片提供图谱页入口。

失败处理：
- 工具失败不删除 assistant 气泡。
- 卡片进入 `failed`，展示用户可读失败原因和 disabled retry 占位。
- 不展示 provider/model、内部 JSON、stack 或 agentRuntimeDecision。

验证状态：
- `npm.cmd exec -- tsc --noEmit` 通过。
- 浏览器登录态端到端验收当前受阻：新 in-app browser tab 打开 `http://localhost:3099/chat` 返回 `net::ERR_BLOCKED_BY_CLIENT`，`127.0.0.1` 被浏览器安全策略拒绝，未继续绕路。
- 需要在可用登录态浏览器中补测：`PPT怎么做？`、`帮我生成一个10页PPT，主题是AI教育`、`把这些数据导出成Excel：姓名，成绩；张三，90；李四，85`、`帮我生成一份AI教育培训方案Word文档`、`生成一张科技感教学场景图片`、`根据上传文件总结一下`、`生成教学架构图，主题是数字赋能课程改革`、`生成知识图谱，主题是人工智能发展史`、`把刚才那张图标题改成XXX`。

当前风险：
- Word/PPT async 生成完成后的附件下载 URL 依赖已有 `/api/ai/chat/tasks/[id]` 轮询返回 attachments，`taskCard.downloadUrl` 在 metadata 中只保存基础信息，前端最终下载仍以 attachments 为准。
- 教学架构图和知识图谱任务只创建入口，不轮询其内部完成状态；后续可增加专门状态轮询。

## 22. 第十阶段 Git 安全快照、回归测试与收口清理

本阶段不继续扩展新工具或 adapter，只做安全保护、回归测试、候选提交范围整理和收口记录。

### Git 安全保护

- 当前工作分支：`feature/academic-ppt-builtin-templates`。
- 暂存区：`git diff --cached --name-only` 为空，本阶段未 stage。
- GitNexus：当前会话没有暴露 GitNexus MCP 工具，`tool_search` 未发现 gitnexus 工具，因此无法执行真实 `gitnexus_impact` / `gitnexus_detect_changes`。本阶段用本地 Git 范围检查、Runtime 决策矩阵、`tsc` 和 `build` 替代验证；正式提交前如果 GitNexus 恢复，应补跑 detect changes。
- 备份分支：尝试创建 `backup/agent-runtime-v2-before-final-cleanup` 时 Git 报告 ref 路径无法创建；改用 `backup-agent-runtime-v2-before-final-cleanup` 时沙箱写入 `.git/refs` 返回 `Permission denied`，两次提权审批超时，因此未能创建备份分支。
- 本地 patch：已生成 `agent-runtime-v2-current.patch`，包含 `app/api/ai/chat`、`components/chat`、`lib/agent` 和本文档的当前差异，用作本地安全快照。该 patch 只是备份文件，不建议提交。

### Agent Runtime V2 提交候选范围

建议只从以下范围挑选提交，避免混入历史脏改：

- `app/api/ai/chat/route.ts`
- `app/api/ai/chat/conversations/[id]/route.ts`
- `app/api/ai/chat/tasks/[id]/route.ts`
- `components/chat/chat-page.tsx`
- `components/chat/chat-thread.tsx`
- `components/chat/chat-message.tsx`
- `components/chat/chat-data.ts`
- `lib/agent/runtime/**`
- `lib/agent/skills-v2/**`
- `lib/agent/async-tasks.ts`
- `lib/agent/router.ts`
- `lib/agent/models.ts`
- `lib/agent/skills/parse-document.ts`
- `docs/agent-chat-runtime-v2-implementation-plan.md`

### 不建议提交的脏改范围

当前工作区仍有较多与本阶段无关或属于历史脏改的文件，正式提交时不建议包含：

- `components/smart-tools/academic-ppt/**`
- `lib/smart-tools/academic-ppt/**`
- `app/api/smart-tools/academic-ppt/**`
- `app/api/internal/academic-ppt/**`
- `services/**`
- `data/**`
- `package.json`
- `pnpm-lock.yaml`
- `agent-runtime-v2-current.patch`
- 运行产物、`.env`、key/token 文件

### Runtime 回归矩阵

本地通过 `planAgentRuntimeTurn` 跑了第十阶段输入矩阵：

| 输入 | 结果 |
| --- | --- |
| `随便聊聊` | `intent=general_chat`，`targetTool=none`，`nextAction=answer_chat` |
| `PPT怎么做？` | `intent=general_chat`，`targetTool=none`，`nextAction=answer_chat` |
| `帮我生成一个10页PPT，主题是AI教育` | `intent=ppt_simple`，`targetTool=ppt-simple`，`nextAction=run_legacy_tool` |
| `这个Excel公式怎么写？` | `intent=general_chat`，`targetTool=none`，`nextAction=answer_chat`，不生成 xlsx |
| `把这些数据导出成Excel：姓名，成绩；张三，90；李四，85` | `intent=excel`，`targetTool=excel`，`nextAction=run_legacy_tool` |
| `帮我生成一份AI教育培训方案Word文档` | `intent=word`，`targetTool=word`，`nextAction=run_legacy_tool` |
| `生成一张科技感教学场景图片` | `intent=image`，`targetTool=image`，`nextAction=run_legacy_tool` |
| `根据上传文件总结一下`，带 `sample.txt` 文件摘要 | `intent=file_analysis`，`targetTool=file-analysis`，`nextAction=run_legacy_tool` |
| `生成教学架构图，主题是数字赋能课程改革` | `intent=teaching_diagram`，`targetTool=teaching-diagram`，`nextAction=run_legacy_tool` |
| `生成知识图谱，主题是人工智能发展史` | `intent=knowledge_graph`，`targetTool=knowledge-graph`，`nextAction=run_legacy_tool` |
| `把刚才那张图标题改成XXX`，无 activeTask | `intent=image`，`targetTool=image`，`nextAction=ask_clarification`，`missingInputs=["image_to_edit"]` |

### 流式与任务卡片回归关注点

- SSE stream 路径继续保持单 pending assistant 气泡：token 写入同一条消息，final 只固化，不二次 append。
- interrupted / failed 状态保留已有文本，用户看到可读错误，不显示 provider/model/internal JSON/stack。
- `taskCard` 作为统一展示层，兼容旧 `pendingFileGeneration`、`pendingAgentTask`、`imageGeneration` 和 attachments。
- 普通咨询类输入不展示 taskCard；明确生成/导出/创建任务时才展示 taskCard。

### 验证结果

- `npm.cmd exec -- tsc --noEmit`：通过。
- `npm.cmd run build`：通过。Prisma generate 和 Next build 成功，仅有 `package.json#prisma` 配置弃用提醒。
- 真实登录态浏览器端到端：本阶段未完成新的浏览器交互验证。前一阶段 in-app browser 曾因 `http://localhost:3099/chat` 返回 `net::ERR_BLOCKED_BY_CLIENT`、`127.0.0.1` 被安全策略拒绝而受阻；正式提交前建议在可用登录态浏览器中补测聊天 UI 的单气泡、刷新恢复和 taskCard 展示。

### 后续提交建议

建议等用户确认后，使用显式路径 stage，而不是 `git add .`。可分成 3 个小提交：

1. Runtime V2 核心：`lib/agent/runtime/**`、`lib/agent/skills-v2/**`、`lib/agent/router.ts`、`lib/agent/models.ts`、`lib/agent/skills/parse-document.ts`。
2. Chat API 与流式收口：`app/api/ai/chat/**`、`components/chat/**`、`lib/agent/async-tasks.ts`。
3. 文档：`docs/agent-chat-runtime-v2-implementation-plan.md`。

## 23. 第十二阶段真实登录态验收与当前对话记忆补强

本阶段目标是补齐安全快照后的真实登录态验收，并增强当前 conversation 内的短期记忆体验。不新增工具，不扩展 adapter，不做长期记忆。

### Git 基线

- 当前分支：`feature/academic-ppt-builtin-templates`。
- 当前 Agent Runtime V2 安全快照：`7ade063 feat(agent): add runtime v2 chat orchestration`。
- 暂存区：本阶段开始时为空。
- 工作区仍有 Academic PPT、`services/**`、教学架构图未跟踪文件、patch 文件等历史脏改；本阶段不触碰这些范围。
- GitNexus MCP 当前仍不可用，因此无法补跑 `gitnexus_impact` / `gitnexus_detect_changes`。

### 浏览器访问定位

- 初次通过 in-app browser 打开 `http://localhost:3099/chat` 仍出现过 `net::ERR_BLOCKED_BY_CLIENT`。
- 本地 HTTP 检查发现当时 `localhost:3099` 没有服务监听，`/api/auth/me` 和 `/chat` 都无法连接。
- 启动 `npm.cmd run dev -- --port 3099` 后，`/api/auth/me` 命令行无 cookie 返回 401，说明 API 鉴权正常。
- 再次通过 in-app browser 打开 `/chat` 成功，页面处于 admin 登录态，能看到聊天输入框、历史会话和用户信息。
- 当前判断：之前 blocked/client 主要是本地服务未运行叠加浏览器客户端状态；不是项目业务逻辑问题。

### 当前对话记忆补强

只增强 conversation-level memory：

- `conversation-memory.ts` 修正中文偏好识别规则：
  - 正式/学术风格；
  - 中文输出；
  - 简洁/短一点；
  - 详细/展开；
  - “不要生成，先给方案”。
- `context-pack.ts` 增加 `memoryHints`：
  - 当前引用对象，例如上一张图片、上一个 PPT、上一份文件；
  - 当前轮上传文件名；
  - 当前会话偏好；
  - 只用于当前请求上下文，不跨会话复用。
- `getActiveConversationTask` 不再只看最后一条 assistant：
  - 向前查最近 10 条 assistant；
  - 优先识别 `taskCard`；
  - 兼容 `imageGeneration`、`asyncTask`、routeReason、生成附件；
  - 如果没有任务，再找当前会话最近的用户上传附件，作为 `file-analysis` / `image` / `ppt` / `excel` 的当前引用对象。
- `skill-router` 补强：
  - “这个文件 / 刚才的文件 / 再总结短一点”能命中 file-analysis；
  - “刚才那张图 / 上一张图 / 标题改成”能命中 image；
  - “继续刚才的 PPT / 上一份 PPT / 改成正式一点”能命中 ppt-simple；
  - “不要生成，先给方案”优先走 normal chat。
- `execution-gate` 补强：
  - 没有 activeTask 时，“继续刚才的 PPT”会追问用户指哪个任务；
  - 没有 activeTask 或附件时，“这个文件再总结短一点”会追问上传/指定文件；
  - 图片修改只接受 image / teaching-diagram activeTask，不会把普通文件 activeTask 误当作图片。

### 前端 debug 记忆提示

仅在 dev 或 `debugAgent=1` 返回 trace 时显示轻量调试信息：

- intent / targetTool / nextAction；
- 当前识别任务 kind/title；
- 当前会话偏好；
- memory hints 前两条。

普通用户默认不看内部 JSON、provider/model 或思考链，只通过自然回复感知当前上下文，例如“我会基于刚才那份文件继续总结”或“我找到刚才的 PPT 任务了”。

### 流式任务气泡补丁

真实 PPT 任务验收时发现同一个任务气泡里会把本地 pending 文案和服务端 final 文案拼接成两句相近提示。已调整：

- 任务类 pending 气泡已有本地内容时，token 不再追加到正文；
- final 固化任务类消息时优先使用服务端 final 内容；
- 普通聊天流式 token 仍正常追加；
- 仍保持单 assistant 气泡，不新增第二条。

### 测试矩阵结果

本地 Runtime 矩阵：

| 输入 | 结果 |
| --- | --- |
| `随便聊聊` | `general_chat / none / answer_chat` |
| `PPT怎么做？` | `general_chat / none / answer_chat`，不生成 |
| `帮我生成一个10页PPT，主题是AI教育` | `ppt_simple / ppt-simple / run_legacy_tool` |
| `继续刚才的PPT，改成正式一点`，有 PPT activeTask | `ppt_simple / ppt-simple / run_legacy_tool` |
| `继续刚才的PPT，改成正式一点`，无 activeTask | `ppt_simple / ppt-simple / ask_clarification`，缺 `active_task` |
| `根据上传文件总结一下`，有 `sample.txt` | `file_analysis / file-analysis / run_legacy_tool` |
| `这个文件再总结短一点`，有 file activeTask | `file_analysis / file-analysis / run_legacy_tool` |
| `这个文件再总结短一点`，无 activeTask | `file_analysis / file-analysis / ask_clarification`，缺 `file` |
| `生成一张科技感教学场景图片` | `image / image / run_legacy_tool` |
| `把刚才那张图标题改成XXX`，有 image activeTask | `image / image / run_legacy_tool` |
| `把刚才那张图标题改成XXX`，无 activeTask | `image / image / ask_clarification`，缺 `image_to_edit` |
| `把这些数据导出成Excel：姓名，成绩；张三，90；李四，85` | `excel / excel / run_legacy_tool` |
| `这个Excel公式怎么写？` | `general_chat / none / answer_chat`，不生成 xlsx |
| `不要生成，先给方案，主题是AI教育PPT` | `general_chat / none / answer_chat` |

真实登录态 UI 验收：

- `/chat` 成功打开 admin 登录态页面。
- `PPT怎么做？`：只聊天，没有 taskCard，状态最终收起，没有重复 assistant 气泡。
- `帮我生成一个10页PPT，主题是AI教育`：进入 simple PPT 任务卡片，显示 PPT 文件、生成状态和打开/下载入口，没有进入 Academic PPT。
- `继续刚才的PPT，改成正式一点`：识别当前 PPT 任务，进入 PPT 相关任务/生成状态，没有出现找不到任务的追问。
- 文件上传类 UI 未强行绕系统文件选择器；本阶段通过 Runtime 矩阵验证“这个文件再总结短一点”的 activeTask 判断。

### 验证

- `npm.cmd exec -- tsc --noEmit`：通过。
- 前端与 API 均有修改，最终收口需继续运行 `npm.cmd run build`。

### 未解决问题

- in-app browser 偶发 `net::ERR_BLOCKED_BY_CLIENT` 仍可能与客户端扩展/内置策略有关；当 dev server 正常运行后本阶段可打开。
- 文件上传真实 UI 选择器未自动化覆盖，建议后续人工补测一个小 txt/pdf。
- 本阶段不提交，等待用户确认是否再做安全提交。

## 24. 第十四阶段当前对话记忆边界

本阶段只收紧和说明 conversation-level memory，不做长期记忆。

### 明确边界

- 记忆只绑定当前 `conversationId`。
- 新开对话后，Runtime memory 为空。
- 不做 user profile memory。
- 不做全站长期 memory。
- 不保存敏感个人信息。
- 不做记忆管理页。
- 不做“永久记住”。
- 不跨 conversation 读取 activeTask、文件引用、临时偏好或 conversation summary。

### 当前对话内允许记住

Runtime V2 只从当前 conversation 最近消息和 metadata 恢复：

- 最近对话摘要；
- 当前 activeTask；
- 最近上传文件；
- 最近生成的 PPT / Word / Excel / 图片 / 教学架构图 / 知识图谱 taskCard；
- 本对话里的临时偏好，例如“简短点”“不要生成，先给方案”。

这些信息只进入当前请求的 `contextPack` 和 assistant metadata，不写入长期用户资料。

### 新开对话必须清空

当用户新开对话或使用新的 draft conversation 时，不继承旧 conversation 的：

- activeTask；
- 文件引用；
- 临时偏好；
- 任务引用；
- conversationSummary。

实现上，`getConversationSummaryCache`、`getPendingAgentTask`、`getActiveConversationTask` 都以当前 `conversationId` 和 `userId` 为查询条件。没有当前 `conversationId` 时，会创建新 conversation，并从空 memory 开始。

### 语义优化范围

当前阶段重点支持：

- `刚才那个`：只在当前 conversation 内解析为最近任务或文件；
- `上一张图`：只在当前 conversation 内解析为最近 image / teaching-diagram；
- `继续刚才的 PPT`：当前 conversation 有 PPT task 时继续，否则追问用户指哪个；
- `把这个文件再总结短一点`：当前 conversation 有文件 activeTask 时继续，否则要求上传/指定文件；
- `用刚才的数据生成 Excel`：只可引用当前 conversation 内的数据或文件；
- `不要生成，先给我方案`：记为本对话临时偏好，当前轮走普通回答，不自动调工具。

### 防止长期记忆误用

`context-pack.ts` 的 system context 明确写入：

- only compressed context from the current conversationId；
- do not use cross-conversation memory；
- do not use user profile memory；
- do not use permanent memory；
- new conversation starts with empty memory。

这条边界是 Runtime V2 的当前设计约束，不是临时提示语。

### 验证矩阵

| 场景 | 预期 |
| --- | --- |
| 同一对话内刚生成 PPT 后说 `继续刚才的PPT，改成正式一点` | 命中当前 PPT activeTask |
| 新开对话后说 `继续刚才的PPT，改成正式一点` | 不跨会话查找，追问指哪个 PPT |
| 同一对话内上传文件后说 `这个文件再总结短一点` | 命中当前文件 activeTask |
| 新开对话后说 `这个文件再总结短一点` | 不跨会话查找，要求上传/指定文件 |
| 同一对话内生成图片后说 `上一张图标题改成XXX` | 命中当前图片 activeTask |
| 新开对话后说 `上一张图标题改成XXX` | 不跨会话查找，要求上传/指定图片 |
| 本对话说 `不要生成，先给我方案` | 当前轮 answer_chat，不调用工具 |
| 新开对话后普通生成请求 | 不继承上一对话的“不要生成”偏好 |

### 未做事项

- 不做长期记忆开关。
- 不做记忆管理页。
- 不做跨会话历史搜索。
- 不保存用户长期偏好。

## 25. 第十五阶段 当前对话记忆边界安全提交

### 阶段性质

- 第十五阶段不是新功能开发阶段。
- 第十五阶段是安全提交快照阶段。
- 目标是把第十四阶段“当前对话记忆边界”固定到 Git。
- 本阶段没有继续开发长期记忆。
- 本阶段没有新增工具。
- 本阶段没有扩展 adapter。

### Commit 信息

Commit hash:
`a10ea72dc0b0e11450d98293d34e1b69e00f2ece`

Commit message:
`fix(agent): scope memory to current conversation`

### 提交文件

- `app/api/ai/chat/route.ts`
- `lib/agent/runtime/context-pack.ts`
- `docs/agent-chat-runtime-v2-implementation-plan.md`

### 本阶段确认的记忆边界

- 记忆只绑定当前 `conversationId`。
- 新开对话后 memory 为空。
- 新开对话不继承旧 activeTask。
- 新开对话不继承旧文件引用。
- 新开对话不继承旧临时偏好。
- 新开对话不继承旧 `conversationSummary`。
- 不做 user profile memory。
- 不做长期 memory。
- 不做全站 memory。
- 不做记忆管理页。
- 不保存用户长期偏好。
- 不跨 conversation 读取任务、文件或偏好。

### 验证结果

- `npm.cmd exec -- tsc --noEmit`：通过。
- `npm.cmd run build`：通过。
- staged 为空。
- Academic PPT 历史脏改未提交。
- `services/**` 历史脏改未提交。
- `data/**` 运行产物未提交。
- `.env` / key / token 未提交。
- patch 文件未提交。
- package lock 文件未提交。

### 当前提交链

- `7ade063 feat(agent): add runtime v2 chat orchestration`
- `d26a6d5 feat(agent): improve conversation memory and active task handling`
- `a10ea72dc0b0e11450d98293d34e1b69e00f2ece fix(agent): scope memory to current conversation`

### 后续建议

下一阶段可以做：

- 自动化 Runtime 回归测试脚本；
- 当前对话 activeTask 测试矩阵固化；
- 工具 taskCard 端到端验收；
- ChatGPT 式聊天 UI 继续打磨。

但不要在第十五阶段继续写业务代码。

## 26. 第十六阶段 自动化回归测试脚本

### 阶段目标

第十六阶段只补 Agent Runtime V2 的自动化回归测试，不新增工具、不扩展 adapter、不真实调用模型、不真实调用工具、不创建真实业务文件。

测试目标是固定这些分流规则：

- 普通咨询不调用工具；
- 明确生成才调用工具；
- 缺少信息先追问；
- 当前对话内可以识别 activeTask；
- 新对话不继承旧 activeTask；
- `不要生成，先给方案` 必须只聊天；
- Excel 公式咨询不能生成 xlsx；
- simple PPT 不能误进 Academic PPT。

### 脚本路径

- `scripts/agent-runtime/check-runtime-v2.ts`

脚本直接调用 `planAgentRuntimeTurn`，覆盖 planner / skill-router / execution-gate / context-pack 的关键决策输出。

### 覆盖用例

共 16 条：

1. 普通聊天：`随便聊聊` -> `targetTool=none`，`nextAction=answer_chat`。
2. PPT 咨询：`PPT怎么做？` -> 只聊天，不进入 `ppt-simple`。
3. 明确生成简单 PPT：`帮我生成一个10页PPT，主题是AI教育` -> `ppt-simple / run_legacy_tool`。
4. 学术 PPT 模糊请求：`生成学术PPT` -> `ask_clarification`，不默认进入 Academic PPT，也不进入 simple PPT 直接生成。
5. Excel 公式咨询：`这个Excel公式怎么写？` -> 只聊天，不生成 xlsx。
6. Excel 导出：`把这些数据导出成Excel：姓名，成绩；张三，90；李四，85` -> `excel / run_legacy_tool`。
7. Word 生成：`帮我生成一份AI教育培训方案Word文档` -> `word / run_legacy_tool`。
8. 文件分析，有 file activeTask：`这个文件再总结短一点` -> `file-analysis / run_legacy_tool`。
9. 文件分析，无 file activeTask：`这个文件再总结短一点` -> `ask_clarification`，`missingInputs` 包含 `file`。
10. 图片修改，有 image activeTask：`把刚才那张图标题改成XXX` -> `image / run_legacy_tool`。
11. 图片修改，无 image activeTask：`把刚才那张图标题改成XXX` -> `ask_clarification`，`missingInputs` 包含 `image_to_edit`。
12. 当前对话 PPT activeTask：`继续刚才的PPT，改成正式一点` -> `ppt-simple / run_legacy_tool`。
13. 新对话不继承 PPT activeTask：`继续刚才的PPT，改成正式一点` -> `ask_clarification`，`missingInputs` 包含 `active_task`。
14. 不要生成，先给方案：`不要生成，先给我一个AI教育PPT方案` -> `targetTool=none`，`nextAction=answer_chat`。
15. 教学架构图：`生成教学架构图，主题是数字赋能课程改革` -> `teaching-diagram / run_legacy_tool`。
16. 知识图谱：`生成知识图谱，主题是人工智能发展史` -> `knowledge-graph / run_legacy_tool`。

### 如何运行

当前 `package.json` 已存在与本阶段无关的历史脏改，因此本阶段不修改 package script。直接运行：

```bash
npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts
```

类型检查：

```bash
npm.cmd exec -- tsc --noEmit
```

### 当前测试结果

- `npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts`：通过，16/16 PASS。
- `npm.cmd exec -- tsc --noEmit`：通过。

脚本通过时输出：

```text
Agent Runtime V2 regression passed.
```

### 本阶段修正

自动化脚本首次运行发现 `生成学术PPT` 被识别为 `ppt-simple`，虽然会追问，但 `targetTool` 不符合“不得默认进入 Academic PPT / 不得进入 simple PPT 直接生成”的规则。

已在 Runtime V2 判断层做最小修正：

- 模糊学术 PPT 请求进入 `ask_clarification`；
- `targetTool=none`；
- `missingInputs` 包含 `academic_ppt_confirmation`；
- 不调用 simple PPT adapter；
- 不调用 Academic PPT。

### 未覆盖范围

- 不覆盖真实模型调用；
- 不覆盖真实工具执行；
- 不覆盖 SSE token streaming；
- 不覆盖浏览器 UI；
- 不覆盖 taskCard 真实下载/跳转；
- 不覆盖 Academic PPT 业务内部；
- 不覆盖 `services/**`。

## 27. 第十七阶段 真实工具端到端验收

### 阶段目标

本阶段不扩展 Runtime 规则，不新增 adapter，不改工具底层生成器。目标是通过真实 `/api/ai/chat` 请求验证聊天触发工具后的端到端体验，重点观察 taskCard、下载/打开入口、失败文案和当前对话 activeTask 行为。

### 本阶段修复范围

只修改允许层：

- `app/api/ai/chat/route.ts`
- `lib/agent/runtime/tool-adapters/teaching-diagram-adapter.ts`

修复点：

- 非流式 chat route 中，旧 `getAsyncAgentTaskPlan` 只继续接管 `ppt-simple` 和 `word`，避免抢占 Excel、图片、教学架构图、知识图谱等 Tool Adapter。
- `file-analysis` 的即时总结不再展示 taskCard，避免把普通文件总结误呈现成后台任务。
- 教学架构图 adapter 调用现有 smart-tools API 时，将 `diagramType` 从无效的 `framework` 改为现有 API 支持的 `auto`。

未修改：

- Academic PPT 业务代码；
- `services/**`；
- `data/**` 运行产物；
- 教学架构图内部业务逻辑；
- Word / Excel / PPT / 图片底层生成器。

### 真实 API 验收结果

使用临时脚本在系统临时目录启动 dev server、登录 admin 测试账号，并对 `/api/ai/chat` 发起真实请求。脚本不写入仓库。

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| `PPT怎么做？` | 通过 | 只聊天，无 taskCard。当前模型服务返回“模型服务暂时不可用”，但没有误调用工具。 |
| `帮我生成一个10页PPT，主题是AI教育` | 通过 | `ppt` taskCard 正常显示，任务轮询完成后有 `.pptx` 附件和下载入口；未进入 Academic PPT。 |
| `帮我生成一份AI教育培训方案Word文档` | 通过 | `word` taskCard 正常显示，任务轮询完成后有 `.docx` 附件和下载入口。 |
| `把这些数据导出成Excel：姓名，成绩；张三，90；李四，85` | 通过 | `excel` taskCard 正常显示，生成 `.xlsx` 附件，下载入口可用。 |
| `这个Excel公式怎么写？` | 通过 | 只聊天，无 taskCard，不生成 xlsx。当前模型服务返回暂不可用文案。 |
| `生成一张科技感教学场景图片` | 通过 | `image` taskCard 正常显示，包含图片任务 ID，进入图片生成状态。 |
| 上传 txt 后 `根据这个文件总结一下` | 部分通过 | 没有生成文件，也没有误显示 taskCard；当前返回用户可读失败“文件分析失败，请确认文件格式受支持后重试。”需要后续继续排查 multipart 文件分析适配。 |
| `生成教学架构图，主题是数字赋能课程改革` | 通过 | `teaching-diagram` taskCard 正常显示，包含 smart-tools taskId、打开入口和 png 下载入口。 |
| `生成知识图谱，主题是人工智能发展史` | 通过 | `knowledge-graph` taskCard 正常显示，包含 taskId 和打开入口。 |
| `继续刚才的PPT，改成正式一点` | 未通过 | Runtime 能识别当前对话 PPT activeTask，但旧 simple PPT 生成链路无法基于“改成正式一点”直接修改/续写已有 PPT，返回用户可读失败。 |

### taskCard 和入口情况

- simple PPT：taskCard 正常，完成后 `.pptx` 下载入口正常。
- Word：taskCard 正常，完成后 `.docx` 下载入口正常。
- Excel：taskCard 正常，完成后 `.xlsx` 下载入口正常。
- 图片：taskCard 正常，显示图片任务状态；本阶段未等待图片 provider 完成预览。
- 教学架构图：taskCard 正常，打开入口和 png 下载入口已返回。
- 知识图谱：taskCard 正常，打开入口已返回。
- 文件分析：按当前产品预期不显示 taskCard；本轮发现 txt 文件分析仍返回失败文案。

### 失败项和原因

- 文件分析：真实 multipart txt 请求进入 file-analysis adapter 后返回失败，当前判断是文件分析适配/解析链路未成功消费该上传文件；本阶段未改 `lib/document-processing` 或旧解析器，建议后续专门排查。
- PPT 当前任务延续：activeTask 识别存在，但 simple PPT 旧生成器没有“基于上一个 PPT 修改风格”的真实编辑能力；建议后续做 PPT continuation adapter 或明确追问“是否基于原主题重新生成一版正式风格 PPT”。

### 验证命令

- `npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts`：通过，16/16 PASS。
- `npm.cmd exec -- tsc --noEmit`：通过。

### 后续建议

- 补一个只读/临时目录的真实 chat API E2E 脚本，避免手工复跑临时脚本。
- 单独修复文件分析 multipart 端到端链路，确认是否走 `lib/document-processing` 或旧 `parse-document`。
- 为“继续刚才的 PPT，改成正式一点”设计明确的 continuation 语义：重新生成、修改已有文件、还是追问用户选择。
- 若前端改动较多，再补一次浏览器 UI 验收，检查单气泡、taskCard 刷新恢复和入口点击。

## 28. 第十八阶段 文件分析上传链路与 PPT 延续边界

### 阶段目标

本阶段只修复第十七阶段遗留的两个问题：

- 文件分析 multipart / txt 上传后应能被聊天链路读取和总结；
- `继续刚才的PPT，改成正式一点` 不能假装直接编辑旧 PPT，需要明确 simple PPT 的能力边界。

本阶段未新增工具，未扩展 adapter，未修改 Academic PPT、`services/**`、`data/**`、教学架构图业务内部、capability-map，也未重写 Word / Excel / PPT / 图片底层生成器。

### 文件分析链路修复

修复点：

- `file-analysis-adapter` 不再把文件分析直接委托给旧 Agent 模型链路；
- adapter 内优先复用 `lib/document-processing/parser`；
- multipart 上传的 `File[]` 直接交给公共解析器处理；
- txt / md / docx / pdf / pptx 等公共解析器支持的文件会被解析为 `extractedDocuments`；
- 文件分析结果直接作为聊天文本返回；
- `getResultCard()` 固定返回 `null`，因此文件总结不显示 taskCard；
- 不生成 Word / PPT / Excel / 图片；
- 不调用 Academic PPT。

解析失败时用户可见文案统一为：

```text
文件解析失败，请确认文件格式或重新上传。
```

### 文件分析验证结果

- 上传 txt 后 `根据这个文件总结一下`：本地 adapter 解析验证通过，返回聊天文本摘要，`resultCard=null`。
- docx：使用临时内存 docx 验证公共解析入口通过，`status=parsed`。
- pdf：使用临时内存 pdf 验证公共解析入口通过，`status=parsed`；本地环境会输出 pdfjs/canvas polyfill warning，不影响文本解析结果。
- 无文件时 `根据这个文件总结一下` / `这个文件再总结短一点`：Runtime 继续进入 `ask_clarification`，`missingInputs` 包含 `file`。

本阶段补充验证命令：

```bash
npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts
npm.cmd exec -- tsc --noEmit
```

### PPT 延续边界

确认的产品边界：

- simple PPT 当前只支持“生成新版”；
- simple PPT 不支持直接编辑已有 PPT 文件；
- `继续刚才的PPT，改成正式一点` 即使识别到当前 conversation 的 PPT activeTask，也先追问确认；
- 不直接覆盖旧 PPT；
- 不假装已经修改旧 PPT；
- 不进入 Academic PPT。

追问文案：

```text
当前聊天里的简单 PPT 支持基于原主题重新生成新版，不支持直接编辑已有 PPT 文件。要我按刚才主题重新生成一个更正式版本吗？
```

只有用户明确表达 `重新生成`、`再生成`、`新版`、`重新出一版` 等语义时，才允许进入 `ppt-simple / run_legacy_tool`。

如果用户要求编辑已有 PPT 文件，当前阶段提示需要上传 PPT 文件或后续单独建设 PPT 修改能力，不在 simple PPT 旧生成器里硬做真实编辑。

### Runtime 回归更新

`scripts/agent-runtime/check-runtime-v2.ts` 从 16 个用例扩展到 17 个用例：

- `当前对话有 PPT activeTask 时先确认重新生成边界`：`ppt-simple / ask_clarification`，`missingInputs` 包含 `ppt_regeneration_confirmation`；
- `当前对话明确重新生成 PPT 新版时调用工具`：`ppt-simple / run_legacy_tool`。

当前结果：

- `npm.cmd exec -- tsx scripts/agent-runtime/check-runtime-v2.ts`：通过，17/17 PASS。
- `npm.cmd exec -- tsc --noEmit`：通过。

### 未解决问题与后续建议

- 建议后续补文件分析 fixture 自动化测试，覆盖 txt / docx / pdf multipart 真实 API 请求；
- 建议后续单独设计 PPT 修改 adapter，明确“上传 PPT 后修改”和“基于上次主题重新生成”的两条路径；
- 若需要更高质量文件总结，可在本地解析成功后接入受控模型总结，但仍必须只传摘要/节选，不传无关长历史。
