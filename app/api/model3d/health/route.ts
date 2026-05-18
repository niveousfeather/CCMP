import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { createTripoModel3DClient } from "@/lib/model3d/tripo";

function isAuthorizedCronRequest(request: NextRequest) {
  const token = process.env.MODEL3D_HEALTH_CRON_TOKEN?.trim();
  return Boolean(token && request.headers.get("x-nexus-cron-token") === token);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    const { response } = await requireUser();
    if (response) return response;
  }

  try {
    await createTripoModel3DClient().getWallet();
    return NextResponse.json({
      ok: true,
      provider: "tripo",
      status: "available",
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "tripo",
        status: "unavailable",
        message: error instanceof Error ? error.message : "Nexus 3D health check failed.",
        checkedAt: new Date().toISOString()
      },
      { status: 200 }
    );
  }
}
