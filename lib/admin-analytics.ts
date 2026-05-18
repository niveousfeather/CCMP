import { prisma } from "@/lib/db";

export type AdminAnalyticsMetric = {
  id: string;
  label: string;
  value: string;
  helper: string;
  delta: string;
};

export type AdminAnalyticsBreakdownItem = {
  id: string;
  label: string;
  value: number;
  displayValue: string;
  percent: number;
};

export type AdminAnalyticsTrendPoint = {
  date: string;
  label: string;
  image: number;
  video: number;
  model3d: number;
  chat: number;
  total: number;
};

export type AdminAnalyticsErrorItem = {
  id: string;
  module: string;
  route?: string;
  provider?: string;
  message: string;
  status: string;
  createdAt: string;
};

type AdminAnalyticsStatusGroup = "success" | "running" | "failed" | "other";

export type AdminAnalyticsUserItem = {
  id: string;
  username: string;
  role: string;
  total: number;
  image: number;
  video: number;
  model3d: number;
};

export type AdminAnalyticsTaskItem = {
  id: string;
  userId: string;
  username?: string;
  module: "image" | "video" | "model3d" | "chat";
  title: string;
  status: string;
  statusGroup: AdminAnalyticsStatusGroup;
  createdAt: string;
  detail?: string | null;
};

export type AdminAnalyticsData = {
  generatedAt: string;
  metrics: AdminAnalyticsMetric[];
  usageBreakdown: AdminAnalyticsBreakdownItem[];
  statusBreakdown: AdminAnalyticsBreakdownItem[];
  trends: AdminAnalyticsTrendPoint[];
  dailyTable: AdminAnalyticsTrendPoint[];
  errors: {
    total: number;
    latest: AdminAnalyticsErrorItem[];
  };
  details: {
    recentTasks: AdminAnalyticsTaskItem[];
    successTasks: AdminAnalyticsTaskItem[];
    failedTasks: AdminAnalyticsTaskItem[];
    users: AdminAnalyticsUserItem[];
  };
  topUsers: AdminAnalyticsUserItem[];
};

