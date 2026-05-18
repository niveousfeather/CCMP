# Chat Agent MVP 技术规划

## 1. Agent 目标

- 将 `/chat` 从普通模型对话升级为智能体对话。
- Agent 主模型默认使用 `gpt-5.4`，负责意图判断、任务规划和最终回答。
- Kimi 作为文档解析 / 文件理解工具，不直接暴露为用户必须理解的底层模型。
- Agent 模式下前端默认不展示底层模型来源，只展示“Agent 正在分析 / 解析文件 / 生成结果”等任务状态。
- 保留手动模型模式作为备用，方便排查和回退。
- 预留后续 Word 文档生成 Skill。
- 预留后续安全审核 Guard 前置审核。

## 2. 第一阶段 Agent MVP 范围

- 普通文本对话默认走 `gpt-5.4`。
- 用户上传文档类文件时，调用 Kimi 文件接口解析文件。
- Kimi 输出 `extractedMarkdown`，只作为上下文，不直接作为最终回答。
- `gpt-5.4` 基于用户问题和 `extractedMarkdown` 生成最终回答。
- 用户要求生成 Word 文档时，Agent 调用 `create-document` Skill。
- 生成的 `.docx` 上传 OSS。
- 聊天界面返回可下载的文件卡片。
- 文件卡片元信息保存到 `ChatAttachment`，刷新后仍能恢复下载入口。
- 保留当前手动模型模式，作为 Agent MVP 的备用路径。

## 3. 推荐文件结构

仅规划，当前阶段不创建 Agent 代码：

```txt
lib/agent/router.ts
lib/agent/types.ts
lib/agent/skills/create-document.ts
lib/agent/skills/parse-document.ts
lib/safety/index.ts
lib/safety/qwen-guard-client.ts
```

建议职责：

- `lib/agent/router.ts`：根据用户输入、附件、模式选择执行路径。
- `lib/agent/types.ts`：定义 AgentRequest、AgentStep、AgentResult、SkillResult。
- `lib/agent/skills/parse-document.ts`：封装 Kimi 文件上传、抽取、Markdown 归一化。
- `lib/agent/skills/create-document.ts`：接收 Markdown，生成 `.docx` 并上传 OSS。
- `lib/safety/index.ts`：统一安全审核入口。
- `lib/safety/qwen-guard-client.ts`：封装 Qwen3Guard 本机服务调用。

## 4. API 改造规划

### POST /api/ai/chat

未来保留当前接口，但增加 `mode`：

- `mode: "manual"`：沿用当前手动模型模式。
- `mode: "agent"`：走 Agent Router。

Agent 模式流程：

1. 校验登录用户。
2. 创建或读取 `ChatConversation`。
3. 写入用户 `ChatMessage`。
4. 如有附件，写入 `ChatAttachment` 元信息。
5. Agent Router 判断是否需要解析文件、生成文档或普通回答。
6. 写入 assistant `ChatMessage`。
7. 如生成文件，写入下载型 `ChatAttachment`。
8. 返回统一消息结构给前端。

### ChatConversation

- 继续保存会话标题、用户、默认模型、更新时间。
- 后续可在 `metadata` 字段中保存 Agent 模式标记，但 MVP 可暂不加表字段。

### ChatMessage

- 普通文本消息继续存 SQLite。
- Agent 步骤日志不建议全部暴露给用户。
- 如需要调试，可把简短步骤摘要写入 `metadata`，不保存敏感全文。

### ChatAttachment

- 上传文件：保存 `fileName`、`mimeType`、`sizeBytes`、`objectKey`、`url`、`providerFileId`。
- Kimi 解析：可保存 `providerFileId` 和简短解析摘要。
- Word 生成文件：保存 `.docx` 的 `objectKey`、`url`、`mimeType`。

### 生成文件如何持久化

- 后端生成 `.docx` Buffer。
- 调用 storage adapter 上传 OSS。
- 将 OSS objectKey / url 保存到 `ChatAttachment`。
- `ChatMessage` 中返回一个附件卡片。

### 下载卡片如何恢复

- 打开历史会话时，通过 `GET /api/ai/chat/conversations/[id]` 返回消息附件。
- 如果附件有 `objectKey`，服务端调用 storage adapter 返回 signed/public URL。
- 前端按 `mimeType` 渲染为下载卡片。

## 5. 模型容错规划

- `gpt-5.4` 掉线：
  - 普通对话可降级到 Kimi。
  - 前端提示“主模型暂不可用，已切换备用模型回答”。
  - Agent 模式下不展示底层 provider，只展示友好状态。

- Kimi 掉线：
  - 无文件任务：继续使用 `gpt-5.4`。
  - 文件解析任务：友好失败，提示“文件解析服务暂不可用，请稍后重试或移除文件继续对话”。

- 文件强依赖任务：
  - 如果文件解析失败，不让 `gpt-5.4` 假装读过文件。
  - 返回明确提示，并保留用户消息和附件，方便重试。

- 两个模型都失败：
  - 返回统一错误：“模型服务暂不可用，请稍后重试。”
  - 不暴露上游原始错误、API Key、内部堆栈。

## 6. 安全审核规划

未来接入 Qwen3Guard：

- 只审核用户输入 prompt。
- 不审核上传文件全文，避免大文本拖慢主站和增加隐私风险。
- Guard 服务作为独立本机服务运行。
- NexusAI 通过 `SAFETY_GUARD_URL` 调用。
- 建议超时：800ms - 1500ms。
- 可配置策略：
  - `fail open`：Guard 超时时继续执行，只记录简短日志。
  - `fail closed`：高敏场景下 Guard 不可用则拒绝请求。
- MVP 建议默认 fail open，避免影响主站稳定。

## 7. Word Skill 规划

未来 Word 生成链路：

1. Agent 判断用户需要生成 Word。
2. `gpt-5.4` 生成结构化 Markdown。
3. 后端 `create-document` Skill 使用 `docx` 库生成 `.docx`。
4. `.docx` 上传 OSS。
5. 保存到 `ChatAttachment` 或后续新增 `GeneratedFile`。
6. 聊天界面显示文件下载卡片。
7. 刷新会话后，通过附件元信息恢复下载入口。

MVP 阶段优先复用 `ChatAttachment`，后续如果文件类型变多，再考虑独立 `GeneratedFile` 表。

## 8. 分阶段路线

### 阶段 1：Agent Router + 自动模型选择

- 增加 Agent Router。
- 支持普通文本走 `gpt-5.4`。
- 保留手动模型模式。
- 前端增加 Agent / 手动模式开关。

### 阶段 2：文档解析 + 基于文件回答

- 接入 `parse-document` Skill。
- 上传文档时使用 Kimi 解析为 `extractedMarkdown`。
- `gpt-5.4` 基于解析内容生成最终回答。
- 严格提示“未解析成功则不声称已读取文件”。

### 阶段 3：Word 生成 Skill + OSS 下载卡片

- 接入 `create-document` Skill。
- 生成 `.docx` 并上传 OSS。
- 保存附件元信息。
- 聊天界面展示下载卡片，刷新后可恢复。

### 后续增强

- PPT Skill。
- Excel Skill。
- 图片理解。
- 视频理解。
- Qwen3Guard 全面接入。
- Agent 步骤可视化和审计日志。
