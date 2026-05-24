# 教学架构图项目交接文档

项目路径：`F:\AI project\WEByunming - teaching-architecture-diagram-reserved`  
分支：`feature/teaching-architecture-diagram`  
日期：2026-05-21

## 1. 当前状态

教学架构图第一版闭环已完成，包含：

- 前端工作台入口
- 文字输入 / 文件上传
- 输入源互斥逻辑
- 图型下拉选择
- 本地 task 文件存储
- 文字输入真实解析
- TXT / MD 文件真实解析
- PDF / DOCX / PPTX 文件暂存与 pending parser 标记
- 规则版 blueprint 生成
- prompt.txt 真实落盘
- 真实 image2 / GPT-image-2 图片生成
- output.png 预览与下载
- failed / timeout / retry UI 和接口占位
- retry 图片生成接口

## 2. 主要目录

```txt
components/smart-tools/teaching-architecture-diagram/
lib/smart-tools/teaching-architecture-diagram/
app/(dashboard)/smart-tools/teaching-architecture-diagram/page.tsx
app/api/smart-tools/teaching-architecture-diagram/
data/smart-tools/teaching-architecture-diagram/tasks/
```

智能工具入口：

```txt
components/smart-tools/smart-tools-data.ts
```

## 3. API

```txt
POST /api/smart-tools/teaching-architecture-diagram
GET  /api/smart-tools/teaching-architecture-diagram/tasks
GET  /api/smart-tools/teaching-architecture-diagram/tasks/[taskId]
GET  /api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/download
POST /api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/retry
```

## 4. Task 目录格式

每个任务落盘到：

```txt
data/smart-tools/teaching-architecture-diagram/tasks/<taskId>/
```

典型文件：

```txt
input/
raw-input.txt 或 extracted-content.txt
extraction.json
blueprint.json
prompt.txt
task.json
logs.jsonl
output.png
```

## 5. 图片生成配置

当前教学架构图默认图片 provider：

```txt
provider: xheai
model: gpt-image-2-all
aspect_ratio: 16:9
image_size: 1k
size: 1792x1024
response_format: url
```

必需环境变量：

```txt
XHEAI_API_KEY
XHEAI_BASE_URL=https://api.xheai.cc
```

可选覆盖：

```txt
TEACHING_ARCHITECTURE_IMAGE_PROVIDER
TEACHING_ARCHITECTURE_IMAGE_MODEL
TEACHING_ARCHITECTURE_IMAGE_BASE_URL
TEACHING_ARCHITECTURE_IMAGE_TIMEOUT_MS
```

保留 subrouter 兼容逻辑，但默认不走 subrouter。

## 6. Prompt 约束

`prompts.ts` 中已加入中文架构图强约束：

- 中文教学改革成果架构图
- 学术成果框架图
- 架构图，不是海报 / 插画 / 思维导图
- 白底
- 蓝红强调
- 模块化卡片
- 箭头、闭环、流程、支撑体系、评价反馈、成果输出
- 中文标签清晰可读

新增字体渲染强约束：

- 中文必须像真实矢量排版文字
- 使用黑体 / 思源黑体 / 微软雅黑风格
- 字形锐利、完整、可读
- 禁止模糊字、糊字、伪中文、乱码、英文占位符、压线字、重叠字

## 7. 错误策略

图片生成错误码：

```txt
IMAGE_PROVIDER_NOT_CONFIGURED
IMAGE_PROVIDER_TIMEOUT
IMAGE_PROVIDER_BAD_RESPONSE
IMAGE_PROVIDER_FAILED
MODEL_PROVIDER_TIMEOUT
TASK_TIMEOUT
```

行为：

- provider 未配置：`failed`，`retryable=false`
- 504 / timeout：`failed`，`retryable=true`
- bad response：`failed`，`retryable=true`
- retry 接口只允许重试 `failed && retryable=true` 的任务

## 8. 验证结果

已执行：

```txt
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

结果：均通过。

mock 请求体验证：

```txt
url: /v1/images/generations
model: gpt-image-2-all
image_size: 1k
size: 1792x1024
aspect_ratio: 16:9
provider metadata: xheai
```

GitNexus impact：

```txt
generateTeachingArchitectureImageWithProvider: LOW
getTeachingArchitectureImageProviderConfig: LOW
runTeachingArchitectureImageGeneration: LOW
buildTeachingArchitectureImagePrompt: LOW
```

`detect_changes(scope=all)` 当前仍报 critical，原因是工作树中已有 Academic PPT / services 等无关脏改，不是教学架构图本轮改动导致。

## 9. 禁止路径说明

本轮教学架构图工作没有主动修改：

```txt
components/smart-tools/academic-ppt/
lib/smart-tools/academic-ppt/
app/api/smart-tools/academic-ppt/
app/api/internal/academic-ppt/
services/ai-tools-engine/app/tools/academic_ppt/
services/ai-tools-engine/app/core/model_bridge.py
capability-map
普通聊天 / Agent / Word / Excel / 图片 / 视频 / 3D 链路
```

注意：当前工作树中这些路径已有脏改，后续合并时必须单独区分，不要误纳入教学架构图提交。

## 10. 后续建议

1. 使用真实 `XHEAI_API_KEY` 跑一次端到端生成。
2. 人工检查中文字体清晰度。
3. 如果字体仍不清晰，优先减少节点数量、放大字号、缩短标签。
4. 如果模型文字能力仍不稳定，建议后续改为图片模型生成结构背景，再用 HTML / SVG / Canvas 重绘文字层。
5. 合并前只 stage 教学架构图路径和 `components/smart-tools/smart-tools-data.ts`，避免带入 Academic PPT / services 脏改。
