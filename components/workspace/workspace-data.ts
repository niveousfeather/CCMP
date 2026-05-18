import { BarChart3, Bot, Box, Image, Network, Settings2, Users, Video } from "lucide-react";

export const quickActions = [
  {
    id: "chat",
    title: "Nexus Agent",
    description: "进入智能体对话，处理写作、资料分析和多模态创作",
    href: "/chat",
    icon: Bot,
    adminOnly: false,
    actionLabel: "开始对话"
  },
  {
    id: "image",
    title: "图片生成",
    description: "生成视觉素材、海报图和参考图，结果自动进入历史",
    href: "/image",
    icon: Image,
    adminOnly: false,
    actionLabel: "生成图片"
  },
  {
    id: "video",
    title: "视频生成",
    description: "提交视频任务，跟踪生成状态并回看历史结果",
    href: "/video",
    icon: Video,
    adminOnly: false,
    actionLabel: "生成视频"
  },
  {
    id: "graph",
    title: "知识图谱",
    description: "把主题、资料和知识点整理成可视化结构",
    href: "/chat?view=graph",
    icon: Network,
    adminOnly: false,
    actionLabel: "绘制图谱"
  },
  {
    id: "model3d",
    title: "Nexus 3D",
    description: "生成、预览并管理 3D 模型资源，结果进入统一历史记录",
    href: "/model3d",
    icon: Box,
    adminOnly: false,
    actionLabel: "进入 3D 工作区"
  },
  {
    id: "analytics",
    title: "数据分析",
    description: "查看平台使用趋势、任务状态、错误请求和活跃账户",
    href: "/analytics",
    icon: BarChart3,
    adminOnly: true,
    actionLabel: "查看分析"
  },
  {
    id: "users",
    title: "用户管理",
    description: "管理角色、配额和账号基础信息",
    href: "/users",
    icon: Users,
    adminOnly: true,
    actionLabel: "管理用户"
  }
] as const;

export const recentTasks = [
  { id: "task-1", title: "内部知识问答整理", type: "对话", status: "已完成", time: "最近" },
  { id: "task-2", title: "工作汇报配图生成", type: "图片", status: "已完成", time: "最近" },
  { id: "task-3", title: "产品说明文案优化", type: "对话", status: "已完成", time: "最近" },
  { id: "task-4", title: "团队素材方案归档", type: "图片", status: "已完成", time: "最近" }
] as const;

export const modelStatuses = [
  { id: "ultra", name: "Nexus Agent", capability: "智能体调度 / 联网 / 文件理解", status: "可用", latency: "按上游模型返回" },
  { id: "image-pro", name: "Nexus Image2", capability: "图片生成 / 参考图创作", status: "可用", latency: "按任务队列返回" },
  { id: "video-pro", name: "Nexus Video3.0", capability: "视频生成 / 参考图驱动", status: "可用", latency: "按任务队列返回" },
  { id: "model3d-pro", name: "Nexus 3D", capability: "3D 生成 / 模型处理 / 导出", status: "健康检查", latency: "每天 08:00 可由服务器定时检查" }
] as const;

export const workspaceHighlights = [
  { id: "scope", label: "数据范围", value: "按账号权限" },
  { id: "history", label: "历史记录", value: "已持久化" },
  { id: "storage", label: "素材存储", value: "OSS 优先" }
] as const;

export const heroModel = {
  name: "Nexus Agent",
  description: "平台级智能创作中枢，统一调度对话、联网、文件理解与多模态生成链路。",
  icon: Settings2
};
