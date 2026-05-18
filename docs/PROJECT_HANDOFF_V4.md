# NexusAI 项目交接文档 V4

> 更新时间：2026-05-08  
> 工作区：`E:\AI project\codex\WEByunming`

## 1. 当前状态

这是一个基于 Next.js 15 + React 19 + Prisma 的 NexusAI 平台。当前前端与后端都已进入“多模块并行完善”阶段，已完成或正在稳定中的核心能力包括：

- 登录、用户管理、角色与每日配额
- Nexus Agent 对话
- 图片生成、视频生成
- 知识图谱
- 3D 工作区前端与 Tripo API 对接骨架
- Word 文档生成与修改模块拆分
- 数据分析页骨架
- 资产 / 历史记录 / 属性等工作台侧边能力

### 当前最重要原则

- 不要误动已完成模块
- 图片、视频、3D 的既有流程优先保持稳定
- 前端展示改动时，优先局部修改对应组件
- API 对接时，保持前端展示名与后端 provider id 分离

## 2. 已完成的关键改动

### 2.1 Word 模块拆分

Word 能力已拆成独立内部模块，便于后续复用到 Agent、独立 Word 功能、保留原格式修改、批注修改等场景。

相关文件：
- `lib/document/create.ts`
- `lib/document/revise-comments.ts`
- `lib/document/revise-original.ts`
- `lib/document/docx-package.ts`
- `lib/document/docx-comments.ts`
- `lib/document/docx-paragraphs.ts`

当前支持：
- 无文件时生成新的美观 Word
- 上传 `.docx` 后保留原格式修改
- 上传 `.docx` 后按批注修订

### 2.2 对话返回内容

- 图片、代码块、附件卡片、网页引用等返回样式已做前端展示适配
- 这次已修复聊天代码块卡片在浅色主题里可读性差的问题

修复位置：
- `components/chat/chat-message.tsx`

### 2.3 3D 工作区

3D 工作区已经完成了大量前端和视口优化，但仍以“前端显示 + 预留 API 接口位置”为主。

相关文件：
- `components/model3d/model3d-page.tsx`
- `components/model3d/model3d-viewer.tsx`
- `components/model3d/model3d-parameter-panel.tsx`
- `components/model3d/model3d-history-panel.tsx`
- `components/model3d/three-model-viewport.tsx`

### 2.4 文档与检查

已有多份交接、部署、API 映射和使用手册文档可参考：
- `docs/PROJECT_HANDOFF_V3.md`
- `docs/model3d-tripo-api-mapping.md`
- `docs/api-integration-plan.md`
- `docs/deployment-checklist.md`
- `docs/NexusAI使用手册.md`

## 3. 目前代码基线

### 常用命令

```bash
pnpm dev
pnpm build
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
cmd /c npx tsc --noEmit --pretty false
```

### 依赖

- Next.js 15
- React 19
- Prisma
- Tailwind CSS
- three / @types/three
- lucide-react
- xlsx / papaparse

## 4. 已知约束

- 服务器端长任务要注意超时与重试
- 3D 生成、图片生成、视频生成都要区分“生成中 / 成功 / 失败 / 超时”状态
- OSS 存储、历史记录持久化、前端预览三者要同时成立
- 前端按钮与显示名可改，后端 provider/model id 不要随意改
- 用户要求蓝色按钮文字强制白色，灰色按钮可保留灰字

## 5. 下一步建议

优先级建议如下：

1. 继续清理对话页代码块 / 返回消息展示的一致性
2. 完成 3D 工作区真实返回模型预览与资产持久化
3. 继续把数据分析页改成真实数据表格
4. 最后再统一检查所有页面配色、弹窗层级和响应式溢出问题

## 6. 交接提醒

后续修改请继续遵守：
- 不要重做已经完成的模块
- 不要把展示名和后端 API id 混成一个概念
- 不要动已经稳定的图片 / 视频 / 3D 主流程，除非是明确修复 bug
- 若新增接口字段与既有 schema 冲突，先保留 UI 兼容层，再处理后端映射
