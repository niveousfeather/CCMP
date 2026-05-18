# 第二阶段 B 与主题切换开发方案

## 一、第二阶段 B 任务清单

第二阶段 B 的目标是把 `/chat`、`/image`、`/video` 从占位页面升级为高保真、可演示、可交互的 AI 产品页面，同时增强 `/workspace`，并新增全站主题切换能力。

本阶段不接入真实 AI API，只使用静态假数据和模拟 loading。

### 1. `/chat` 对话页高保真化

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
- 用户输入后点击发送，模拟一条 AI 回复
- 移动端纵向适配，输入框固定底部
```

### 2. `/image` 图片生成页高保真化

```txt
- 左侧参数面板
- Prompt 输入区
- 风格选择
- 比例选择
- 数量选择
- 模型选择
- 生成按钮
- 中间图片结果宫格
- 图片卡片 hover 操作：预览、下载、复用提示词、收藏
- 右侧历史任务列表
- 点击生成后显示 loading 状态，再用假数据生成结果
- 移动端参数面板在顶部，结果区纵向排列
```

### 3. `/video` 视频生成页高保真化

```txt
- 左侧参数面板
- Prompt 输入区
- 时长选择
- 比例选择
- 镜头运动选择
- 风格选择
- 中间视频预览卡
- 播放按钮
- 状态标签：排队中、生成中、已完成
- 右侧历史任务列表
- 点击生成后模拟任务状态变化
- 移动端纵向堆叠
```

### 4. `/workspace` 工作台增强

```txt
- 数据概览卡片
- 今日对话数
- 今日图片生成数
- 今日视频生成数
- 当前用户数
- 最近任务
- 快捷入口
- 模型状态卡片
- 所有数据先用静态假数据
```

### 5. 全站主题切换

```txt
- 默认深色模式
- 支持深色模式 / 浅色模式 / 跟随系统
- 用户选择保存到 localStorage
- 刷新页面后保持上次选择
- 登录页、工作台、用户管理、设置、对话、图片、视频全部生效
- 顶部导航右侧增加主题切换按钮
- 设置页增加“外观设置”模块
- 切换时有轻微过渡动画
- 不使用 CSS invert
- 浅色模式使用独立颜色变量
```

## 二、核心页面组件拆分

### `/chat`

```txt
components/chat/
  chat-page.tsx
  conversation-list.tsx
  chat-thread.tsx
  chat-message.tsx
  chat-composer.tsx
  suggestion-prompts.tsx
  attachment-button.tsx
  chat-model-selector.tsx
  reference-panel.tsx
```

组件职责：

```txt
ChatPage
- 页面总布局
- 管理当前会话、输入内容、发送 loading

ConversationList
- 左侧历史会话
- 展示会话标题、时间、摘要

ChatThread
- 中间消息列表
- 负责滚动区域和空状态

ChatMessage
- 用户 / AI 消息气泡
- AI 回复可展示步骤卡片或引用提示

ChatComposer
- 底部输入框
- 附件按钮
- 发送按钮

SuggestionPrompts
- 建议问题
- 点击后填入输入框

ReferencePanel
- 右侧模型信息、参考资料、当前上下文
```

### `/image`

```txt
components/image/
  image-page.tsx
  image-parameter-panel.tsx
  image-prompt-box.tsx
  image-result-grid.tsx
  image-result-card.tsx
  image-history-list.tsx
```

组件职责：

```txt
ImagePage
- 页面总布局
- 管理 prompt、参数、生成 loading、结果数据

ImageParameterPanel
- 模型、风格、比例、数量选择

ImagePromptBox
- Prompt 输入区

ImageResultGrid
- 中间结果宫格
- loading 时显示 Skeleton

ImageResultCard
- 图片卡片
- hover 操作按钮：预览、下载、复用、收藏

ImageHistoryList
- 右侧历史任务
```

### `/video`

```txt
components/video/
  video-page.tsx
  video-parameter-panel.tsx
  video-preview-card.tsx
  video-history-list.tsx
  video-status-badge.tsx
```

组件职责：

```txt
VideoPage
- 页面总布局
- 管理 prompt、参数、任务状态

VideoParameterPanel
- 时长、比例、镜头运动、风格选择

VideoPreviewCard
- 视频预览区域
- 播放按钮
- 状态显示

VideoHistoryList
- 历史视频任务

VideoStatusBadge
- 排队中 / 生成中 / 已完成
```

### `/workspace`

```txt
components/workspace/
  workspace-overview.tsx
  metric-grid.tsx
  metric-card.tsx
  quick-action-grid.tsx
  recent-task-list.tsx
  model-status-card.tsx
```

## 三、假数据结构设计

### 对话页假数据

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
  type: "document" | "image" | "note"
  meta: string
}
```

### 图片生成页假数据

