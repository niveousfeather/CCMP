# Academic PPT 项目交接文档 - 2026-05-18

工作区：

```text
E:\AI project\codex\WEByunming
```

当前工作区不是 Git 仓库，`git status` / `git diff` 不可用。后续接手时请以本交接文档、`docs/ACADEMIC_PPT_HANDOFF_2026-05-17.md`、以及实际文件内容为准；如需迁移到正式仓库，建议用干净 checkout 手工比对。

## 1. 当前结论

「智能工具 -> 学术PPT」当前主链路已经从 TypeScript 本地 PPT writer 迁移到 Python Tools Engine 内的 `paper-ppt-agent` 原生 pipeline：

```text
Browser
-> Next.js /api/smart-tools/academic-ppt/*
-> Python Tools Engine 127.0.0.1:8010
-> academic_ppt adapter
-> vendor/paper-ppt-agent backend run_pipeline
-> Next.js internal model bridge
-> paper-ppt-agent SVG / native PPTX export
-> Next.js download route
```

主生成路径目标是保持 `paper-ppt-agent` 原项目视觉 pipeline 效果。TypeScript `pptx-writer` / `template-registry` / `layout-planner` 只能作为兜底，不允许伪装成主路径成功。

当前核心状态：

- TXT / MD strict visual 主路径已经跑通，能生成非 whiteboard/basic deck 的 PPTX。
- GPT-5.4 primary retry 策略已增强，关键视觉阶段不会第一次 524 就立刻切 Kimi。
- strict visual mode 默认开启，Kimi 不允许产出最终白板 PPT。
- 如果缺 `design_spec.md`、缺 `svg_final`、缺 native export，或 PPTX 含 fallback 文案，会标记 degraded / fallback，不再冒充正常成功。
- 真实 SVG preview 已接入，优先展示 `paper-ppt-agent svg_final` 复制出的 SVG。
- 前端轮询已收敛为单 active poller，running 状态约 2s 拉取，不再多个旧 taskId 同时刷 logs。

## 2. 本轮重点相关文件

Next.js internal model bridge：

- `app/api/internal/academic-ppt/model/route.ts`

Python Tools Engine：

- `services/ai-tools-engine/app/core/config.py`
- `services/ai-tools-engine/app/core/model_bridge.py`
- `services/ai-tools-engine/app/core/checkpoints.py`
- `services/ai-tools-engine/app/core/task_store.py`
- `services/ai-tools-engine/app/tools/academic_ppt/runner.py`
- `services/ai-tools-engine/app/tools/academic_ppt/paper_ppt_adapter.py`
- `services/ai-tools-engine/app/tools/academic_ppt/schemas.py`

Next.js task / preview / frontend：

