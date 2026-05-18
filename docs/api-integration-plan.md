# NexusAI 真实 API 接入方案

> 当前文档只整理接入方案，不开始实现代码。  
> 开发边界：不改登录、鉴权、用户管理权限、主题切换、Prisma schema，不新增注册，不接视频 API，不新增数据库表，不保存真实历史记录。

## 1. Chat API 接入方案

### 模型与 Provider

| 前端模型 | Provider | 服务端目标地址 | 认证 |
| --- | --- | --- | --- |
| `gpt-5.4` | `xheai` | `${XHEAI_BASE_URL}/v1/chat/completions` | `Authorization: Bearer ${XHEAI_API_KEY}` |
| `kimi-k2.5` | `moonshot` | `${MOONSHOT_BASE_URL}/chat/completions` | `Authorization: Bearer ${MOONSHOT_API_KEY}` |

默认模型：`gpt-5.4`。

### 本站 API 路由

`POST /api/ai/chat`

前端请求：

```json
{
  "model": "gpt-5.4",
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}
```

服务端处理：

1. 校验用户登录态。
2. 校验 `model` 是否在允许列表：`gpt-5.4`、`kimi-k2.5`。
3. 根据模型选择 Provider。
4. 从服务端环境变量读取对应 API Key。
5. 使用 OpenAI Chat Completions 兼容格式请求第三方接口。
6. 第一版使用非流式输出，不传 `stream: true`。
7. 统一转换第三方返回。

统一返回给前端：

```json
{
  "content": "...",
  "model": "gpt-5.4",
  "provider": "xheai"
}
```

### Chat 参数建议

第一版建议只支持必要参数：

