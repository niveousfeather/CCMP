# Academic PPT 主项目交接文档

## 1. 项目基础信息

- 项目路径：`E:\AI project\codex\WEByunming`
- 当前分支：`feature/academic-ppt-builtin-templates`
- 当前日期上下文：`2026-05-20`
- 稳定基线 commit：`b596e62 chore: initialize repository with stable academic ppt baseline`
- 当前 dirty 文件：有。`git status --short` 显示 Academic PPT、模型桥接、task store、脚本和模板目录等存在未提交改动。
- commit / stage 状态：本轮不允许 commit，不允许 stage；交接时应保持未提交、未暂存。

## 2. 当前 Academic PPT 状态

- 主链路状态：Academic PPT 仍在稳定性收口阶段，当前改动重点是保证任务失败可控、PPTX 可打开、preview 与下载文件一致。
- `503 / 520 / provider error` 问题状态：已按 transient provider error 方向处理。`502 / 503 / 504 / 520 / 524`、provider HTML error、stream interrupted、terminated、socket/connect timeout、fetch failed、network error、timeout 均应进入 retry 或 fallback 逻辑。
- PPTX 打不开问题状态：已引入 OpenXML sanitizer / validator 方向，用于清理缺失关系引用并阻止坏 PPTX 暴露给前端下载。
- preview / download 不一致问题状态：当前修复方向是 preview manifest 绑定最终 PPTX 的路径和 sha256，download 也计算 sha256，二者不一致时不得标成真实预览。
- 电子科技大学模板策略：已从“复刻用户上传 template.pptx”调整为“电子科技大学主题色学术汇报模板”，不再解析用户模板结构，不再追求与上传模板一模一样。

## 3. 当前正在修的重点

- repair 阶段 transient 处理：
  - repair 是增强步骤，不应覆盖已经成功生成的 PPTX。
  - generation / visual QA 已有可用产物时，repair 的 `520 / 503 / provider HTML error` 应 fallback 到 generation 产物。
  - fallback 产物仍必须经过 sanitizer + validator。

- PPTX OpenXML sanitizer / validator：
  - 清理 `ppt/presentation.xml` 中缺失关系的 `p:notesMasterIdLst`。
  - 清理缺失字体关系或字体 part 的 `p:embeddedFontLst`。
  - 删除 `embedTrueTypeFonts="1"` 和 `saveSubsetFonts="1"`。
  - 不嵌入字体，不导出字体文件。
  - validator 至少检查 zip 可读、XML 可解析、`.rels` target 存在、XML 中 `r:id / r:embed / r:link` 可解析到对应关系。
  - validator 失败时不得返回损坏 PPTX。

- preview manifest 与 download sha256 一致性：
  - preview 必须来自最终 PPTX。
  - preview manifest 必须记录 `finalPptxPath`、`finalPptxSha256`、`slideCount`、`generatedAt`。
  - download 返回的 PPTX 也必须计算 sha256。
  - sha256 不一致时，前端不得显示为真实预览，应标记过期或重新生成 preview。

- 电子科技大学主题色生成：
  - `templateId`: `school_academic_report`
  - 前端显示名称：`电子科技大学`
  - 后端模式：`theme_preset`
  - primary: `#801c80`
  - gradient: `#811c81 -> #9d229d`
  - 右上角固定 logo / 校徽区域。
  - 不再复刻用户上传模板。
  - 不允许模型绘制 logo，不允许把 logo 当内容占位。

## 4. Academic PPT 相关核心文件

### 前端入口与组件

- `app/(dashboard)/smart-tools/academic-ppt/page.tsx`
- `components/smart-tools/academic-ppt/AcademicPptWorkbench.tsx`
- `components/smart-tools/academic-ppt/AcademicPptTaskMonitor.tsx`
- `components/smart-tools/academic-ppt/AcademicPptPreviewCanvas.tsx`
- `components/smart-tools/academic-ppt/academic-ppt-options.ts`

### API route

- `app/api/smart-tools/academic-ppt/tasks/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/download/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/preview/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/preview/[slideIndex]/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/logs/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/cancel/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/resume/route.ts`
- `app/api/internal/academic-ppt/model/route.ts`

### TypeScript 支撑层

- `lib/smart-tools/academic-ppt/client.ts`
- `lib/smart-tools/academic-ppt/server-task-store.ts`
- `lib/smart-tools/academic-ppt/tools-engine-client.ts`
- `lib/smart-tools/academic-ppt/preview-renderer.ts`
- `lib/smart-tools/academic-ppt/types.ts`
- `lib/smart-tools/academic-ppt/template-registry.ts`
- `lib/smart-tools/academic-ppt/task-queue.ts`
- `lib/smart-tools/academic-ppt/task-runner.ts`
- `lib/smart-tools/academic-ppt/model-adapter.ts`

### Python tools engine

