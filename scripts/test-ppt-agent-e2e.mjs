import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const tsxCli = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

if (!existsSync(tsxCli)) {
  throw new Error("Unable to find local tsx runtime. Run pnpm install before this test.");
}

const realImages = process.env.PRESENTATION_E2E_REAL_IMAGES === "true";

const env = {
  ...process.env,
  NODE_ENV: "test",
  ALLOW_LOCAL_STORAGE_FALLBACK: "true",
  PRESENTATION_PROVIDER: "local",
  AGENT_TASK_TIMEOUT_MS: "1000",
  CLAUDECODER_API_KEY: "",
  MOONSHOT_API_KEY: "",
  AGENT_KIMI_API_KEY: "",
  ALI_OSS_BUCKET: "",
  ALI_OSS_ACCESS_KEY_ID: "",
  ALI_OSS_ACCESS_KEY_SECRET: "",
  ALI_OSS_ENDPOINT: ""
};

if (!realImages) {
  env.PRESENTATION_IMAGE_MAX_SLIDES = "0";
  env.PRESENTATION_IMAGE_SEARCH_ENABLED = "false";
  env.PRESENTATION_IMAGE_GENERATION_ENABLED = "false";
}

const result = spawnSync(process.execPath, [tsxCli, "scripts/test-ppt-agent-e2e.ts"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
