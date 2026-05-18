# B2 核心功能页高保真化实施计划

## 目标

把 `/workspace`、`/chat`、`/image`、`/video` 做成高保真、可演示、可交互的 AI 聚合平台页面。

当前阶段不接真实 AI API，只使用静态假数据和模拟 loading。

## 开发边界

```txt
必须兼容 B1 的深色 / 浅色 / 跟随系统主题。
所有新增页面和组件必须使用 CSS variables / 现有 UI 组件。
不要写死黑白颜色。
不要改登录鉴权逻辑。
不要改用户管理权限规则。
不要改 Prisma schema。
不要新增注册功能。
不要移除用户管理的 Excel / CSV 导入、多选删除、模板下载功能。
不要使用外部随机图片 URL。
图片和视频占位视觉使用 CSS 渐变、本地素材或纯 UI 卡片。
```

## 1. B2 具体任务清单

### 1.1 `/workspace` 工作台增强

```txt
- 增加数据概览卡片
  - 今日对话数
  - 今日图片生成数
  - 今日视频生成数
  - 当前用户数

- 增加快捷入口卡片
  - 智能对话
  - 图片生成
  - 视频生成
  - 用户管理

- 增加最近任务列表
- 增加模型状态卡片
- 使用静态假数据
- 页面布局更饱满
- 减少中间内容过窄问题
- 保持桌面端信息密度
- 移动端卡片纵向堆叠
```

### 1.2 `/chat` 对话页高保真化

```txt
- 左侧会话列表
- 中间聊天消息区
- 用户消息气泡
- AI 回复气泡
- 底部固定输入框
- 发送按钮
- 附件上传按钮
- 模型选择器
- 建议问题区
- 右侧参考资料 / 模型信息面板
- 使用假数据展示历史对话
- 点击建议问题后自动填入输入框
- 用户输入后点击发送，立即追加用户消息
- 模拟 800-1200ms loading 后追加一条 AI 假回复
- 移动端纵向适配
- 移动端输入框固定底部
```

### 1.3 `/image` 图片生成页高保真化

```txt
- 左侧参数面板
- Prompt 输入区
- 风格选择
- 比例选择
- 数量选择
- 模型选择
- 生成按钮
- 中间图片结果宫格
- 图片卡片 hover 操作
  - 预览
  - 下载
  - 复用提示词
  - 收藏
- 右侧历史任务列表
- 点击生成后显示 Skeleton loading
- 延迟 1000-1500ms 后生成对应数量的假结果
- 点击复用提示词，将该图片 prompt 回填到输入框
- 点击收藏切换 liked 状态
- 移动端参数面板在顶部
- 移动端结果区纵向排列
```

### 1.4 `/video` 视频生成页高保真化

```txt
- 左侧参数面板
- Prompt 输入区
- 时长选择
- 比例选择
- 镜头运动选择
- 风格选择
- 中间视频预览卡
- 播放按钮
- 状态标签
  - 排队中
  - 生成中
  - 已完成
- 右侧历史任务列表
- 点击生成后模拟状态变化
  - 先显示排队中
  - 约 800ms 后变为生成中
  - 约 1800ms 后变为已完成
- 点击播放按钮只做 UI 状态切换，不播放真实视频
- 移动端纵向堆叠
```

## 2. 新增和修改的组件清单

## 2.1 新增组件

### Workspace

```txt
components/workspace/workspace-overview.tsx
components/workspace/metric-grid.tsx
components/workspace/metric-card.tsx
components/workspace/quick-action-grid.tsx
components/workspace/recent-task-list.tsx
components/workspace/model-status-card.tsx
```

### Chat

```txt
components/chat/chat-page.tsx
components/chat/conversation-list.tsx
components/chat/chat-thread.tsx
components/chat/chat-message.tsx
components/chat/chat-composer.tsx
components/chat/suggestion-prompts.tsx
components/chat/reference-panel.tsx
components/chat/chat-model-selector.tsx
```

### Image

```txt
components/image/image-page.tsx
components/image/image-parameter-panel.tsx
components/image/image-result-grid.tsx
components/image/image-result-card.tsx
components/image/image-history-list.tsx
```

### Video

```txt
components/video/video-page.tsx
components/video/video-parameter-panel.tsx
components/video/video-preview-card.tsx
components/video/video-history-list.tsx
components/video/video-status-badge.tsx
```

### Shared / Optional

```txt
components/ai/model-select.tsx
components/ai/segmented-control.tsx
components/ai/gradient-preview.tsx
```

说明：

```txt
如果某个 shared 组件过早抽象会增加复杂度，则优先在页面组件内部实现。
只有当 chat / image / video 之间确实重复时，再抽公共组件。
```

## 2.2 修改页面

```txt
app/(dashboard)/workspace/page.tsx
app/(dashboard)/chat/page.tsx
app/(dashboard)/image/page.tsx
app/(dashboard)/video/page.tsx
```

## 2.3 复用组件

```txt
components/ui/button.tsx
components/ui/card.tsx
components/ui/input.tsx
components/ui/skeleton.tsx
components/ui/empty-state.tsx
components/ui/checkbox.tsx
```

## 3. 假数据结构

## 3.1 Workspace

```ts
type WorkspaceMetric = {
  id: string
  label: string
  value: string
  change: string
  tone: "neutral" | "positive"
}

type WorkspaceQuickAction = {
  id: string
  title: string
  description: string
  href: string
  icon: string
}

type WorkspaceTask = {
  id: string
  title: string
  type: "对话" | "图片" | "视频"
  status: "已完成" | "生成中" | "待处理"
  time: string
}

type ModelStatus = {
  id: string
  name: string
  capability: string
  status: "可用" | "繁忙"
  latency: string
}
```

