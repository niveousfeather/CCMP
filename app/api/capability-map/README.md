# 能力图谱 API 占位

本目录预留给「能力图谱」后端 API。

当前状态：仅占位，不提供 route handler。

后续 API 应只作为 capability-map 模块的独立服务入口，例如：

- 手动刷新资料。
- 读取图谱数据。
- 查询刷新日志。
- 触发导出任务。

禁止事项：

- 不要在本目录外修改现有 API route。
- 不要复用 Word/PPT/Excel 的业务链路。
- 不要修改普通聊天、Agent 主链路或模型路由配置。
- 不要新增 API key 混用逻辑。
