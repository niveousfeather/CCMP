# 第二阶段开发方案

## 1. 第二阶段页面与功能拆分

本阶段目标是在第一阶段基础上，把项目从基础后台框架升级为更完整、可演示、可管理的产品原型。

重点页面：

```txt
/users
用户管理增强页：
- 搜索
- 角色筛选
- 分页
- Excel / CSV 上传预览
- 确认导入
- 多选删除
- 批量操作栏
- Loading / Empty / Toast / Dialog

/chat
高保真对话页：
- 会话列表
- 聊天气泡
- 建议问题
- 附件上传入口
- 模型切换
- 参考资料侧栏
- 底部输入区

/image
高保真图片生成页：
- Prompt 输入
- 参数面板
- 风格、比例、数量
- 结果宫格
- 图片 hover 操作
- 任务历史

/video
高保真视频生成页：
- Prompt 输入
- 参数面板
- 视频预览
- 生成状态
- 历史任务列表

/settings
小幅增强：
- 表单校验提示更明确
- Toast 保持统一
```

新增或增强的全局 UI 组件：

```txt
EmptyState
Skeleton
Checkbox
Pagination
Select
FileUpload
ConfirmDialog
TableToolbar
```

## 2. 用户管理页增强方案

用户管理页布局：

```txt
顶部：
- 页面标题：用户管理
- 说明文字
- 刷新按钮
- 批量导入按钮
- 添加用户按钮

筛选区：
- 用户名搜索框
- 角色筛选：全部 / 管理员 / 普通用户
- 每页数量选择

批量操作栏：
- 仅当选中用户数量 > 0 时出现
- 显示：已选择 N 个用户
- 操作：批量删除
- 删除前弹出二次确认 Dialog

用户表格：
- 第一列复选框
- 用户名
- 角色 Badge
- 创建时间
- 更新时间
- 操作：重置密码、删除
- 当前页全选
- 移动端使用用户卡片列表，支持勾选

底部：
- 分页器
- 当前范围提示，例如：显示 1-10 / 共 42 个用户
```

空状态：

```txt
无用户：
- 图标
- “暂无用户”
- “可以添加单个用户，或通过 CSV / Excel 批量导入。”

搜索无结果：
- “没有匹配的用户”
- “尝试调整关键词或角色筛选。”
```

Loading 状态：

```txt
表格首次加载显示 Skeleton 行
刷新时按钮显示 loading
导入解析时显示解析中状态
导入提交时按钮显示提交中状态
```

表单校验：

```txt
添加用户：
- username 不能为空
- password 如果填写，至少 8 位
- role 必须是 ADMIN / USER

导入预览：
- username 为空标记失败
- role 非法标记失败
- password 少于 8 位标记失败
- 重复用户名标记失败
```

## 3. Excel / CSV 导入实现方案

前端支持两种文件：

```txt
.csv
.xlsx
```

推荐新增依赖：

```txt
xlsx
```

导入流程：

```txt
1. 管理员点击“批量导入”
2. 打开 Dialog
3. 上传 .csv 或 .xlsx 文件
4. 前端解析文件
5. 显示预览表格
6. 对每行做基础校验
7. 点击“确认导入”
8. 调用 /api/users/bulk
9. 服务端再次校验 ADMIN 和数据合法性
10. 服务端检查数据库重复用户名
11. 返回导入结果
12. Dialog 展示总数、成功数、失败数、失败原因、重复用户名列表
```

CSV 格式：

```csv
username,role,password
alice,USER,alice123456
bob,ADMIN,bob123456
chen,,
```

Excel 格式：

```txt
第一个 Sheet
第一行表头：
username | role | password

从第二行开始读取用户数据
```

解析规则：

```txt
username 必填
role 可选，默认 USER
password 可选，留空使用 DEFAULT_USER_PASSWORD
role 只允许 ADMIN / USER
password 如填写必须 >= 8 位
空行跳过
```

前端预览数据结构：

```ts
type ImportPreviewRow = {
  row: number
  username: string
  role: "ADMIN" | "USER" | string
  password: string
  status: "valid" | "invalid"
  reason?: string
}
```

服务端返回结构增强：

```ts
type ImportResult = {
  totalCount: number
  successCount: number
  failedCount: number
  duplicateUsernames: string[]
  failed: Array<{
    row: number
    username?: string
    reason: string
  }>
}
```

说明：

```txt
前端预览是体验层校验。
服务端 /api/users/bulk 仍是最终安全边界。
```

## 4. 多选删除与服务端校验方案

前端行为：

```txt
用户表格第一列增加 Checkbox
支持当前页全选
支持单行选择
选中后顶部出现批量操作栏
点击批量删除弹出 ConfirmDialog
确认后调用批量删除 API
删除成功后清空选择并刷新列表
```

新增 API：

