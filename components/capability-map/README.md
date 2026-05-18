# 能力图谱组件占位

本目录预留给「能力图谱」前端组件。

当前状态：仅占位，不实现正式 UI。

后续建议组件：

- `CapabilityMapWorkspace`
- `DomainSelector`
- `GraphCanvas`
- `NodeDetailPanel`
- `EvidenceList`
- `RefreshStatus`
- `ExportPanel`

组件开发要求：

- 只读取 capability-map service 输出的数据。
- 不直接调用模型、搜索或其他模块业务函数。
- 不暴露底层模型名、provider 或 API key。
