# NexusAI 项目交接文档（新对话接力版）

> 更新时间：2026-05-04  
> 工作区：`E:\AI project\codex\WEByunming`  
> 用途：新开 Codex/AI 对话窗口后，先让新助手阅读本文件，再继续开发。

## 1. 项目概览

这是一个基于 Next.js 15 + React 19 + Prisma 的 AI 聚合平台，当前主要模块包括：

- 登录与用户管理
- 工作台
- Nexus Agent 对话
- 图片生成
- 视频生成
- 历史记录
- 知识图谱
- 用户角色与每日额度
- 3D 工作区（当前仅前端工作区，未正式接 API）

常用命令：

```bash
pnpm dev
pnpm build
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

类型检查常用：

```bash
cmd /c npx tsc --noEmit --pretty false
```

## 2. 重要原则

后续开发务必遵守：

- 不要随意改已经跑通的图片生成、视频生成、Agent 联网、聊天主链路。
- 不要改数据库结构，除非需求明确要求并补 migration。
- 不要把密钥暴露到前端。
- 不要全局替换模型 ID，前端展示名和后台 provider/API 标识要分开。
- 3D 工作区目前是前端预留阶段，不要误接伪 API。
- 如果修改 3D 工作区，优先只动 `components/model3d/*`。

## 3. 当前技术栈

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Prisma
- SQLite/数据库由当前 Prisma 配置决定
- lucide-react 图标
- 存储层支持本地和 OSS：`lib/storage/*`

关键配置文件：

- `package.json`
- `.env.example`
- `prisma/schema.prisma`
- `middleware.ts`
- `next.config.ts`

## 4. 主要目录

```text
app/
  (auth)/login/
  (dashboard)/
    chat/
    image/
    video/
    history/
    workspace/
    model3d/
    users/
    settings/
  api/
    ai/chat/
    ai/image/
    ai/knowledge-graph/
    video/
    history/
    user/quota/
    admin/role-quotas/

components/
  chat/
  image-generation/
  video-generation/
  model3d/
  workspace/
  users/
  layout/

lib/
  agent/
  image/
  video/
  storage/
  quota.ts
  auth.ts
  db.ts
```

## 5. 已完成能力摘要

### 5.1 登录、用户、角色、额度

已有用户登录、用户管理、角色和每日额度能力。

角色：

- `admin`
- `teacher`
- `student`

额度逻辑：

- 图片生成提交即计数。
- 视频生成提交即计数。
- 管理员有高额度。
- 配额相关逻辑集中在 `lib/quota.ts`。

相关 API：

- `app/api/user/quota/route.ts`
- `app/api/admin/role-quotas/route.ts`
- `app/api/admin/role-quotas/[role]/route.ts`
- `app/api/users/*`

### 5.2 Agent 对话

对话页已经做过较多前端和后端能力：

- 默认 Agent 模式。
- 联网搜索可选。
- 写作模块可生成 Word。
- 图像生成模块可在对话中生成图片卡片。
- 上传文件/图片展示卡片已优化过。
- 对话中搜索引用以小气泡/侧边引用形式展示。
- 思考状态改成轻量小字轮播/图标形式。

关键文件：

- `app/api/ai/chat/route.ts`
- `lib/agent/router.ts`
- `lib/agent/types.ts`
- `lib/agent/reliability.ts`
- `components/chat/*`

注意：

- 不要让普通提问随意触发 Word 生成。
- 新建对话应是全新上下文，不要带入旧会话。
- 用户未开启联网时，对话模式不要自动联网；可由 Agent 判断是否需要，但前端关闭联网时要尊重关闭状态。

### 5.3 联网搜索

已接入过百度千帆 web_search，并做过自建合规搜索方向的前端引用展示。

关键文件：

- `lib/agent/tools/web-context.ts`
- `lib/agent/router.ts`
- `app/api/ai/chat/route.ts`

百度默认 endpoint：

```text
https://qianfan.baidubce.com/v2/ai_search/web_search
```

要求：

- 服务端读取 key，不暴露前端。
- 搜索失败时 Agent 降级，不要崩。
- 不打印 API key。

### 5.4 图片生成

图片页目前模型展示层已多次调整，注意“展示名”和“后台 ID”分开。

已做过能力：

- GPT Image 2 / Nexus Image2。
- 即梦图片 2.1 / Nexus Image mini2。
- Gemini 第三方模型曾尝试接入，第三方侧有问题，前端暂时灰色不可用。
- 生成结果走 OSS，历史记录打通。
- 对话页图像生成默认 Nexus Image2，支持加载卡片和放大预览。

关键文件：

- `app/api/ai/image/route.ts`
- `app/api/ai/image/history/*`
- `lib/image/config.ts`
- `lib/image/jimeng.ts`
- `components/image-generation/*`

注意：

- 不要把前端 label 当 provider id。
- 不要破坏历史记录旧模型显示。

### 5.5 视频生成

视频页已接入即梦视频 3.0 720P，并做过历史、删除、预览播放修复。

已做过能力：

- 图片上传预览。
- 分辨率 720P 可选，1080P 灰色禁用。
- 生成历史 pending/succeeded/failed。
- 视频页历史删除。
- 总历史记录删除同步。
- 视频时长限制只允许 5 秒和 10 秒。
- 播放器使用真实可播放视频地址，避免下载正常但网页黑屏。

关键文件：

- `app/api/video/route.ts`
- `app/api/video/tasks/[id]/route.ts`
- `app/api/video/history/*`
- `app/api/video/preview/route.ts`
- `lib/video/config.ts`
- `lib/video/tasks.ts`
- `lib/video/volcengine.ts`
- `components/video-generation/*`

注意：

- 不要误改已跑通的提交/轮询/历史逻辑。
- 如果服务器上视频刷新后不可看，优先检查 OSS/远程 URL、代理响应头、数据库保存字段。

### 5.6 知识图谱

知识图谱页面已做前端交互和后端生成接口：

- 可上传文件。
- 默认联网搜索。
- 可生成可拖动/缩放的图谱。
- 右侧有个人历史记录。
- 历史记录有删除。
- 关键概念可显示解释。

关键文件：

- `app/api/ai/knowledge-graph/route.ts`
- `app/api/ai/knowledge-graph/history/route.ts`
- `components/chat` 或相关知识图谱组件（需实际再搜）

注意：

- 服务器 504 多半是长任务超时或搜索/模型等待太久，不一定是前端错。

### 5.7 工作台

工作台已做过 UI 优化：

- 今日额度模块。
- 打开 Nexus Agent 按钮为蓝白渐变。
- 左侧选中态蓝白渐变。
- 账号概览合并到平台视角区域。
- 工作台入口恢复。

关键文件：

- `app/(dashboard)/workspace/page.tsx`
- `components/workspace/*`
- `app/api/dashboard/stats/route.ts`

## 6. 3D 工作区当前状态

入口：

- 左侧导航已有 `3D工作区`。
- 页面：`app/(dashboard)/model3d/page.tsx`
- 主组件：`components/model3d/model3d-page.tsx`

当前 3D 工作区是前端第一版，未正式接 Tripo API。

关键文件：

- `components/model3d/model3d-data.ts`
- `components/model3d/model3d-page.tsx`
- `components/model3d/model3d-parameter-panel.tsx`
- `components/model3d/model3d-viewer.tsx`
- `components/model3d/model3d-history-panel.tsx`

### 6.1 当前布局

整体布局：

- 左侧参数/工具栏
- 中间黑色 3D 预览区
- 右侧历史记录

左侧参数栏已压缩宽度，给中间预览区留空间。

### 6.2 左侧工具入口

当前左侧工具入口：

- 模型
- 部件拆分
- 部件补全
- 重拓扑
- 纹理生成
- 编辑
- 纹理放大
- PBR
- 动画

注意：`模型` 页面中的“纹理生成”参数和左侧独立“纹理生成”工具不是同一个概念，后续 API 也要分开。

### 6.3 模型页

`模型` 页顶部有两个并列按钮：

- 高精度模型
- 智能网格

这两个是两个不同页面，不能混在一起。

#### 高精度模型层级

当前按用户要求保留：

- 上传区域
- 图片自动优化
- 几何精度
- 分部件生成
- 纹理生成
  - 纹理设置
    - 高清纹理
    - PBR
    - 拓扑设置
    - 拓扑：四边面 / 三角面
    - 面数控制：Auto
- AI 模型

高精度模型里的四边面/三角面都可点击。

#### 智能网格层级

当前按用户要求保留：

- 上传区域
- 拓扑设置
  - 四边面：灰色禁用，因为官方当前不支持
  - 三角面：可选
- 面数控制：500-20000，默认 5000

注意：智能网格里的四边面禁用，不影响高精度模型里的四边面。

### 6.4 部件拆分

当前前端展示：

- 只有演示区域。
- 没有多余选项。
- 说明只有一句：`将模型拆分为可编辑部件`
- 说明为浅灰色、单行显示。

后续接口预留：

- 对接 Tripo 部件拆分任务。
- 输入应引用中间预览区当前模型资源。

### 6.5 部件补全

当前前端展示：

- 有“模型资源”选择区。
- 不显示假资源。
- 只有中间预览区已有模型资源时才显示资源。
- 无模型时显示 `暂无可用模型资源`。
- 说明文字：`自动将选中的部件补全为干净、闭合的网格。`
- 说明为浅灰色、单行显示。

后续接口预留：

- 需要统一模型资源对象，例如：

```ts
type ActiveModelResource = {
  taskId?: string;
  modelUrl: string;
  fileName: string;
  provider?: "tripo" | "local";
  modelType?: "generated" | "uploaded";
};
```

这个资源将被部件补全、编辑、纹理生成、重拓扑等工具共享。

### 6.6 重拓扑

当前前端展示：

- 拓扑选项：四边面 / 三角面
- 智能低模开关
- 面数控制：Auto-50000
- 默认值为 Auto（底层值 `0`）

相关常量：

- `MODEL3D_DEFAULT_RETOPO_FACE_COUNT = 0`
- `MODEL3D_RETOPO_FACE_COUNT_MAX = 50000`

### 6.7 底部生成按钮

当前按钮：

- 蓝白渐变
- 无黑色边框
- 字体放大
- 各工具入口共用按钮文案：
  - 模型：生成模型
  - 部件拆分：开始拆分
  - 部件补全：部件补全
  - 重拓扑：执行重拓扑
  - 纹理生成：生成纹理
  - 编辑：生成纹理预览
  - 纹理放大：立即放大
  - PBR：生成 PBR
  - 动画：自动绑定

## 7. 3D 后续 API 接入建议

用户后续想接 Tripo API。相关官方文档曾给出：

- `https://platform.tripo3d.com/docs/general`
- `https://platform.tripo3d.com/docs/task`
- `https://platform.tripo3d.com/docs/upload`
- `https://platform.tripo3d.com/docs/upload-sts`
- `https://platform.tripo3d.com/docs/generation`
- `https://platform.tripo3d.com/docs/import-model`
- `https://platform.tripo3d.com/docs/editing`
- `https://platform.tripo3d.com/docs/animation`
- `https://platform.tripo3d.com/docs/post-process`
- `https://platform.tripo3d.com/docs/schema`
- `https://platform.tripo3d.com/docs/wallet`

接入前必须重新查官方文档，不要猜字段。

建议后续新增：

```text
lib/model3d/
  config.ts
  tripo.ts
  tasks.ts
```

建议新增 API：

```text
app/api/model3d/route.ts
app/api/model3d/tasks/[id]/route.ts
app/api/model3d/history/route.ts
app/api/model3d/history/[id]/route.ts
```

建议流程：

1. 上传图片/模型资源到服务端或 OSS。
2. 服务端提交 Tripo 任务。
3. 本地创建 3D 历史记录，状态 `pending`。
4. 前端轮询任务状态。
5. 成功后保存 `modelUrl / previewImageUrl / taskId / providerMeta`。
6. 中间预览区展示模型。
7. 工具模块读取当前 `activeModelResource`，执行部件补全、重拓扑、纹理等后处理。

## 8. 部署与服务器注意事项

用户已部署到宝塔服务器，使用 Node 项目管理和反向代理。

服务器更新时注意：

- 不要删除服务器上的 `.env`。
- 不要删除数据库文件/持久化目录。
- 不要覆盖 OSS/自建搜索等服务器单独配置。
- 每次更新建议只替换源码和构建产物，保留 `.env`、数据库、上传目录、PM2/Node 项目配置。

如果登录后不跳转：

- 检查 cookie、HTTPS、域名、反向代理头。
- 检查 `middleware.ts` 和 session cookie secure/sameSite。

如果 504：

- 多半是代理超时、Node 项目超时、模型/搜索长任务超时。
- 知识图谱、联网搜索、文件理解、图片识别更容易触发。

## 9. 常见验证命令

类型检查：

```bash
cmd /c npx tsc --noEmit --pretty false
```

3D 中文乱码扫描：

```powershell
Select-String -Encoding UTF8 -Path 'components\model3d\*.tsx','components\model3d\*.ts' -Pattern '�|鍥|鐢|妯|鈮|涓|闈|绾|鏅|璇|姝|鏆|鐭|瑙|瀵'
```

百度搜索脚本曾验证：

```bash
pnpm.cmd exec tsx scripts/test-baidu-web-search.ts "重庆今天温度"
```

## 10. 新对话启动建议

新开窗口后建议直接说：

```text
请先阅读 docs/PROJECT_HANDOFF_V3.md，理解当前 NexusAI 项目状态。后续所有修改都遵守文档里的“不要误动已完成模块”原则。现在我们继续开发 XXX。
```

如果继续 3D：

```text
请重点看 components/model3d/*。不要动模型页已经确认正确的高精度模型/智能网格布局，只继续做后面的工具模块或 Tripo API 接入。
```

## 11. 当前特别容易误改的点

- 不要把“模型页智能网格”和“重拓扑”混成一个功能。
- 不要把“模型页纹理生成参数”和左侧“纹理生成工具入口”混成一个功能。
- 智能网格里的四边面禁用，但高精度模型里的四边面可选。
- 部件补全资源必须来自中间预览区已有模型，不要放假资源。
- Agent 未开启联网时，不要自动联网。
- 用户没明确要 Word/PPT 时，不要只因为出现文件或“word”字样就生成文档。
- 图片/视频历史、OSS 返回 URL、下载/预览链路已经修过，不要随便重构。