- `lib/smart-tools/academic-ppt/tools-engine-client.ts`
- `lib/smart-tools/academic-ppt/server-task-store.ts`
- `lib/smart-tools/academic-ppt/types.ts`
- `components/smart-tools/academic-ppt/AcademicPptWorkbench.tsx`
- `components/smart-tools/academic-ppt/AcademicPptPreviewCanvas.tsx`
- `components/smart-tools/academic-ppt/AcademicPptSettingsPanel.tsx`
- `components/smart-tools/academic-ppt/AcademicPptTaskMonitor.tsx`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/preview/[slideIndex]/route.ts`

检查脚本 / 文档：

- `scripts/academic-ppt/check-model-bridge.ts`
- `scripts/academic-ppt/check-stability.ts`
- `scripts/academic-ppt/smoke-tools-engine.ts`
- `lib/smart-tools/academic-ppt/README.md`
- `services/ai-tools-engine/README.md`

## 3. 端口与启动方式

本地实际端口必须和 `NEXT_PUBLIC_APP_URL` 一致。不要硬编码 3099 或 3000。

推荐 3000：

```powershell
cd "E:\AI project\codex\WEByunming"
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3000"
python .\services\ai-tools-engine\start.py
npm.cmd run dev -- -p 3000
```

如使用 3099：

```powershell
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3099"
npm.cmd run dev -- -p 3099
```

搜索服务预留端口：

```text
searxng / search bridge: 127.0.0.1:8080
```

8080 不要给 Tools Engine 使用。

## 4. 模型策略

Academic PPT 使用功能专用模型链路，不读取前端聊天主模型，也不读取用户前端填写的 provider / key / base URL。

主模型：

```text
provider: subrouter
model: gpt-5.4
label: subrouter:gpt-5.4
```

fallback：

```text
provider: moonshot
model: kimi-k2.5
label: moonshot:kimi-k2.5
```

关键配置默认值：

```text
ACADEMIC_PPT_STRICT_VISUAL_PIPELINE=true
ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK=false
ACADEMIC_PPT_MAX_PRIMARY_RETRIES_STRATEGY=6
ACADEMIC_PPT_MAX_PRIMARY_RETRIES_DEFAULT=4
AI_TOOLS_MODEL_BRIDGE_REQUEST_TIMEOUT_SECONDS=1800
```

关键阶段：

```text
research
manuscript
strategy
design_spec
generation
svg
repair
visual_qa
```

retry 行为：

- `strategy` / `design_spec` 最多 6 次 GPT-5.4。
- 其他关键阶段默认最多 4 次 GPT-5.4。
- backoff: `5s / 15s / 30s / 60s / 120s`。
- transient 错误包括 `524`、`504`、`503`、`502`、`timeout`、`network_error`、`UND_ERR_CONNECT_TIMEOUT`、`PROVIDER_ERROR_524`、`provider_504`。
- 只有 primary retries exhausted 后才允许考虑 fallback。
- strict visual stage 下默认禁用 Kimi final fallback。

日志脱敏要求：

- 可以记录 `stage`、`provider`、`model`、`attempt`、`elapsedMs`、`status=524` 这类产品诊断。
- 禁止记录 API Key、Authorization、Base URL、provider endpoint、requestId、完整 HTML error body、stack trace、本地绝对路径。

## 5. strict visual mode 与 fallback 规则

完整 paper-ppt-agent 成功必须满足：

- `manuscript.md` 存在且非空。
- `design_spec.md` 存在且非空。
- `svg_final` 存在，并包含接近目标页数的 SVG。
- native PPTX export 成功。
- PPTX 内不包含以下 fallback 文案：
  - `Rule fallback`
  - `Model bridge was unavailable`
  - `basic deck`
  - `generated from parsed text`

满足条件时：

```text
modelSource=paper-ppt-agent
generatorSource=tools-engine
visualPipelineStatus=success
generationMode=paper-ppt-agent
```

不满足时：

```text
modelSource=paper-ppt-agent-degraded 或 local-fallback
visualPipelineStatus=degraded
fallbackReason=<产品化原因>
```

当前原则是：宁可 failed / resumable，也不要 success + 低质量白板 PPT。

## 6. checkpoint / resume

Tools Engine 已增强 checkpoint，重要落盘点包括：

- `source-parsed`
- `generation-state`
- `visual-pipeline`
- `svg-final-index`
- per-slide `slide-svg-###`
- `preview`
- `pptx-exported`

checkpoint 写入要求：

- 使用临时文件 + 原子替换。
- 不保存密钥、Authorization、Base URL、本地绝对路径、长 raw provider body。
- GPT-5.4 timeout 时尽量保留已完成阶段。

## 7. 真实预览机制

预览优先级：

1. 如果 `svg_final` 存在，复制处理后的真实 SVG 到 task `previews` 目录，前端展示真实 SVG。
2. 如果后续启用 LibreOffice / `pdftoppm`，可以展示 native PPTX image preview。
3. 如果真实预览未就绪，前端必须显示“真实预览生成中”或“结构化占位预览”，不能伪装最终效果。

preview 失败不影响 download，也不应导致任务失败。

## 8. 前端交互状态

当前页面主布局已经朝工具页收敛：

- 顶部短标题 + 状态 badge。
- 左侧上传 / 最近任务。
- 中间预览区。
- 右侧配置区固定约 300px，`flex-shrink: 0`，禁止横向撑破。
- 底部任务进度和日志。
- 页面根布局设置了 `overflow-x-hidden`。

轮询规则：

- 同时只有一个 active task poller。
- 新任务创建后停止旧 poller。
- success / failed / cancelled / missing 后停止轮询。
- 旧 task 404 不影响当前 task。
- logs 只展示当前 selectedTaskId。

注意：当前部分中文 UI 文案在源码中仍可见 mojibake，例如 `AcademicPptWorkbench.tsx` 中状态/错误字符串。建议下一轮专门清理中文文案编码，不要和 pipeline 改动混在一起。

## 9. 搜索增强状态

前端配置和 task request 中已保留 / 传递相关字段：

