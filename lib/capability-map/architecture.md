# 能力图谱技术架构草案

当前状态：规划骨架，不包含正式实现。

## 模块边界

「能力图谱」是独立工作区，不属于 Word、PPT、Excel、图片生成、视频生成、3D 工作区、知识图谱或普通聊天。

第一版专业方向：具身智能。

所有后续代码应集中在：

- `app/capability-map/`
- `app/api/capability-map/`
- `components/capability-map/`
- `lib/capability-map/`
- `scripts/capability-map/`
- `data/capability-map/`
- `docs/CAPABILITY_MAP_HANDOFF.md`

## 推荐数据流

```text
用户进入能力图谱工作区
→ 选择专业：具身智能
→ 手动/定时 refresh
→ 自建搜索搜集资料
→ Agent 后台任务模型摘要和归类
→ 生成 graph.json / evidence.json
→ 页面读取图谱
→ 可视化展示
→ 导出表格或文档
```

## 后续建议服务分层

```text
lib/capability-map/types.ts
lib/capability-map/sources.ts
lib/capability-map/search.ts
lib/capability-map/extract.ts
lib/capability-map/graph.ts
lib/capability-map/storage.ts
lib/capability-map/export.ts
lib/capability-map/scheduler.ts
```

## 模型与搜索调用原则

能力图谱后续允许调用：

- Agent 普通对话模型
- Agent 后台任务模型
- Image 图像模型
- 自建网页搜索

但必须通过 capability-map service 间接调用。不得修改模型配置，不得修改其他模块调用逻辑，不得复用 Word/PPT 业务链路。