```json
{
  "model": "gpt-5.4",
  "messages": [],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

后续可再扩展：

- system prompt
- temperature UI 控制
- max tokens UI 控制
- stream 流式输出
- tool calling

## 2. Image API 接入方案

### 模型与端点

模型：`gpt-image-2-all`

| 场景 | 条件 | 第三方端点 | 请求格式 |
| --- | --- | --- | --- |
| 文生图 | 未上传参考图 | `${XHEAI_BASE_URL}/v1/images/generations` | JSON |
| 图生图 | 已上传参考图 | `${XHEAI_BASE_URL}/v1/images/edits` | `multipart/form-data` |

### 本站 API 路由

`POST /api/ai/image`

建议前端统一使用 `FormData` 提交，方便同时兼容文生图和图生图：

```txt
prompt: string
style: string
aspect_ratio: "16:9" | "1:1" | "4:3" | "9:16"
count: number
model: "gpt-image-2-all"
image?: File
```

服务端判断：

- `image` 不存在：调用文生图 JSON 接口。
- `image` 存在：调用图生图 multipart 接口。

### 文生图请求转换

第三方请求体：

```json
{
  "model": "gpt-image-2-all",
  "prompt": "用户 prompt + 风格描述",
  "aspect_ratio": "16:9",
  "image_size": "1k",
  "response_format": "url"
}
```

说明：

- `aspect_ratio` 直接使用前端比例字段。
- `image_size` 第一版固定为 `"1k"`。
- `style` 暂时拼接进 prompt，不作为独立 API 参数。
- `response_format` 建议优先 `"url"`，同时兼容返回 `b64_json`。

### 图生图请求转换

第三方 multipart 字段：

```txt
model = gpt-image-2-all
prompt = 用户 prompt + 风格描述
image = 上传文件
aspect_ratio = 16:9
image_size = 1k
```

### 数量字段处理

当前资料中示例没有明确展示批量数量参数。第一版建议：

1. 先只生成 1 张，保证链路稳定。
2. 前端保留数量 UI，但真实请求阶段提示“当前真实接口模式先生成 1 张”。
3. 如果后续确认接口支持 `n` 或其他数量字段，再映射到 API 参数。
4. 若必须按数量生成，可在服务端循环调用，但需要加入并发限制和失败合并策略。

### 图片统一返回

服务端优先读取 `data[0].url`，没有则读取 `data[0].b64_json`。

返回前端：

```json
{
  "images": [
    {
      "url": "...",
      "b64_json": "...",
      "revised_prompt": "..."
    }
  ]
}
```

## 3. 管理员余额查询接入方案

### 第三方接口

`GET ${XHEAI_BASE_URL}/api/open/balance`

认证：

```txt
Authorization: Bearer ${XHEAI_API_KEY}
```

第三方返回字段：

```json
{
  "data": {
    "remain_amount": 1084.9972,
    "remain_quota": 542498600
  },
  "success": true
}
```

### 本站 API 路由

`GET /api/admin/balance`

服务端处理：

1. 校验登录态。
2. 再次校验当前用户 `role === "ADMIN"`。
3. 普通用户返回 `403`。
4. 检查 `XHEAI_API_KEY` 是否配置。
5. 请求 XHEAI 余额接口。
6. 统一返回字段。

返回前端：

```json
{
  "remain_amount": 1084.9972,
  "remain_quota": 542498600
}
```

管理员页面 UI：

- 在 `/users` 或管理员区域顶部增加“账户余额”模块。
- 仅 ADMIN 可见。
- 支持手动刷新。
- 查询失败显示友好错误，不展示第三方原始错误和 Key。

## 4. 需要新增的本站 API 路由

### `POST /api/ai/chat`

用途：统一代理对话模型。

需要能力：

- 登录态校验。
- 模型白名单。
- Provider 路由。
- 超时控制。
- 返回格式转换。
- 敏感错误隐藏。

### `POST /api/ai/image`

用途：统一代理文生图和图生图。

需要能力：

- 登录态校验。
- 解析 `FormData`。
- 是否存在 `image` 决定 generations / edits。
- 文件大小和类型校验。
- 超时控制。
- 返回格式转换。

### `GET /api/admin/balance`

用途：管理员查询 XHEAI 账户余额。

需要能力：

- 登录态校验。
- ADMIN 权限校验。
- 超时控制。
- 返回字段转换。

## 5. 环境变量

`.env.example` 需要新增：

```txt
XHEAI_API_KEY=
MOONSHOT_API_KEY=
XHEAI_BASE_URL=https://api.xheai.cc
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
```

安全规则：

- API Key 只能在服务端读取。
- 不以 `NEXT_PUBLIC_` 开头。
- 不在前端页面、Toast、日志中输出。
- 前端只请求本站 API 路由。
- 服务端错误日志只记录 provider、状态码、简短错误类型，不记录 Authorization。

## 6. 前端页面如何调用

### `/chat`

发送消息时从当前模型选择器读取模型：

```ts
fetch("/api/ai/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages
  })
});
```

前端收到：

```json
{
  "content": "...",
  "model": "gpt-5.4",
  "provider": "xheai"
}
```

然后追加为 AI 回复气泡。

### `/image`

生成图片时统一提交 `FormData`：

```ts
const formData = new FormData();
formData.append("prompt", prompt);
formData.append("style", style);
formData.append("aspect_ratio", ratio);
formData.append("count", String(count));
if (file) formData.append("image", file);
```

请求：

```ts
fetch("/api/ai/image", {
  method: "POST",
  body: formData
});
```

前端收到：

```json
{
  "images": [
    {
      "url": "...",
      "b64_json": "...",
      "revised_prompt": "..."
    }
  ]
}
```

展示策略：

- 有 `url`：直接作为图片地址。
- 无 `url` 但有 `b64_json`：拼成 `data:image/png;base64,...` 展示。
- 无有效图片：显示生成失败 Toast。

### `/users` 或管理员模块

仅 ADMIN 显示余额卡片：

```ts
fetch("/api/admin/balance");
```

前端收到：

```json
{
  "remain_amount": 1084.9972,
  "remain_quota": 542498600
}
```

## 7. 返回数据统一格式化

### Chat

第三方 OpenAI 兼容返回：

```json
{
  "choices": [
    {
      "message": {
        "content": "..."
      }
    }
  ]
}
```

统一转换：

```json
{
  "content": "...",
  "model": "...",
  "provider": "xheai"
}
```

### Image

第三方返回：

```json
{
  "data": [
    {
      "url": "",
      "b64_json": "...",
      "revised_prompt": ""
    }
  ]
}
```

统一转换：

```json
{
  "images": [
    {
      "url": "",
      "b64_json": "...",
      "revised_prompt": ""
    }
  ]
}
```

### Balance

第三方返回：

```json
{
  "data": {
    "remain_amount": 1084.9972,
    "remain_quota": 542498600
  },
  "success": true
}
```

统一转换：

```json
{
  "remain_amount": 1084.9972,
  "remain_quota": 542498600
}
```

## 8. 错误处理和超时策略

| 场景 | 服务端处理 | 前端提示 |
| --- | --- | --- |
| API Key 未配置 | 返回 `500`，错误码 `MISSING_API_KEY` | “服务暂未配置，请联系管理员。” |
| 用户未登录 | 返回 `401` | 跳转登录或提示重新登录 |
| 普通用户访问余额 | 返回 `403` | “无权访问该资源。” |
| 模型不在白名单 | 返回 `400` | “当前模型不可用。” |
| 第三方请求失败 | 返回统一错误，不透传完整原文 | “模型服务暂时不可用，请稍后重试。” |
| 第三方超时 | 使用 `AbortController` 中断 | “请求超时，请稍后重试。” |
| 返回格式异常 | 记录简短服务端日志，返回 `BAD_PROVIDER_RESPONSE` | “服务返回异常，请稍后重试。” |
| 图片无 url / b64_json | 返回 `BAD_PROVIDER_RESPONSE` | “未收到有效图片结果。” |
| 数量参数不支持 | 第一版降级为 1 张 | “当前真实接口模式先生成 1 张。” |
| 余额查询失败 | 返回统一错误 | 余额卡片显示失败状态和刷新按钮 |

建议超时：

- Chat：60 秒。
- Image：120 秒。
- Balance：15 秒。

服务端日志建议：

```txt
[ai:chat] provider=xheai status=502 code=PROVIDER_ERROR
```

不要记录：

- API Key
- Authorization Header
- 用户完整 prompt（如需排查可后续做脱敏/采样）

## 9. 当前缺失信息与风险点

1. `gpt-image-2-all` 是否支持 `response_format`、`image_size: "1k"`、`aspect_ratio` 的完整取值，需要实际联调确认。
2. 图片接口是否支持批量数量参数未在当前示例中明确。第一版建议真实调用只生成 1 张。
3. 图生图是否支持多图编辑、mask、透明图等高级参数，本阶段不接。
4. `kimi-k2.5` 的模型名是否已在当前 Moonshot 账号可用，需要用真实 Key 联调确认。
5. XHEAI Chat 文档页面标注“开发中”，虽然示例为 OpenAI 兼容格式，但仍需用真实 Key 验证实际返回。
6. 当前不做对象存储，图片 URL 如果有过期时间，刷新后可能失效。第一版只展示即时结果，不保存真实历史。
7. 当前不新增数据库表，真实生成记录不会持久化。
8. 视频 API 暂不接入，`/video` 继续保持静态模拟。
9. 需要确认生产环境部署平台是否支持服务端 `fetch` 超时、multipart 转发和较大图片文件上传。

## 10. 参考资料

- XHEAI 文生图：`https://xheai.apifox.cn/404573050e0`
- XHEAI 图生图：`https://xheai.apifox.cn/405216933e0`
- XHEAI Chat Completions：`https://xheai.apifox.cn/431477313e0`
- XHEAI 余额查询：`https://xheai.apifox.cn/405269594e0`
- Kimi API 概述：`https://platform.kimi.com/docs/api/overview`