```json
{
  "deepResearchEnabled": true,
  "externalResearchEnabled": true,
  "webSearchEnabled": true,
  "searchProvider": "nexus-searxng"
}
```

服务端配置预留：

```text
SEARCH_PROVIDER=searxng
SEARCH_BASE_URL=http://127.0.0.1:8080
SEARCH_TIMEOUT_SECONDS=15
```

约束：

- 浏览器不能直连 searxng。
- vendor/paper-ppt-agent 不能读取用户 API Key / Base URL / Authorization。
- 搜索失败必须降级为“无外部资料增强”，不能直接阻断主 PPTX 生成，除非原 pipeline 无法继续。
- 日志只显示搜索启用、查询数、命中文档数、是否降级；不显示内网地址或敏感信息。

建议下一轮单独验证 searxng 可用 / 不可用两种情况。

## 10. 已验证结果

根据上一轮验证摘要，以下已通过：

```powershell
npm.cmd exec -- tsx scripts\academic-ppt\check-model-bridge.ts
npm.cmd exec -- tsx scripts\academic-ppt\smoke-tools-engine.ts
npm.cmd exec -- tsx scripts\academic-ppt\check-stability.ts
npm.cmd exec -- tsc --noEmit
python -m compileall -q services\ai-tools-engine
npm.cmd run build
```

验证结论：

- `check-model-bridge` 显示 primary=`subrouter:gpt-5.4`，fallback=`moonshot:kimi-k2.5`。
- 模拟 strategy 多次 primary failure 时，strict visual mode 会跳过 Kimi final fallback 并返回 failed。
- smoke 任务成功，`modelSource=paper-ppt-agent`，PPTX 可下载。
- 8-slide 长 MD 验证成功，`visualPipelineStatus=success`，`previewType=svg`，不是 local-fallback。
- 浏览器布局检查通过：无横向滚动，右侧配置区固定，占位预览有明确标识。

注意：以上是上一轮记录的结果；接手后如果环境变量、端口、模型 provider 状态变化，需要重新跑验证。

## 11. 推荐下一步

优先做验证，不建议继续大改架构：

1. PDF 验证：
   - 小 PDF。
   - 长 PDF。
   - 区分 PDF 解析失败、模型桥失败、visual pipeline 失败。

2. 增强开关逐个验证：
   - 深度研究。
   - 外部研究增强 / searxng。
   - 视觉 QA。
   - 图标装饰。

3. 人工检查真实 PPT：
   - 封面标题对比度。
   - agenda 页面可读性。
   - section 页大数字和标题是否冲突。
   - 结尾页字体颜色和收束感。
   - 长文档页面是否过空或过挤。

4. 清理前端中文 mojibake。

5. 增加一个可提交的长文档 regression script，复用当前 8-slide MD 验证思路。

6. README 复查：
   - 是否还有旧的 retry 次数描述。
   - 是否有仍默认 3099 且未提醒 `NEXT_PUBLIC_APP_URL` 必须匹配实际端口的段落。

## 12. 快速验证命令

先启动：

```powershell
cd "E:\AI project\codex\WEByunming"
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3000"
python .\services\ai-tools-engine\start.py
npm.cmd run dev -- -p 3000
```

再运行：

```powershell
npm.cmd exec -- tsx scripts\academic-ppt\check-model-bridge.ts
npm.cmd exec -- tsx scripts\academic-ppt\smoke-tools-engine.ts
npm.cmd exec -- tsx scripts\academic-ppt\check-stability.ts
npm.cmd exec -- tsc --noEmit
python -m compileall -q services\ai-tools-engine
npm.cmd run build
```

如果脚本默认 3099，请显式设置：

```powershell
$env:ACADEMIC_PPT_TEST_BASE_URL="http://127.0.0.1:3000"
```

## 13. 禁止事项

后续开发请继续遵守：

- 不修改 Word / Excel / 图片 / 视频 / 3D。
- 不修改普通聊天 route。
- 不修改 Agent 主 route。
- 不修改 `capability-map`。
- 不新增 provider。
- 不新增前端 API Key / Base URL 输入。
- 不让前端直连 Python Tools Engine。
- 不让前端直连 searxng。
- 不重写 paper-ppt-agent vendor 核心 pipeline。
- 不把 Kimi / basic deck / local-fallback 冒充 paper-ppt-agent 完整成功。
- 不提交生成的 PPTX、PNG preview、task 目录、logs、`.tmp` 文件。

