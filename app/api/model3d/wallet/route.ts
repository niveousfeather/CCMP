import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createTripoModel3DClient } from "@/lib/model3d/tripo";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  try {
    const client = createTripoModel3DClient();
    const wallet = await client.getWallet();
    return NextResponse.json({
      provider: "tripo",
      wallet
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tripo 账户余额查询失败。";
    const status = message.includes("TRIPO_API_KEY") ? 503 : 500;
    return jsonError("MODEL3D_WALLET_QUERY_FAILED", message, status);
  }
}
