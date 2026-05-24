# 教学架构图并行开发占用路径与协作边界

## 1. 新功能名称

教学架构图

## 2. 新分支建议

`feature/teaching-architecture-diagram`

## 3. 功能定位

老师上传教学材料，系统通过 Agent 分析文件内容，然后调用 `image2 / GPT-image-2` 生成教学架构图图片。

第一版只做：

- 文件上传
- 文档解析
- Agent 分析
- `diagram_blueprint.json`
- 图片生成
- 图片预览
- 图片下载

第一版不做：

- PPT 导出
- SVG 编辑
- 无限画布
- 节点拖拽
- Academic PPT 复用
- capability-map

## 4. 固定前端目录

占用如下目录和文件：

```text
components/smart-tools/teaching-architecture-diagram/
  TeachingArchitectureWorkbench.tsx
  TeachingArchitectureUploader.tsx
  TeachingArchitecturePreview.tsx
  TeachingArchitectureTaskMonitor.tsx
  teaching-architecture-options.ts

lib/smart-tools/teaching-architecture-diagram/
  types.ts
  client.ts
  task-store.ts
  prompts.ts
```

建议新增页面入口：

```text
app/(dashboard)/smart-tools/teaching-architecture-diagram/page.tsx
```

## 5. 固定 API 路由

占用如下路由：

```text
app/api/smart-tools/teaching-architecture-diagram/
  route.ts

app/api/smart-tools/teaching-architecture-diagram/tasks/
  route.ts

app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/
  route.ts

app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/download/
  route.ts
```

如需日志、取消、重试、preview 专用接口，应继续放在：

```text
app/api/smart-tools/teaching-architecture-diagram/tasks/[taskId]/
```

不要复用或修改 Academic PPT 的 API 路由。

## 6. 固定 Python 后端工具目录

占用如下目录和文件：

```text
services/ai-tools-engine/app/tools/teaching_architecture_diagram/
  __init__.py
  runner.py
  schemas.py
  analyzer.py
  prompt_builder.py
  image_generator.py
  artifact_store.py
```

FastAPI router 未来接入点在：

```text
services/ai-tools-engine/app/main.py
```

该接入只能在教学架构图分支实施，本轮不修改。

## 7. 固定 artifact 输出建议

建议输出到独立目录。以下路径均为项目内相对路径示例，不是本机绝对路径或实际运行产物：

```text
data/smart-tools/teaching-architecture-diagram/tasks/<taskId>/
  input/
  blueprint.json
  prompt.txt
  output.png
  task.json
  logs.jsonl
```

如果项目后续统一了 task / artifact 目录，以现有规范为准，但必须独立于 Academic PPT。当前 Academic PPT 使用独立任务目录，不要把教学架构图产物写进 Academic PPT task 目录。

## 8. 需要接入但容易冲突的公共入口

以下文件是将来接入“教学架构图”时需要查看或小改的公共入口；本轮不要修改：

- 智能工具入口 registry / 卡片列表：`components/smart-tools/smart-tools-data.ts`
  - 当前 `SmartToolDefinition["id"]` 只包含 `"academic-ppt"`。
  - 未来新增 `"teaching-architecture-diagram"` 时，应该在这里添加卡片定义和 href。
- 智能工具卡片渲染：`components/smart-tools/SmartToolsGrid.tsx`
  - 当前从 `smartTools` 渲染卡片，通常 registry 改完即可复用。
- 智能工具卡片组件：`components/smart-tools/SmartToolCard.tsx`
  - 如新增 icon、badge 或类型限制，可在这里小改。
- 智能工具总入口页面：`app/(dashboard)/smart-tools/page.tsx`
  - 当前渲染 `SmartToolsGrid`。
- 新功能路由页面：`app/(dashboard)/smart-tools/teaching-architecture-diagram/page.tsx`
  - 未来新增，导入 `TeachingArchitectureWorkbench`。
- sidebar / navigation：`components/layout/app-shell.tsx`
  - 当前已有 `/smart-tools` 导航入口。
  - 当前对 Academic PPT 有 `isAcademicPptWorkbench` 宽屏特判；如教学架构图需要宽屏工作台，可在教学架构图分支新增独立判断。
- Python tools engine 入口：`services/ai-tools-engine/app/main.py`
  - 未来新增 teaching architecture router include，并更新 health tools 列表。
- 可能的 tool type union 文件：
  - `components/smart-tools/smart-tools-data.ts`：智能工具 id union。
  - `lib/agent/types.ts`、`app/api/ai/chat/route.ts`、`lib/agent/router.ts`、`components/chat/chat-page.tsx`：这些属于普通聊天 / Agent 选择链路，第一版教学架构图不应接入，除非产品明确要求。

