import { redirect } from "next/navigation";

import { UsersClient } from "@/components/users/users-client";
import { getCurrentUser } from "@/lib/session";

export default async function UsersPage() {
  const user = await getCurrentUser();

  if (user?.role !== "ADMIN") {
    redirect("/workspace");
  }

  return <UsersClient />;
}
