import { WorkspaceOverview } from "@/components/workspace/workspace-overview";
import { isPlatformOwnerAdmin } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { getCurrentUser } from "@/lib/session";

export default async function WorkspacePage() {
  const user = await getCurrentUser();
  const stats = user ? await getDashboardStats(user) : null;

  return <WorkspaceOverview isAdmin={isPlatformOwnerAdmin(user)} stats={stats} />;
}