已有后端目录 `services/ai-tools-engine/app/tools/diagram_canvas/` 是另一个工具，不是教学架构图固定目录。不要把新功能直接塞进该目录，除非后续有明确合并决策。

## 9. 合并边界

教学架构图分支禁止修改：

- `components/smart-tools/academic-ppt/`
- `lib/smart-tools/academic-ppt/`
- `app/api/smart-tools/academic-ppt/`
- `app/api/internal/academic-ppt/`
- `services/ai-tools-engine/app/tools/academic_ppt/`
- `services/ai-tools-engine/app/core/model_bridge.py`，除非只是新增通用 `image2` client，且必须说明原因和影响范围。
- `capability-map`
- `paper_ppt_adapter.py`
- 普通聊天 / Agent / Word / Excel / 图片 / 视频 / 3D 相关路径。

Academic PPT 分支也不要占用教学架构图固定目录，避免两个 Codex 并行开发时互相覆盖。

## 10. 教学架构图第一版数据流

```text
上传文件
→ 创建 task
→ 解析文件
→ Agent 提取教学改革要素
→ 生成 diagram_blueprint.json
→ 生成 image prompt
→ 调用 image2 / GPT-image-2
→ 保存 output.png
→ 前端展示
→ 下载图片
```

## 11. Agent 提取字段

- 教学改革背景
- 核心问题
- 建设目标
- 教学资源
- 实施路径
- 教学模式
- 技术支撑
- 评价机制
- 成果输出
- 示范推广

## 12. 第一版图型

- 中心模型型
- 三层架构型
- 左中右流程型
- 环形闭环型
- 树状模块型

默认风格：高校教改成果图风格，白底，蓝红强调，高信息密度，中文标签清晰，16:9。

## 13. 给下一个 Codex 的开工指令摘要

请从 `feature/teaching-architecture-diagram` 分支开工，只在本占用文档指定目录开发“教学架构图”。不要碰 Academic PPT，不要改 capability-map，不要接入普通聊天 / Agent 链路。第一版只实现文件上传、材料分析、`diagram_blueprint.json`、`image2 / GPT-image-2` 图片生成、预览和下载；不要做 PPT 导出、SVG 编辑、无限画布或节点拖拽。

## 14. 建议使用的本地 skills / 参考路径

本机 skill 目录未保留可验证的 Git remote，`git -C <skill-dir> remote -v` 未返回 GitHub 地址。因此本文记录本地可读路径；如果后续需要 GitHub URL，应先从安装来源确认，不要凭空填写。

### GitNexus 项目内 skills

- GitNexus 总指南：`<CLAUDE_SKILLS_DIR>/gitnexus/gitnexus-guide/SKILL.md`
- 架构探索：`<CLAUDE_SKILLS_DIR>/gitnexus/gitnexus-exploring/SKILL.md`
- 影响分析：`<CLAUDE_SKILLS_DIR>/gitnexus/gitnexus-impact-analysis/SKILL.md`
- 调试追踪：`<CLAUDE_SKILLS_DIR>/gitnexus/gitnexus-debugging/SKILL.md`
- CLI / status / analyze：`<CLAUDE_SKILLS_DIR>/gitnexus/gitnexus-cli/SKILL.md`

### Codex 本地 skills

- 图片生成 / `image2` / `GPT-image-2` 相关：`<CODEX_SKILLS_DIR>/.system/imagegen/SKILL.md`
- PDF 教学材料解析：`<CODEX_SKILLS_DIR>/skills-main/skills/pdf/SKILL.md`
- Word 教学材料解析：`<CODEX_SKILLS_DIR>/skills-main/skills/docx/SKILL.md`
- PPTX 教学材料解析：`<CODEX_SKILLS_DIR>/skills-main/skills/pptx/SKILL.md`
- 前端工作台设计参考：`<CODEX_SKILLS_DIR>/frontend-design/SKILL.md`
- 系统化调试：`<CODEX_SKILLS_DIR>/systematic-debugging/SKILL.md`
- 完成前验证：`<CODEX_SKILLS_DIR>/verification-before-completion/SKILL.md`
- 文档协作：`<CODEX_SKILLS_DIR>/skills-main/skills/doc-coauthoring/SKILL.md`

建议下一个开发“教学架构图”的 Codex 先读 GitNexus guide / exploring，确认智能工具入口和边界；实现图片生成前读 imagegen skill；处理上传材料解析时按文件类型分别读 pdf / docx / pptx skill。
