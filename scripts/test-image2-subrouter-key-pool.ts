import { getImageModelCapability } from "@/lib/image/config";
import {
  generateSubrouterImage2,
  getImage2Config,
  getImage2KeyPoolSnapshot,
  hasImage2ApiKeys,
  resetImage2KeyPoolForTests
} from "@/lib/image/subrouter";

type FetchCall = {
  token: string;
  body: string;
};

const originalEnv = {
  AGENT_TASK_API_KEY: process.env.AGENT_TASK_API_KEY,
  IMAGE2_API_KEY_1: process.env.IMAGE2_API_KEY_1,
  IMAGE2_API_KEY_2: process.env.IMAGE2_API_KEY_2,
  IMAGE2_API_KEY_3: process.env.IMAGE2_API_KEY_3,
  IMAGE2_BASE_URL: process.env.IMAGE2_BASE_URL,
  IMAGE2_MODEL: process.env.IMAGE2_MODEL,
  IMAGE2_MAX_CONCURRENT_PER_KEY: process.env.IMAGE2_MAX_CONCURRENT_PER_KEY,
  IMAGE2_REQUEST_TIMEOUT_MS: process.env.IMAGE2_REQUEST_TIMEOUT_MS,
  IMAGE2_RETRY_ENABLED: process.env.IMAGE2_RETRY_ENABLED
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetImage2KeyPoolForTests();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function main() {
  process.env.AGENT_TASK_API_KEY = "agent-task-key-must-not-be-used";
  delete process.env.IMAGE2_API_KEY_1;
  delete process.env.IMAGE2_API_KEY_2;
  delete process.env.IMAGE2_API_KEY_3;
  process.env.IMAGE2_BASE_URL = "https://subrouter.ai/v1";
  process.env.IMAGE2_MODEL = "gpt-image-2";
  process.env.IMAGE2_MAX_CONCURRENT_PER_KEY = "2";
  process.env.IMAGE2_REQUEST_TIMEOUT_MS = "300000";
  process.env.IMAGE2_RETRY_ENABLED = "true";
  resetImage2KeyPoolForTests();

  const capability = getImageModelCapability("gpt-image-2");
  assert(capability?.provider === "subrouter", `gpt-image-2 should default to subrouter: ${JSON.stringify(capability)}`);
  assert(capability.providerModel === "gpt-image-2", "gpt-image-2 provider model should remain gpt-image-2.");
  assert(!hasImage2ApiKeys(), "Image2 key detection must not use AGENT_TASK_API_KEY.");
  assert(getImage2Config().keys.length === 0, "Image2 config should only include IMAGE2_API_KEY_1/2/3.");

  process.env.IMAGE2_API_KEY_1 = "image-key-1";
  process.env.IMAGE2_API_KEY_2 = "image-key-2";
  process.env.IMAGE2_API_KEY_3 = "image-key-3";
  resetImage2KeyPoolForTests();
  assert(hasImage2ApiKeys(), "Image2 keys should be detected from IMAGE2_API_KEY_1/2/3.");

  const calls: FetchCall[] = [];
  const successfulFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const token = String(new Headers(init?.headers).get("authorization") || "").replace(/^Bearer\s+/i, "");
    calls.push({ token, body: String(init?.body || "") });
    return jsonResponse(200, {
      data: [{ b64_json: Buffer.from(`png:${token}`).toString("base64"), revised_prompt: "ok" }]
    });
  };

  const results = await Promise.all(
    [1, 2, 3].map((index) =>
      generateSubrouterImage2(
        {
          generationId: `parallel-${index}`,
          prompt: `prompt ${index}`,
          aspectRatio: "1:1",
          size: "1024x1024",
          imageSize: "1k",
          count: 1,
          image: null,
          signal: new AbortController().signal
        },
        { fetchImpl: successfulFetch }
      )
    )
  );

  assert(results.every((result) => result.images.length === 1), "Each mocked image2 request should return one image.");
  assert(
    calls.map((call) => call.token).join(",") === "image-key-1,image-key-2,image-key-3",
    `Concurrent requests should be distributed across keys, got ${calls.map((call) => call.token).join(",")}`
  );
  assert(calls.every((call) => !call.body.includes("agent-task-key-must-not-be-used")), "Image2 request body must not include the Agent task key.");

  resetImage2KeyPoolForTests();
  let attempt = 0;
  const failoverFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    attempt += 1;
    const token = String(new Headers(init?.headers).get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (attempt === 1) {
      assert(token === "image-key-1", `First attempt should use key 1, got ${token}`);
      return jsonResponse(524, { error: { message: "provider timeout" } });
    }
    assert(token === "image-key-2", `Retry should switch to key 2 after 524, got ${token}`);
    return jsonResponse(200, { data: [{ url: "https://example.com/generated.png" }] });
  };

  const failoverResult = await generateSubrouterImage2(
    {
      generationId: "failover",
      prompt: "test failover",
      aspectRatio: "16:9",
      size: "1792x1024",
      imageSize: "1k",
      count: 1,
      image: null,
      signal: new AbortController().signal
    },
    { fetchImpl: failoverFetch }
  );

  assert(failoverResult.images[0]?.url === "https://example.com/generated.png", "Failover request should return the second key result.");
  assert(failoverResult.attempts.length === 2, `Expected two attempts, got ${JSON.stringify(failoverResult.attempts)}`);
  const snapshot = getImage2KeyPoolSnapshot();
  assert(snapshot.find((item) => item.keyIndex === 1)?.disabledUntil, "524 should temporarily disable keyIndex=1.");
  assert(!JSON.stringify(snapshot).includes("image-key-"), "Key pool snapshot must not expose raw API keys.");

  console.log(JSON.stringify({ ok: true, distributedKeyIndexes: [1, 2, 3], failoverAttempts: failoverResult.attempts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
  restoreEnv();
  });