```ts
type ImageGenerationParams = {
  prompt: string
  model: string
  style: string
  ratio: "1:1" | "4:3" | "16:9" | "9:16"
  count: 1 | 2 | 4
}

type ImageResult = {
  id: string
  title: string
  prompt: string
  ratio: string
  imageUrl?: string
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

### 视频生成页假数据

```ts
type VideoGenerationParams = {
  prompt: string
  duration: "5s" | "10s" | "15s"
  ratio: "16:9" | "9:16" | "1:1"
  motion: "固定" | "推进" | "环绕" | "平移"
  style: "写实" | "产品" | "科幻" | "建筑"
}

type VideoTask = {
  id: string
  title: string
  prompt: string
  status: "排队中" | "生成中" | "已完成"
  duration: string
  ratio: string
  createdAt: string
}
```

### 工作台假数据

```ts
type WorkspaceMetric = {
  id: string
  label: string
  value: string
  change: string
}

type WorkspaceTask = {
  id: string
  title: string
  type: "对话" | "图片" | "视频"
  time: string
  status: string
}

type ModelStatus = {
  id: string
  name: string
  status: "可用" | "繁忙"
  latency: string
}
```

## 四、交互流程说明

### `/chat`

```txt
1. 页面加载展示假会话和默认聊天记录
2. 点击左侧会话切换当前对话
3. 点击建议问题，将文本填入底部输入框
4. 用户输入内容后点击发送
5. 页面立即追加用户消息
6. 发送按钮进入 loading
7. 延迟 800-1200ms 后追加一条 AI 假回复
8. 清空输入框
```

### `/image`

```txt
1. 页面加载展示默认参数和假图片结果
2. 用户修改 prompt / 风格 / 比例 / 数量 / 模型
3. 点击生成
4. 结果区显示 Skeleton loading
5. 延迟 1000-1500ms 后生成对应数量的假结果
6. 历史任务新增一条记录
7. hover 图片卡片显示操作按钮
8. 点击复用提示词，将该图片 prompt 回填到输入框
9. 点击收藏切换 liked 状态
```

### `/video`

```txt
1. 页面加载展示默认视频预览和历史任务
2. 用户修改 prompt / 时长 / 比例 / 镜头运动 / 风格
3. 点击生成
4. 状态变为“排队中”
5. 约 800ms 后变为“生成中”
6. 约 1800ms 后变为“已完成”
7. 右侧历史任务新增一条记录
8. 点击播放按钮仅做 UI 状态切换，不播放真实视频
```

### `/workspace`

```txt
1. 页面加载展示静态数据概览
2. 快捷入口跳转到 /chat、/image、/video
3. 最近任务展示不同类型任务
4. 模型状态卡展示模型可用情况
```

### 主题切换

```txt
1. 首次访问默认深色模式
2. 读取 localStorage 中的 theme-preference
3. 若为 system，则监听 prefers-color-scheme
4. 切换主题时更新 document.documentElement.dataset.theme
5. 同步保存到 localStorage
6. 页面颜色通过 CSS variables 响应变化
```

## 五、主题切换实现方案

### 1. 技术方案

```txt
- 使用 CSS variables 抽象颜色
- 使用 data-theme="dark" / data-theme="light" 标记当前主题
- 使用 ThemeProvider 在客户端初始化主题
- 使用 localStorage 保存用户选择
- 使用 matchMedia('(prefers-color-scheme: dark)') 支持跟随系统
- 不使用 CSS invert
- 不依赖真实后端用户偏好
```

### 2. 需要修改的文件

```txt
app/layout.tsx
app/globals.css
components/layout/app-shell.tsx
components/settings/settings-form.tsx

新增：
components/theme/theme-provider.tsx
components/theme/theme-toggle.tsx
components/theme/theme-settings.tsx

可能需要调整：
components/ui/button.tsx
components/ui/card.tsx
components/ui/input.tsx
components/ui/dialog.tsx
components/ui/toast.tsx
components/ui/checkbox.tsx
components/ui/file-upload.tsx
components/ui/empty-state.tsx
components/ui/skeleton.tsx
components/ui/pagination.tsx
components/ui/confirm-dialog.tsx