## 14. 建议使用的技能

下一位 agent 可按任务选择：

- `superpowers:systematic-debugging`：模型超时、任务失败、轮询错乱等问题。
- `pptx`：检查生成 PPTX 的页数、文字、fallback 文案和视觉输出。
- `webapp-testing` 或 Browser plugin：验证前端布局、无横向滚动、上传/下载交互。

## 15. 当前最短接手路径

1. 用 3000 或 3099 启动 Next.js，但确认 `NEXT_PUBLIC_APP_URL` 完全匹配。
2. 跑 `check-model-bridge` 确认模型桥健康。
3. 跑 `smoke-tools-engine` 确认 Tools Engine 主路径健康。
4. 手工上传一个小 TXT，目标 5 页，关闭深度研究、外部研究增强、视觉 QA、图标装饰。
5. 确认 task.json：
   - `modelSource=paper-ppt-agent`
   - `visualPipelineStatus=success`
   - `generatorSource=tools-engine`
   - `previewType=svg`
6. 下载 PPTX，确认没有 fallback 文案。
7. 再做 PDF 和增强开关验证。

## 16. Stability freeze update - 2026-05-18

This update freezes the current Academic PPT capability before built-in template-system development. No template-system code was started.

Scope frozen:

- Primary path remains Browser -> Next.js academic-ppt APIs -> Python Tools Engine -> paper-ppt-agent adapter -> native PPTX export.
- No provider, model strategy, vendor core, Word, Excel, image, video, 3D, chat, Agent route, or capability-map changes are included in this freeze.
- Full success requires `modelSource=paper-ppt-agent`, `generatorSource=tools-engine`, `generationMode=paper-ppt-agent`, `visualPipelineStatus=success`, design spec, SVG/native preview assets, and downloadable PPTX.
- Degraded, rule fallback, and local fallback must not be shown as complete success.
- Completed history preview is manifest-based: the frontend reads `/preview` once, renders only `manifest.slides`, and does not synthesize `/preview/1..N` from `slideCount`.
- Existing tasks with missing preview assets return `pending` or `unavailable` preview responses instead of repeated 404s.
- Static preview manifest path is `data/academic-ppt/tasks/{taskId}/previews/manifest.json`.
- Future OSS migration fields are reserved in task and manifest metadata, but no OSS upload is implemented in this freeze.

Fresh validation evidence from this freeze:

- `npm.cmd exec -- tsc --noEmit`: passed.
- `npm.cmd run build`: passed after stopping an old locked Next process; Prisma only reported its existing deprecation warning.
- `npm.cmd exec -- tsx scripts/academic-ppt/check-stability.ts`: passed.
- `npm.cmd exec -- tsx scripts/academic-ppt/check-model-bridge.ts`: passed against local Next; primary `subrouter:gpt-5.4`, fallback `moonshot:kimi-k2.5`, strict visual fallback skipped after exhausted strategy retry.
- `npm.cmd exec -- tsx scripts/academic-ppt/smoke-tools-engine.ts`: passed after launching a fresh Next production server with `AI_TOOLS_ENGINE_URL` set before process start. Smoke task was removed afterward.
- `python -m compileall -q services/ai-tools-engine`: passed.

Three-tier generation evidence:

- TXT/Markdown short smoke: 4-slide smoke passed through paper-ppt-agent with downloadable PPTX. Existing historical 5-slide primary PPTX tasks are present; the current smoke script still targets 4 slides, so exact fresh 5-slide smoke is not automated yet.
- Long PDF 12-slide task `db73bb89-9c1b-459f-b907-1b1f63ff2c26`: success, target 12, output 12 slides, `modelSource=paper-ppt-agent`, `visualPipelineStatus=success`, design spec present, SVG preview assets present, PPTX present.
- Long PDF 25-slide target task `ca8c00f2-82f8-4887-a6bf-5aa081d58c0a`: success, target 25, output 28 slides, all major options enabled, `modelSource=paper-ppt-agent`, `visualPipelineStatus=success`, design spec present, SVG preview manifest ready, PPTX present. Treat this as long-document pressure stability evidence, not exact slide-count locking.

Known boundary for the next phase:

- Built-in template-system work can start from this frozen baseline.
- Exact target slide-count control for long documents remains a future quality item.
- If a future smoke must prove exactly 5 slides with all options enabled, add a dedicated smoke scenario rather than changing the primary short smoke silently.
