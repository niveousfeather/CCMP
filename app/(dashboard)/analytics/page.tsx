import { redirect } from "next/navigation";

import { AdminAnalyticsClient } from "@/components/admin-analytics/admin-analytics-client";
import { isPlatformOwnerAdmin } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();

  if (!isPlatformOwnerAdmin(user)) {
    redirect("/workspace");
  }

  return <AdminAnalyticsClient />;
}