页面中需要替换硬编码颜色：
app/page.tsx
app/(auth)/login/page.tsx
app/(dashboard)/workspace/page.tsx
app/(dashboard)/chat/page.tsx
app/(dashboard)/image/page.tsx
app/(dashboard)/video/page.tsx
app/(dashboard)/users/page.tsx
app/(dashboard)/settings/page.tsx
components/users/users-client.tsx
```

### 3. 颜色变量设计

#### 深色模式

```css
:root,
[data-theme="dark"] {
  --color-bg: #080808;
  --color-bg-elevated: #0b0b0c;
  --color-panel: #111113;
  --color-panel-2: #161618;
  --color-border: rgba(255, 255, 255, 0.10);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  --color-text: #ffffff;
  --color-text-muted: rgba(255, 255, 255, 0.64);
  --color-text-faint: rgba(255, 255, 255, 0.38);
  --color-primary: #ffffff;
  --color-primary-text: #090909;
  --color-danger: #fecaca;
  --color-danger-bg: rgba(248, 113, 113, 0.10);
}
```

#### 浅色模式

```css
[data-theme="light"] {
  --color-bg: #f7f7f8;
  --color-bg-elevated: #ffffff;
  --color-panel: #ffffff;
  --color-panel-2: #f1f1f2;
  --color-border: #e5e5e5;
  --color-border-strong: #d4d4d4;
  --color-text: #111111;
  --color-text-muted: #666666;
  --color-text-faint: #8a8a8a;
  --color-primary: #111111;
  --color-primary-text: #ffffff;
  --color-danger: #991b1b;
  --color-danger-bg: rgba(220, 38, 38, 0.08);
}
```

#### 辅助变量

```css
--color-hover: rgba(255, 255, 255, 0.06);
--color-soft: rgba(255, 255, 255, 0.04);
--shadow-soft: 0 24px 80px rgba(0, 0, 0, 0.18);
```

浅色模式下会单独覆盖：

```css
[data-theme="light"] {
  --color-hover: rgba(17, 17, 17, 0.05);
  --color-soft: rgba(17, 17, 17, 0.035);
  --shadow-soft: 0 24px 80px rgba(0, 0, 0, 0.08);
}
```

### 4. 组件设计

#### ThemeProvider

```txt
职责：
- 初始化主题
- 读取 localStorage
- 处理 system 模式
- 监听系统主题变化
- 给 html 设置 data-theme
- 提供 ThemeContext
```

类型：

```ts
type ThemeMode = "dark" | "light" | "system"

type ThemeContextValue = {
  mode: ThemeMode
  resolvedTheme: "dark" | "light"
  setMode: (mode: ThemeMode) => void
}
```

#### ThemeToggle

```txt
位置：
- 顶部导航右侧

交互：
- 点击后在 dark / light / system 间循环
- 图标使用 Moon / Sun / Monitor
- hover 显示当前模式名称
```

#### ThemeSettings

```txt
位置：
- /settings 页面新增“外观设置”模块

内容：
- 深色模式
- 浅色模式
- 跟随系统

样式：
- 使用分段按钮或三列选择卡
- 当前选中项显示清晰边框
```

### 5. 开发步骤

```txt
1. 建立 ThemeProvider
- 新增 components/theme/theme-provider.tsx
- 封装 localStorage、system、resolvedTheme
- 在 app/layout.tsx 包裹 ThemeProvider

2. 抽象 globals.css 颜色变量
- 保留深色默认风格
- 新增浅色模式变量
- 添加全局颜色过渡

3. 改造基础 UI 组件
- Button 使用变量
- Card 使用变量
- Input 使用变量
- Dialog 使用变量
- Toast 使用变量
- Checkbox / FileUpload / EmptyState / Skeleton / Pagination / ConfirmDialog 使用变量

4. 改造 AppShell
- 背景、侧边栏、顶部栏使用变量
- 顶部右侧加入 ThemeToggle

5. 改造设置页
- 新增 ThemeSettings 模块
- 保留修改密码功能

6. 改造现有页面硬编码颜色
- 登录页
- 官网首页
- 工作台
- 用户管理页
- 后续新增的 chat / image / video 页面

7. 开发 /workspace 增强
- 数据概览卡
- 最近任务
- 快捷入口
- 模型状态

8. 开发 /chat 高保真页面
- 组件拆分
- 假数据
- 建议问题填入
- 发送模拟回复

9. 开发 /image 高保真页面
- 参数面板
- 生成 loading
- 假结果宫格
- hover 操作
- 历史任务

10. 开发 /video 高保真页面
- 参数面板
- 任务状态模拟
- 视频预览卡
- 历史任务

11. 移动端适配检查
- /chat 输入框固定底部
- /image /video 参数面板纵向排列
- 表格和面板不横向溢出

12. 验证
- 主题切换刷新后保持
- system 模式跟随系统
- 登录页和控制台页面主题一致
- 用户管理功能不回退
- /chat /image /video 交互可演示
```

## 六、第二阶段 B 开发顺序

```txt
1. 先实现主题系统
2. 改造全局 UI 组件颜色变量
3. 改造 AppShell 和设置页
4. 增强 /workspace
5. 实现 /chat 高保真页面
6. 实现 /image 高保真页面
7. 实现 /video 高保真页面
8. 做移动端适配检查
9. 做静态检查和回归确认
```

说明：

```txt
第二阶段 B 不接真实 AI API。
第二阶段 B 不新增注册功能。
第二阶段 B 不改动已有鉴权和用户管理权限规则。
第二阶段 B 的 UI 需要同时兼容深色和浅色模式。
```
