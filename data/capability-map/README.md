# 能力图谱数据目录占位

本目录预留给「能力图谱」本地数据快照。

当前状态：仅占位，不生成真实数据。

后续建议结构：

```text
data/capability-map/embodied-ai/graph.json
data/capability-map/embodied-ai/evidence.json
data/capability-map/embodied-ai/refresh-log.json
data/capability-map/embodied-ai/exports/
```

数据要求：

- `graph.json` 存节点和关系。
- `evidence.json` 存资料来源、摘要、关键词和访问时间。
- `refresh-log.json` 存刷新任务状态、耗时、错误摘要。
- `exports/` 存导出的 CSV / XLSX / Markdown / DOCX。