```txt
DELETE /api/users/bulk
```

请求体：

```ts
{
  ids: string[]
}
```

服务端校验：

```txt
1. 必须登录
2. 必须 ADMIN
3. ids 必须是非空数组
4. 不能删除当前登录用户
5. 查询目标用户列表
6. 如果目标中包含管理员：
   - 计算删除后剩余管理员数量
   - 若剩余管理员数量 < 1，则拒绝
7. 执行 deleteMany
8. 返回删除数量和跳过原因
```

返回结构：

```ts
type BulkDeleteResult = {
  deletedCount: number
  failed: Array<{
    id: string
    username?: string
    reason: string
  }>
}
```

单个删除沿用现有接口，但保留同样规则：

```txt
不能删除自己
不能删除最后一个管理员
必须服务端 ADMIN 校验
```

前端二次确认文案：

```txt
确认删除选中的 N 个用户？
该操作不可撤销。系统会自动阻止删除当前账号和最后一个管理员。
```

## 5. 对话 / 图片 / 视频页高保真结构方案

### 对话页 `/chat`

```txt
整体布局：
- 左侧：历史会话列表
- 中间：聊天主区域
- 右侧：参考资料 / 模型信息面板
- 移动端：隐藏左右侧栏，主聊天区优先

顶部：
- 当前会话标题
- 模型切换器
- 新建对话按钮

聊天区：
- 用户消息气泡
- AI 消息气泡
- 代码/步骤式回复卡片
- 时间或状态提示

建议问题：
- 3-4 个建议 prompt
- 点击后填入输入框

输入区：
- 多行输入框
- 附件上传按钮
- 发送按钮
- 当前模型提示
```

### 图片生成页 `/image`

```txt
整体布局：
- 左侧：参数面板
- 中间：图片结果宫格
- 右侧：任务历史
- 移动端：参数区在上，结果区在中，历史折叠到下方

参数面板：
- Prompt
- 风格：写实 / 产品 / 建筑 / 插画 / 电影感
- 比例：1:1 / 4:3 / 16:9 / 9:16
- 数量：1 / 2 / 4
- 模型选择
- 生成按钮

结果宫格：
- 2x2 图片卡片
- hover 显示操作：
  - 预览
  - 下载
  - 复用提示词
  - 收藏
- 图片使用静态渐变/占位视觉或 public 静态图

历史条：
- 缩略图
- 任务名
- 时间
- 状态
```

### 视频生成页 `/video`

```txt
整体布局：
- 左侧：参数面板
- 中间：视频预览卡
- 右侧：历史任务列表
- 移动端纵向堆叠

参数面板：
- Prompt
- 时长：5s / 10s / 15s
- 比例：16:9 / 9:16 / 1:1
- 镜头运动：固定 / 推进 / 环绕 / 平移
- 风格：写实 / 产品 / 科幻 / 建筑
- 生成按钮

视频预览：
- 大预览卡
- 播放按钮
- 状态 Badge：已完成 / 生成中 / 排队中
- 基础信息：时长、比例、模型

历史任务：
- 缩略图
- 标题
- 状态
- 创建时间
```

## 6. 第二阶段开发顺序

```txt
1. 安装新增依赖
- xlsx
- 如需要补充 clsx 可选，但当前已有 cn 工具可继续使用

2. 全局 UI 增强
- Checkbox
- Select
- EmptyState
- Skeleton
- Pagination
- ConfirmDialog
- FileUpload 基础样式

3. 用户 API 增强
- /api/users 支持 search、role、page、pageSize
- /api/users/bulk 返回 totalCount、duplicateUsernames
- 新增 DELETE /api/users/bulk
- 保留服务端 ADMIN 校验

4. 用户管理页增强
- 搜索、筛选、分页
- 表格复选框
- 当前页全选
- 批量操作栏
- 批量删除 Dialog
- Excel / CSV 上传解析预览
- 导入结果展示

5. 系统交互完善
- Loading / Skeleton
- EmptyState
- Toast 文案统一
- Dialog 样式复用
- 表单校验提示

6. 对话页高保真
- 左侧会话列表
- 中间消息区
- 输入区
- 建议问题
- 右侧参考面板

7. 图片生成页高保真
- 参数面板
- 结果宫格
- hover 操作
- 历史条

8. 视频生成页高保真
- 参数面板
- 视频预览
- 状态标签
- 历史任务

9. 布局优化
- 主内容区更铺满
- 列表页宽度优化
- 功能页桌面端三栏结构
- 移动端堆叠与底部导航检查

10. 验证
- 管理员导入 .csv / .xlsx
- 重复用户名返回失败原因
- 普通用户不能访问用户管理 API
- 批量删除不能删除自己
- 批量删除不能删掉最后一个管理员
- 三个核心功能页视觉统一
```