- `services/ai-tools-engine/app/main.py`
- `services/ai-tools-engine/app/core/model_bridge.py`
- `services/ai-tools-engine/app/core/task_store.py`
- `services/ai-tools-engine/app/tools/academic_ppt/router.py`
- `services/ai-tools-engine/app/tools/academic_ppt/runner.py`
- `services/ai-tools-engine/app/tools/academic_ppt/schemas.py`
- `services/ai-tools-engine/app/tools/academic_ppt/paper_ppt_adapter.py`
- `services/ai-tools-engine/app/tools/academic_ppt/templates/builtin/school_academic_report/template.json`

## 5. 当前风险

- provider `520 / 503` 仍可能在 research、strategy、generation、visual QA、repair 阶段出现。
- repair 阶段失败如果处理不当，可能覆盖可用 generation PPTX 或返回半成品。
- PowerPoint 打不开的根因通常是 OpenXML 关系缺失、字体嵌入引用缺失、XML 不可解析。
- preview 与最终下载 PPTX 不一致会误导用户，必须以最终 PPTX 为唯一 preview 源。
- `presentation.xml` 中缺失 `notesMasterIdLst` 或 `embeddedFontLst` 关系会导致 Microsoft PowerPoint 打不开。
- dirty 文件较多，不能随意 commit；提交前必须人工审查 scope。
- 如果项目内没有合法可用的电子科技大学 logo / 校徽资产，不要生成假 logo，也不要让模型画 logo。

## 6. 禁止事项

- 不要动 capability-map。
- 不要动教学架构图目录。
- 不要动无关智能工具。
- 不要提交生成 PPTX、preview、logs、task、tmp。
- 不要提交 `.gitnexus`。
- 不要提交 `.env`、key、token。
- 不要恢复“复刻用户上传 template.pptx”的路线。
- 不要改普通聊天、Agent、Word、Excel、图片、视频、3D。
- 不要在 Academic PPT 修复中顺手重构大 UI。

## 7. 验证命令

```powershell
npm.cmd exec -- tsc --noEmit
python -m compileall -q services/ai-tools-engine
npm.cmd exec -- tsx scripts/academic-ppt/check-stability.ts
npm.cmd exec -- tsx scripts/academic-ppt/check-model-bridge.ts
npm.cmd exec -- tsx scripts/academic-ppt/smoke-tools-engine.ts
```

近期已跑过的验证方向包括 TypeScript、Python compileall、stability、model bridge、tools-engine smoke。接手后如果继续改功能代码，应重新执行上述命令。

## 8. 给下一个接手 Academic PPT 的注意事项

- 优先修稳定性，不要先做视觉美化。
- 先保证最终 PPTX 能在 Microsoft PowerPoint 打开。
- 先保证 preview / download sha256 一致，preview 来自最终 PPTX。
- 再做电子科技大学主题模板的版式美化。
- 不要恢复“复刻用户上传模板”路线。
- repair 失败时必须保护 generation 产物，不能把半成品暴露给下载。
- 修改符号前遵守 GitNexus 影响分析要求；如果 GitNexus keyword query 因 FTS 缺失退化，可用 `rg` 辅助定位，但不要跳过风险判断。

## 9. 建议使用的本地 skills / 参考路径

本机 skill 目录未保留可验证的 Git remote，`git -C <skill-dir> remote -v` 未返回 GitHub 地址。因此本文记录本地可读路径；如果后续需要 GitHub URL，应先从安装来源确认，不要凭空填写。

### GitNexus 项目内 skills

- GitNexus 总指南：`E:\AI project\codex\WEByunming\.claude\skills\gitnexus\gitnexus-guide\SKILL.md`
- 架构探索：`E:\AI project\codex\WEByunming\.claude\skills\gitnexus\gitnexus-exploring\SKILL.md`
- 影响分析：`E:\AI project\codex\WEByunming\.claude\skills\gitnexus\gitnexus-impact-analysis\SKILL.md`
- 调试追踪：`E:\AI project\codex\WEByunming\.claude\skills\gitnexus\gitnexus-debugging\SKILL.md`
- CLI / status / analyze：`E:\AI project\codex\WEByunming\.claude\skills\gitnexus\gitnexus-cli\SKILL.md`

### Codex 本地 skills

- PPTX 读写与校验：`C:\Users\yunming\.codex\skills\skills-main\skills\pptx\SKILL.md`
- 系统化调试：`C:\Users\yunming\.codex\superpowers\skills\systematic-debugging\SKILL.md`
- 完成前验证：`C:\Users\yunming\.codex\superpowers\skills\verification-before-completion\SKILL.md`
- 诊断循环：`C:\Users\yunming\.codex\skills\skills-main-extra\skills\engineering\diagnose\SKILL.md`
- 文档协作：`C:\Users\yunming\.codex\skills\skills-main\skills\doc-coauthoring\SKILL.md`
- 交接文档：`C:\Users\yunming\.codex\skills\skills-main-extra\skills\in-progress\handoff\SKILL.md`

建议下一个接手 Academic PPT 的 Codex 先读 GitNexus guide / impact-analysis，再读 PPTX skill；涉及 bug 复现时再读 systematic-debugging 或 diagnose。
