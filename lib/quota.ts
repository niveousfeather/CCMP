import { prisma } from "@/lib/db";

export type FeatureType = "image" | "video" | "model3d";
export type AppRole = "ADMIN" | "TEACHER" | "STUDENT";

type RoleQuotaLimits = {
  imageDailyLimit: number;
  videoDailyLimit: number;
  model3DDailyLimit: number;
};

export const DEFAULT_ROLE_QUOTAS: Record<AppRole, RoleQuotaLimits> = {
  ADMIN: { imageDailyLimit: 9999, videoDailyLimit: 9999, model3DDailyLimit: 9999 },
  TEACHER: { imageDailyLimit: 50, videoDailyLimit: 10, model3DDailyLimit: 10 },
  STUDENT: { imageDailyLimit: 10, videoDailyLimit: 2, model3DDailyLimit: 2 }
};

export function getDefaultUserQuota() {
  const value = Number(process.env.DEFAULT_USER_QUOTA || 100);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 100;
}

export async function ensureUserQuota(userId: string) {
  const existing = await prisma.userQuota.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.userQuota.create({
    data: {
      userId,
      totalQuota: getDefaultUserQuota(),
      usedQuota: 0
    }
  });
}

export async function consumeUserQuota(userId: string, amount = 1) {
  const quota = await ensureUserQuota(userId);
  const remainingQuota = quota.totalQuota - quota.usedQuota;
  if (remainingQuota < amount) {
    return { ok: false as const, quota };
  }

  const updated = await prisma.userQuota.update({
    where: { userId },
    data: { usedQuota: { increment: amount } }
  });

  return { ok: true as const, quota: updated };
}

export function normalizeRole(role?: string | null): AppRole {
  const value = String(role || "").trim().toUpperCase();
  if (value === "ADMIN" || value === "TEACHER" || value === "STUDENT") return value;
  if (value === "USER") return "TEACHER";
  return "TEACHER";
}

export function normalizeFeatureType(featureType: string): FeatureType {
  const value = String(featureType || "").trim().toLowerCase();
  if (value === "video") return "video";
  if (value === "model3d" || value === "3d") return "model3d";
  return "image";
}

function getFeatureLimit(quota: RoleQuotaLimits, featureType: FeatureType) {
  if (featureType === "video") return quota.videoDailyLimit;
  if (featureType === "model3d") return quota.model3DDailyLimit;
  return quota.imageDailyLimit;
}

function getFeatureLabel(featureType: FeatureType) {
  if (featureType === "video") return "视频生成";
  if (featureType === "model3d") return "3D生成";
  return "图片生成";
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function ensureRoleQuotas() {
  const prismaWithRoleQuota = prisma as typeof prisma & {
    roleQuota: {
      upsert: (args: {
        where: { role: AppRole };
        update: Record<string, never>;
        create: { role: AppRole } & RoleQuotaLimits;
      }) => Promise<unknown>;
    };
  };

  await Promise.all(
    (Object.keys(DEFAULT_ROLE_QUOTAS) as AppRole[]).map((role) =>
      prismaWithRoleQuota.roleQuota.upsert({
        where: { role },
        update: {},
        create: {
          role,
          imageDailyLimit: DEFAULT_ROLE_QUOTAS[role].imageDailyLimit,
          videoDailyLimit: DEFAULT_ROLE_QUOTAS[role].videoDailyLimit,
          model3DDailyLimit: DEFAULT_ROLE_QUOTAS[role].model3DDailyLimit
        }
      })
    )
  );
}

export async function getUserRole(userId: string): Promise<AppRole> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return normalizeRole(user?.role);
}

export async function getRoleQuota(roleInput: string) {
  const role = normalizeRole(roleInput);
  const fallback = DEFAULT_ROLE_QUOTAS[role];
  const prismaWithRoleQuota = prisma as typeof prisma & {
    roleQuota: {
      findUnique: (args: { where: { role: AppRole } }) => Promise<(RoleQuotaLimits & { role?: AppRole }) | null>;
    };
  };
  const quota = await prismaWithRoleQuota.roleQuota.findUnique({ where: { role } });
  return {
    role,
    imageDailyLimit: quota?.imageDailyLimit ?? fallback.imageDailyLimit,
    videoDailyLimit: quota?.videoDailyLimit ?? fallback.videoDailyLimit,
    model3DDailyLimit: quota?.model3DDailyLimit ?? fallback.model3DDailyLimit
  };
}

export async function getTodayUsageCount(userId: string, featureTypeInput: FeatureType) {
  const featureType = normalizeFeatureType(featureTypeInput);
  const { start, end } = getTodayRange();
  const prismaWithUsageRecord = prisma as typeof prisma & {
    usageRecord: {
      count: (args: {
        where: {
          userId: string;
          featureType: FeatureType;
          createdAt: { gte: Date; lt: Date };
        };
      }) => Promise<number>;
    };
  };

  return prismaWithUsageRecord.usageRecord.count({
    where: {
      userId,
      featureType,
      createdAt: {
        gte: start,
        lt: end
      }
    }
  });
}

export async function getUserDailyQuota(userId: string) {
  const role = await getUserRole(userId);
  const quota = await getRoleQuota(role);
  const [imageUsedToday, videoUsedToday, model3DUsedToday] = await Promise.all([
    getTodayUsageCount(userId, "image"),
    getTodayUsageCount(userId, "video"),
    getTodayUsageCount(userId, "model3d")
  ]);

  return {
    role,
    imageDailyLimit: quota.imageDailyLimit,
    videoDailyLimit: quota.videoDailyLimit,
    model3DDailyLimit: quota.model3DDailyLimit,
    imageUsedToday,
    videoUsedToday,
    model3DUsedToday,
    imageRemaining: Math.max(quota.imageDailyLimit - imageUsedToday, 0),
    videoRemaining: Math.max(quota.videoDailyLimit - videoUsedToday, 0),
    model3DRemaining: Math.max(quota.model3DDailyLimit - model3DUsedToday, 0)
  };
}

export async function checkAndConsumeQuota(userId: string, featureTypeInput: FeatureType, relatedTaskId?: string) {
  const featureType = normalizeFeatureType(featureTypeInput);
  const role = await getUserRole(userId);
  const quota = await getRoleQuota(role);
  const limit = getFeatureLimit(quota, featureType);
  const used = await getTodayUsageCount(userId, featureType);
  const remaining = Math.max(limit - used, 0);

  if (used >= limit) {
    return {
      ok: false as const,
      code: "DAILY_QUOTA_EXCEEDED",
      featureType,
      role,
      limit,
      used,
      remaining: 0,
      message: `${getFeatureLabel(featureType)}今日次数已用完，请明天再试或联系管理员调整额度。`
    };
  }

  const prismaWithUsageRecord = prisma as typeof prisma & {
    usageRecord: {
      create: (args: {
        data: {
          userId: string;
          featureType: FeatureType;
          relatedTaskId?: string;
          status: string;
        };
      }) => Promise<unknown>;
    };
  };

  await prismaWithUsageRecord.usageRecord.create({
    data: {
      userId,
      featureType,
      relatedTaskId,
      status: "submitted"
    }
  });

  return {
    ok: true as const,
    featureType,
    role,
    limit,
    used: used + 1,
    remaining: Math.max(limit - used - 1, 0)
  };
}
