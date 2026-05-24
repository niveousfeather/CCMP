# 教学架构图 PNG 主流程交接文档

更新日期：2026-05-23  
项目路径：`<PROJECT_ROOT>`  
当前分支：`feature/academic-ppt-builtin-templates`  
交接焦点：NexusAI 主项目里的「教学架构图」从 SVG 主编辑体验切换为 PNG 主预览 + 自然语言图片修改流程。

## 1. 最新产品决策

用户已经明确否定继续强化当前 SVG 可编辑渲染路线。原因是：

- `output.png` 的学术框架图效果已经更接近正式论文 / 课题申报 / 教学改革框架图；
- `output.svg` 即使做了 image-backed editable overlay，前端效果仍然不稳定；
- 当前阶段不要再追求完整 SVG 复刻、节点拖拽、文字坐标编辑或 SVG 复杂编辑器。

新的正确方向：

1. 前端主预览直接展示 `output.png`。
2. SVG 功能保留在代码里，作为后续可能恢复的备用能力。
3. 用户不再点击图中文字编辑。
4. 生成图片后，底部输入框用于输入自然语言修改说明。
5. 例如输入“把标题改成……”“把某个模块文字改成……”，后端重新调用 image 生成 / image edit 链路，更新 `output.png`。
6. 前端下载以 PNG 为主。

一句话：现在的教学架构图是“图片生成工具 + 图片修改指令”，不是“SVG 编辑器”。

## 2. 本轮实际改动范围

本轮只改教学架构图相关代码，未改 Academic PPT、capability-map、Agent 主链路、普通聊天、图片/视频/3D 主链路、公共 document-processing。

新增或修改：

- `lib/smart-tools/teaching-architecture-diagram/prompts.ts`
- `lib/smart-tools/teaching-architecture-diagram/image-provider.ts`
- `lib/smart-tools/teaching-architecture-diagram/image-generator.ts`
- `lib/smart-tools/teaching-architecture-diagram/task-store.ts`
- `lib/smart-tools/teaching-architecture-diagram/client.ts`
- `lib/smart-tools/teaching-architecture-diagram/types.ts`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/image-revision/route.ts`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureWorkbench.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureCanvas.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitecturePromptBar.tsx`

保留但不再作为主入口：

- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureSvgTextEditor.tsx`
- `components/smart-tools/teaching-architecture-diagram/TeachingArchitectureTextEditPopover.tsx`
- `app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/scene/route.ts`
- `lib/smart-tools/teaching-architecture-diagram/renderers/**`

## 3. 当前主流程

### 3.1 初次生成

1. 用户输入文字或上传文件。
2. 创建教学架构图任务。
3. 解析内容。
4. AI 生成 `blueprint.json`。
5. 构建 image prompt。
6. 调用 image provider 生成 `output.png`。
7. 后端仍生成 / 保留 `output.svg` 作为备用封存文件。
8. `task.json` 完成态的主输出优先设置为 PNG。
9. 前端画布展示 `output.png`。

### 3.2 图片修改

新增 API：

```http
POST /api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/image-revision
```

请求体：

```json
{
  "instruction": "把标题改成：数字赋能课程教学改革模型"
}
```

后端行为：

1. 校验任务必须是 `completed`。
2. 校验任务目录中必须有 `output.png`。
3. 将任务状态切回 `generating/generating_image`。
4. 读取 `blueprint.json`、旧 `prompt.txt`、当前 `output.png`。
5. 构建 revision prompt。
6. 调用 image provider。
7. 覆盖更新 `output.png`。
8. 写入 `revision-prompt.txt`。
9. 重新封存生成 `output.svg`，但 SVG 不作为主前端编辑入口。
10. 更新 `task.json` 为完成态。

核心函数：

- `requestTeachingArchitectureImageRevision`
- `runTeachingArchitectureImageRevisionTask`
- `reviseTeachingArchitectureImage`
- `buildTeachingArchitectureImageRevisionPrompt`

### 3.3 Provider 行为

`image-provider.ts` 增加了 `sourceImage?: File | null`。

- 如果存在 `sourceImage` 且 image2 keys 可用，则走 `generateSubrouterImage2` 的 `/images/edits` 分支。
- 如果没有 source image 或 edit 能力不可用，则仍按原有 image generation 逻辑处理。
- 不伪造局部编辑成功，也不走本地规则假装 AI 生图成功。
- 原有 xheai 超时切换 image2 fallback 逻辑保留。

## 4. 前端当前状态

### 4.1 Workbench

`TeachingArchitectureWorkbench.tsx` 已简化为：

- 创建任务；
- 轮询任务；
- 读取历史任务；
- 提交图片修改；
- 下载 PNG。

已移除主 UI 中这些入口：

- 保存文字；
- 下载 SVG；
- 点击文字编辑；
- pending scene edits；
- 前端 SVG 转 PNG 下载。

### 4.2 Canvas

`TeachingArchitectureCanvas.tsx` 现在只展示 PNG。

关键行为：

- 完成态优先用 `task.output.pngFileName` 或 `task.image.outputPng` 判断是否有 PNG。
- 即使旧任务 `preview.imageUrl` 还写着 SVG，也会强制拼出：

```text
/api/smart-tools/teaching-architecture-diagram/tasks/<taskId>/download?format=png&preview=1
```

- 支持滚轮缩放。
- 支持拖拽平移。
- 支持双击空白重置。
- 没有 SVG text click 编辑。

### 4.3 PromptBar

`TeachingArchitecturePromptBar.tsx` 增加 `mode?: "create" | "revise"`。

创建模式：

- 可输入初始教学材料；
- 可上传文件；
- 可选图型。

修改模式：

- 完成态任务下自动启用；
- 隐藏图型选择；
- 禁用文件上传；
- placeholder 提示“输入图片修改说明……”；
- 标签从“Agent模式”切为“图片修改”；
- 提交后调用 image revision API。

## 5. 下载逻辑

`getTeachingArchitectureDownload(taskId, format)` 已改为：

- `format=png`：返回 `output.png`，`Content-Type: image/png`。
- `format=svg`：返回 `output.svg`，`Content-Type: image/svg+xml`。
- `format=auto`：优先 PNG，缺失时 fallback SVG。

前端顶部主按钮只下载 PNG。

SVG 仍可通过 API 下载，但不在当前主 UI 暴露。

## 6. Prompt 状态

`buildTeachingArchitectureImagePrompt` 仍保留中文学术二维框架图约束，但最后输出意图已从“只是 SVG 重构参考”调整为“PNG 是主用户可见输出”。

新增 `buildTeachingArchitectureImageRevisionPrompt`：

- 明确这是 editing existing Chinese academic research framework diagram image；
- 保持正式论文图、课题申报图、教学改革框架图风格；
- 保持 2D vector infographic、white background、clean geometric shapes；
- 优先只改用户要求的部分；
- 改文字时要求中文大字、清晰、保持在原节点范围；
- 禁止 random English、watermark、logo、poster style、3D、neon、cyberpunk 等。

## 7. 验证结果

已运行：

```powershell
npm.cmd exec -- tsc --noEmit
```

结果：通过。

已用历史任务验证 PNG 下载：

任务：

```text
tad-d40dfcea-ec53-4818-94d7-f859d434f5d1
```

PNG 下载接口：

```text
GET /api/smart-tools/teaching-architecture-diagram/tasks/tad-d40dfcea-ec53-4818-94d7-f859d434f5d1/download?format=png&preview=1
```

结果：

- HTTP 200
- `Content-Type: image/png`
- `Content-Length: 1531704`

SVG 备用接口：

```text
GET /api/smart-tools/teaching-architecture-diagram/tasks/tad-d40dfcea-ec53-4818-94d7-f859d434f5d1/download?format=svg&preview=1
```

结果：

- HTTP 200
- `Content-Type: image/svg+xml`
- `Content-Length: 2049648`

浏览器验证：

- 地址：`http://localhost:3099/smart-tools/teaching-architecture-diagram`
- 桌面视口下可见历史记录。
- 选中历史任务后：
  - 顶部只显示“下载 PNG”；
  - 画布显示 `output.png`；
  - DOM 中图片 src 为 `download?format=png&preview=1&v=...`；
  - 画布提示“当前显示 output.png，底部输入修改说明可重新生成图片”；
  - 底部输入框切成图片修改 placeholder；
  - 标签显示“图片修改”；
  - 不再显示“下载 SVG”；
  - 不再显示“点击文字编辑”。

浏览器 console：

- 未发现本页相关 error/warn。
- 有一个外部 Statsig 网络 timeout，属于 Codex/浏览器环境外部统计请求，不是项目本地页面错误。

## 8. 未完整验证项

未实际提交一次新的 image revision 生成任务，原因：

- 这会调用真实 image provider，产生新的运行产物并消耗额度；
- 用户当前要求是输出交接文档，未要求继续真实生图。

下一位接手如需端到端验证，建议用已完成任务输入：

```text
把标题改成：数字赋能课程教学改革模型，保持原来的学术框架图风格和布局
```

然后检查：

- `task.json` 状态回到 generating 后 completed；
- `revision-prompt.txt` 生成；
- `output.png` 更新时间变化；
- 前端预览刷新；
- PNG 下载为新图。

## 9. Git / 工作区状态

当前仓库不是干净工作区，存在大量历史脏改，尤其 Academic PPT、services、package 等。

本轮没有 stage 文件：

```text
git diff --cached --name-only
```

结果为空。

教学架构图相关目录在当前 Git 状态中整体显示为未跟踪：

```text
?? app/api/smart-tools/teaching-architecture-diagram/
?? components/smart-tools/teaching-architecture-diagram/
?? lib/smart-tools/teaching-architecture-diagram/
```

不要直接 `git add .`。

提交前必须人工挑文件，且不要提交运行产物。以下路径均为项目内相对路径示例，不是本机绝对路径或实际运行产物：

- `data/smart-tools/teaching-architecture-diagram/tasks/**`
- `output.svg`
- `output.png`
- `edited-scene.json`
- `diagram-scene.json`
- `revision-prompt.txt`
- `tmp/**`
- `.env`
- key/token
- `package-lock.json`

## 10. GitNexus 状态

项目 `AGENTS.md` 要求修改符号前运行 GitNexus impact，提交前运行 detect_changes。

本轮限制：

- GitNexus MCP server 未暴露；
- `tool_search` 没找到 GitNexus 工具；
- `npx gitnexus status` 因 PowerShell script execution policy 无法直接运行；
- `npx.cmd gitnexus status` 报 `Cannot destructure property 'package' of 'node.target' as it is null`；
- `npx.cmd gitnexus detect_changes` 因 npm registry / 权限问题失败；
- 尝试提权运行被审批层拒绝。

因此本轮用本地 `rg` 调用关系扫描、TypeScript 类型检查和浏览器手工验证替代，但严格来说 GitNexus 检查未完成。下一位接手如果工具恢复，应补跑：

```powershell
npx.cmd gitnexus status
npx.cmd gitnexus detect_changes
```

如果 index stale，再按项目规则运行：

```powershell
npx.cmd gitnexus analyze
```

## 11. 注意事项和风险

### 11.1 旧任务元数据

旧任务的 `task.json.preview.title` / `description` 可能仍写着 “SVG”，但新前端已经绕过旧 `preview.imageUrl`，只要任务有 `output.png` 就强制加载 PNG。

可以后续做一个轻量 normalize，让旧任务读取时 preview 文案也自动转成 PNG，但当前不是必须。

### 11.2 图片修改不等于精确文字编辑

当前改为 image-level revision，视觉质量会比 SVG renderer 更稳定，但文字修改准确率依赖 image provider。

如果用户要求“精确替换某几个字，必须 100% 可控”，未来仍可能需要：

- 图片底图 + 单独文字覆盖层；
- 或结构化 SVG / Canvas 编辑器；
- 或局部 mask edit 能力。

当前阶段明确不做这些。

### 11.3 `output.svg` 仍会生成

虽然前端不再主用 SVG，但后端仍保留 `renderTeachingArchitectureTaskSvg`：

- 初次生成后封存 `output.svg`；
- 图片 revision 后也尝试重新封存 `output.svg`；
- 旧 scene 编辑 API 仍可用，但不在当前前端主入口展示。

不要删除这些文件和代码，用户明确说“也许后面会用到”。

### 11.4 不要误碰其它链路

后续继续此任务时，默认不要改：

- `components/smart-tools/academic-ppt/**`
- `lib/smart-tools/academic-ppt/**`
- `services/**`
- `capability-map/**`
- `components/capability-map/**`
- `app/api/capability-map/**`
- `components/chat/**`
- `lib/agent/**`
- `lib/document-processing/**`
- `app/api/ai/**`

## 12. 下一步建议

优先级 1：真实端到端验证 image revision。

- 用已有完成任务提交一次图片修改说明；
- 确认 `revision-prompt.txt` 和新 `output.png`；
- 确认前端轮询回 completed；
- 确认下载 PNG 是最新图。

优先级 2：完善旧任务 normalize。

- 读取旧任务时，如果存在 PNG，把 `generationMode`、`preview.title`、`preview.description` 归一成 PNG 主流程；
- 避免历史任务在 UI 辅助文本里还出现 SVG。

优先级 3：为图片修改增加更明确的日志。

- 记录 `imageRevision=true`；
- 记录是否传入 source image；
- 记录 provider 使用 generation 还是 edit endpoint；
- 不暴露 provider/model 到前端 UI。

优先级 4：可选增加轻量测试。

- `getTeachingArchitectureDownload(format=png)` 返回 PNG；
- image revision instruction 校验；
- `getTaskPreviewImageUrl` 对旧 SVG preview 任务也返回 PNG URL。

## 13. 交接给下一位 Agent 的一句话

请不要继续修当前 SVG 编辑器视觉。当前阶段教学架构图的产品方向已经改为：`output.png` 是前端主预览和主下载产物，SVG 只封存备用；用户通过底部自然语言输入框描述图片修改，后端重新调用 image 生成 / edit 更新 `output.png`。
