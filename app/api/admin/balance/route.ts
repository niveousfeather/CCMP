import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";

const BALANCE_TIMEOUT_MS = 15_000;

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getXheaiRootUrl() {
  return (process.env.XHEAI_BASE_URL || "https://api.xheai.cc").replace(/\/v1\/?$/, "");
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKey = process.env.XHEAI_BALANCE_TOKEN || process.env.XHEAI_API_KEY;
  if (!apiKey) {
    return jsonError("MISSING_API_KEY", "余额服务暂未配置，请联系管理员。", 500);
  }

  const url = joinUrl(getXheaiRootUrl(), "/api/open/balance");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS);

  try {
    const providerResponse = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    if (!providerResponse.ok) {
      console.error(`[admin:balance] status=${providerResponse.status} code=PROVIDER_ERROR`);
      return jsonError("PROVIDER_ERROR", "余额查询暂时不可用，请稍后重试。", 502);
    }

    const data = await providerResponse.json().catch(() => null);
    const remainAmount = data?.data?.remain_amount ?? data?.remain_amount;
    const remainQuota = data?.data?.remain_quota ?? data?.remain_quota;

    if (typeof remainAmount !== "number" || typeof remainQuota !== "number") {
      console.error("[admin:balance] status=200 code=BAD_PROVIDER_RESPONSE");
      return jsonError("BAD_PROVIDER_RESPONSE", "余额服务返回异常，请稍后重试。", 502);
    }

    return NextResponse.json({
      remain_amount: remainAmount,
      remain_quota: remainQuota
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[admin:balance] code=TIMEOUT");
      return jsonError("TIMEOUT", "余额查询超时，请稍后重试。", 504);
    }

    console.error("[admin:balance] code=PROVIDER_ERROR");
    return jsonError("PROVIDER_ERROR", "余额查询暂时不可用，请稍后重试。", 502);
  } finally {
    clearTimeout(timer);
  }
}