## 3.2 Chat

```ts
type Conversation = {
  id: string
  title: string
  summary: string
  updatedAt: string
  model: string
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

type SuggestionPrompt = {
  id: string
  text: string
}

type ReferenceItem = {
  id: string
  title: string
  type: "文档" | "图片" | "笔记"
  meta: string
}
```

## 3.3 Image

```ts
type ImageGenerationParams = {
  prompt: string
  model: string
  style: "写实" | "产品" | "建筑" | "插画" | "电影感"
  ratio: "1:1" | "4:3" | "16:9" | "9:16"
  count: 1 | 2 | 4
}

type ImageResult = {
  id: string
  title: string
  prompt: string
  ratio: string
  gradient: string
  createdAt: string
  liked: boolean
}

type ImageHistoryTask = {
  id: string
  title: string
  status: "已完成" | "生成中"
  createdAt: string
}
```

说明：

```txt
image 不使用外部图片 URL。
图片视觉使用 CSS 渐变和 UI 纹理。
gradient 字段保存 CSS gradient class 或 inline style token。
```

## 3.4 Video

```ts
type VideoGenerationParams = {
  prompt: string
  duration: "5s" | "10s" | "15s"
  ratio: "16:9" | "9:16" | "1:1"
  motion: "固定" | "推进" | "环绕" | "平移"
  style: "写实" | "产品" | "科幻" | "建筑"
}

type VideoTaskStatus = "排队中" | "生成中" | "已完成"

type VideoTask = {
  id: string
  title: string
  prompt: string
  status: VideoTaskStatus
  duration: string
  ratio: string
  createdAt: string
}
```

说明：

```txt
video 不播放真实视频。
视频预览使用 CSS 渐变画面、播放按钮、状态标签和时间信息模拟。
```

## 4. 页面交互流程

## 4.1 Workspace

```txt
1. 页面加载后展示静态概览数据。
2. 数据卡片展示今日对话、图片、视频、当前用户数。
3. 快捷入口点击跳转到对应页面。
4. 最近任务展示不同类型任务和状态。
5. 模型状态卡展示可用 / 繁忙和延迟信息。
6. 所有卡片使用 CSS variables，兼容深色和浅色模式。
```

## 4.2 Chat

```txt
1. 页面加载展示默认会话列表和当前会话消息。
2. 点击左侧会话切换聊天内容。
3. 点击建议问题，将建议文本填入输入框。
4. 用户输入内容后点击发送。
5. 立即追加一条用户消息。
6. 输入区显示发送中状态。
7. 延迟 800-1200ms 后追加 AI 假回复。
8. 清空输入框。
9. 右侧参考资料面板展示模型信息和上下文资料。
10. 移动端隐藏或下移侧栏，输入框固定底部。
```

## 4.3 Image

```txt
1. 页面加载展示默认 prompt、参数和假图片结果。
2. 用户修改 prompt / 风格 / 比例 / 数量 / 模型。
3. 点击生成。
4. 结果区显示 Skeleton loading。
5. 延迟 1000-1500ms。
6. 根据数量生成 1 / 2 / 4 张假结果。
7. 历史任务新增一条记录。
8. hover 图片卡片显示预览、下载、复用提示词、收藏。
9. 点击复用提示词，将该图片 prompt 回填到输入区。
10. 点击收藏切换 liked 状态。
```

## 4.4 Video

```txt
1. 页面加载展示默认 prompt、参数、预览卡和历史任务。
2. 用户修改 prompt / 时长 / 比例 / 镜头运动 / 风格。
3. 点击生成。
4. 当前任务状态变为排队中。
5. 约 800ms 后状态变为生成中。
6. 约 1800ms 后状态变为已完成。
7. 历史任务新增或更新该任务。
8. 点击播放按钮只切换 UI 播放状态，不播放真实视频。
```

## 5. 开发顺序

```txt
1. 增强 /workspace
   - 建立 workspace 组件
   - 替换原 workspace 页面
   - 使用静态数据
   - 检查深浅色显示

2. 开发 /chat
   - 建立 chat 组件
   - 会话列表
   - 消息区
   - 输入区
   - 建议问题
   - 模拟发送和 AI 回复
   - 移动端输入区适配

3. 开发 /image
   - 建立 image 组件
   - 参数面板
   - 结果宫格
   - loading skeleton
   - hover 操作
   - 历史任务

4. 开发 /video
   - 建立 video 组件
   - 参数面板
   - 预览卡
   - 状态模拟
   - 历史任务

5. 主题检查
   - 深色模式
   - 浅色模式
   - 跟随系统
   - 不出现硬编码黑白导致的不可读文本

6. 移动端检查
   - /workspace 卡片纵向排列
   - /chat 输入区固定底部
   - /image 参数面板在顶部，结果纵向排列
   - /video 纵向堆叠
   - 页面不横向溢出

7. 回归确认
   - 登录逻辑不变
   - 用户管理权限不变
   - Excel / CSV 批量导入仍保留
   - 多选删除仍保留
   - 模板下载仍保留
   - Prisma schema 不变
```

## 6. 验收标准

```txt
/workspace 看起来像完整控制台首页，而不是占位页。
/chat 可以完成建议问题填入、发送、模拟 AI 回复。
/image 可以完成参数选择、生成 loading、假图结果、收藏、复用 prompt。
/video 可以完成参数选择、生成状态变化、播放按钮 UI 切换。
深色 / 浅色模式下文字、边框、卡片、按钮都清晰。
移动端没有横向滚动和明显遮挡。
不接真实 AI API。
不使用外部图片 URL。
不破坏已有登录、权限、用户管理功能。
```