type CountableRecord = {
  createdAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDateTime(value: Date) {
  return value.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTrendLabel(value: Date) {
  return value.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function countInRange(records: CountableRecord[], start: Date, end: Date) {
  return records.filter((record) => record.createdAt >= start && record.createdAt < end).length;
}

function getPercent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function makeBreakdown(items: Array<{ id: string; label: string; value: number }>): AdminAnalyticsBreakdownItem[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return items.map((item) => ({
    ...item,
    displayValue: formatNumber(item.value),
    percent: getPercent(item.value, total)
  }));
}

function normalizeStatus(status?: string | null): AdminAnalyticsStatusGroup {
  const value = String(status || "").toLowerCase();
  if (["completed", "success", "succeeded"].includes(value)) return "success";
  if (["failed", "fail", "error", "timeout"].includes(value)) return "failed";
  if (["processing", "pending", "running", "queued", "retrying"].includes(value)) return "running";
  return "other";
}

function statusLabel(status: string) {
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  if (status === "running") return "处理中";
  return "其他";
}

function trendKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function makeTitle(text: string, fallback: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || fallback;
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);
  const trendStart = addDays(todayStart, -6);

  const [
    userCount,
    usageRecords,
    imageGenerations,
    videoGenerations,
    model3DGenerations,
    chatConversations,
    topUsageUsers
  ] = await Promise.all([
    prisma.user.count(),
    prisma.usageRecord.findMany({
      where: { createdAt: { gte: trendStart } },
      orderBy: { createdAt: "asc" },
      select: { featureType: true, status: true, createdAt: true, userId: true }
    }),
    prisma.imageGeneration.findMany({
      where: { createdAt: { gte: trendStart } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, prompt: true, finalPrompt: true, status: true, failureReason: true, createdAt: true }
    }),
    prisma.videoGeneration.findMany({
      where: { createdAt: { gte: trendStart } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, prompt: true, status: true, errorMessage: true, createdAt: true }
    }),
    prisma.model3DGeneration.findMany({
      where: { createdAt: { gte: trendStart } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, prompt: true, title: true, status: true, errorMessage: true, createdAt: true }
    }),
    prisma.chatConversation.findMany({
      where: { createdAt: { gte: trendStart } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, title: true, createdAt: true }
    }),
    prisma.user.findMany({
      orderBy: { updated_at: "desc" },
      take: 100,
      select: { id: true, username: true, role: true }
    })
  ]);

  const errorLogs = await prisma.errorLog
    .findMany({
      where: { createdAt: { gte: trendStart } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, route: true, provider: true, status: true, message: true, createdAt: true }
    })
    .catch(() => []);

  const imageToday = countInRange(imageGenerations, todayStart, tomorrowStart);
  const videoToday = countInRange(videoGenerations, todayStart, tomorrowStart);
  const model3DToday = countInRange(model3DGenerations, todayStart, tomorrowStart);
  const chatToday = countInRange(chatConversations, todayStart, tomorrowStart);
  const todayTotal = imageToday + videoToday + model3DToday + chatToday;

  const yesterdayTotal =
    countInRange(imageGenerations, yesterdayStart, todayStart) +
    countInRange(videoGenerations, yesterdayStart, todayStart) +
    countInRange(model3DGenerations, yesterdayStart, todayStart) +
    countInRange(chatConversations, yesterdayStart, todayStart);

  const allTaskStatuses = [
    ...imageGenerations.map((item) => normalizeStatus(item.status)),
    ...videoGenerations.map((item) => normalizeStatus(item.status)),
    ...model3DGenerations.map((item) => normalizeStatus(item.status))
  ];
  const taskTotal = allTaskStatuses.length;
  const failedTotal = allTaskStatuses.filter((status) => status === "failed").length;
  const successTotal = allTaskStatuses.filter((status) => status === "success").length;
  const successRate = taskTotal ? (successTotal / taskTotal) * 100 : 0;

  const usageBreakdown = makeBreakdown([
    { id: "image", label: "图片生成", value: imageGenerations.length },
    { id: "video", label: "视频生成", value: videoGenerations.length },
    { id: "model3d", label: "3D生成", value: model3DGenerations.length },
    { id: "chat", label: "Nexus Agent", value: chatConversations.length }
  ]);

  const statusBreakdown = makeBreakdown([
    { id: "success", label: statusLabel("success"), value: successTotal },
    { id: "running", label: statusLabel("running"), value: allTaskStatuses.filter((status) => status === "running").length },
    { id: "failed", label: statusLabel("failed"), value: failedTotal },
    { id: "other", label: statusLabel("other"), value: allTaskStatuses.filter((status) => status === "other").length }
  ]);

  const trends: AdminAnalyticsTrendPoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(trendStart, index);
    const nextDate = addDays(date, 1);
    const image = countInRange(imageGenerations, date, nextDate);
    const video = countInRange(videoGenerations, date, nextDate);
    const model3d = countInRange(model3DGenerations, date, nextDate);
    const chat = countInRange(chatConversations, date, nextDate);
    return {
      date: trendKey(date),
      label: formatTrendLabel(date),
      image,
      video,
      model3d,
      chat,
      total: image + video + model3d + chat
    };
  });

  const fallbackErrors: AdminAnalyticsErrorItem[] = [
    ...imageGenerations
      .filter((item) => normalizeStatus(item.status) === "failed" || item.failureReason)
      .map((item) => ({
        id: item.id,
        module: "图片生成",
        message: item.failureReason || "图片任务失败",
        status: item.status,
        createdAt: formatDateTime(item.createdAt)
      })),
    ...videoGenerations
      .filter((item) => normalizeStatus(item.status) === "failed" || item.errorMessage)
      .map((item) => ({
        id: item.id,
        module: "视频生成",
        message: item.errorMessage || "视频任务失败",
        status: item.status,
        createdAt: formatDateTime(item.createdAt)
      })),
    ...model3DGenerations
      .filter((item) => normalizeStatus(item.status) === "failed" || item.errorMessage)
      .map((item) => ({
        id: item.id,
        module: "3D生成",
        message: item.errorMessage || "3D 任务失败",
        status: item.status,
        createdAt: formatDateTime(item.createdAt)
      }))
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8);

  const latestErrors: AdminAnalyticsErrorItem[] = errorLogs.length
    ? errorLogs.map((item) => ({
        id: item.id,
        module: item.route.includes("model3d")
          ? "3D生成"
          : item.route.includes("video")
            ? "视频生成"
            : item.route.includes("image")
              ? "图片生成"
              : "系统",
        route: item.route,
        provider: item.provider || undefined,
        message: item.message,
        status: item.status ? String(item.status) : "failed",
        createdAt: formatDateTime(item.createdAt)
      }))
    : fallbackErrors;

  const userUsage = new Map<string, AdminAnalyticsUserItem>();
  for (const user of topUsageUsers) {
    userUsage.set(user.id, {
      id: user.id,
      username: user.username,
      role: user.role,
      total: 0,
      image: 0,
      video: 0,
      model3d: 0
    });
  }

  for (const record of usageRecords) {
    const target = userUsage.get(record.userId);
    if (!target) continue;
    target.total += 1;
    if (record.featureType === "image") target.image += 1;
    if (record.featureType === "video") target.video += 1;
    if (record.featureType === "model3d") target.model3d += 1;
  }

  const topUsers = [...userUsage.values()].filter((item) => item.total > 0).sort((left, right) => right.total - left.total).slice(0, 6);
  const userNameById = new Map(topUsageUsers.map((user) => [user.id, user.username]));
  const recentTasks: AdminAnalyticsTaskItem[] = [
    ...imageGenerations.map((item) => ({
      id: item.id,
      userId: item.userId,
      username: userNameById.get(item.userId),
      module: "image" as const,
      title: makeTitle(item.finalPrompt || item.prompt, "图片生成"),
      status: item.status,
      statusGroup: normalizeStatus(item.status),
      createdAt: formatDateTime(item.createdAt),
      detail: item.failureReason || item.prompt
    })),
    ...videoGenerations.map((item) => ({
      id: item.id,
      userId: item.userId,
      username: userNameById.get(item.userId),
      module: "video" as const,
      title: makeTitle(item.prompt, "视频生成"),
      status: item.status,
      statusGroup: normalizeStatus(item.status),
      createdAt: formatDateTime(item.createdAt),
      detail: item.errorMessage || item.prompt
    })),
    ...model3DGenerations.map((item) => ({
      id: item.id,
      userId: item.userId,
      username: userNameById.get(item.userId),
      module: "model3d" as const,
      title: item.title || makeTitle(item.prompt, "3D生成"),
      status: item.status,
      statusGroup: normalizeStatus(item.status),
      createdAt: formatDateTime(item.createdAt),
      detail: item.errorMessage || item.prompt
    })),
    ...chatConversations.map((item) => ({
      id: item.id,
      userId: item.userId,
      username: userNameById.get(item.userId),
      module: "chat" as const,
      title: item.title || "Nexus Agent 对话",
      status: "active",
      statusGroup: "success" as const,
      createdAt: formatDateTime(item.createdAt),
      detail: "对话记录已创建"
    }))
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    generatedAt: formatDateTime(now),
    metrics: [
      {
        id: "today",
        label: "今日请求",
        value: formatNumber(todayTotal),
        helper: "对话、图片、视频、3D 的今日创建量",
        delta: yesterdayTotal ? `较昨日 ${todayTotal >= yesterdayTotal ? "+" : ""}${formatPercent(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)}` : "昨日暂无数据"
      },
      {
        id: "success",
        label: "任务成功率",
        value: formatPercent(successRate),
        helper: "近 7 天图片、视频、3D 任务状态",
        delta: `${formatNumber(successTotal)}/${formatNumber(taskTotal)} 成功`
      },
      {
        id: "errors",
        label: "失败任务",
        value: formatNumber(failedTotal),
        helper: "近 7 天可追踪失败记录",
        delta: failedTotal ? "建议查看错误分析" : "暂无明显异常"
      },
      {
        id: "users",
        label: "平台用户",
        value: formatNumber(userCount),
        helper: "当前系统账户总数",
        delta: `${formatNumber(topUsers.length)} 个活跃账户`
      }
    ],
    usageBreakdown,
    statusBreakdown,
    trends,
    dailyTable: trends,
    errors: {
      total: errorLogs.length || fallbackErrors.length,
      latest: latestErrors
    },
    details: {
      recentTasks: recentTasks.slice(0, 28),
      successTasks: recentTasks.filter((item) => item.statusGroup === "success").slice(0, 20),
      failedTasks: recentTasks.filter((item) => item.statusGroup === "failed").slice(0, 20),
      users: [...userUsage.values()].sort((left, right) => right.total - left.total)
    },
    topUsers
  };
}
