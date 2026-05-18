import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const tsxCli = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

if (!existsSync(tsxCli)) {
  throw new Error("Unable to find local tsx runtime. Run pnpm install before this test.");
}

const result = spawnSync(process.execPath, [tsxCli, "scripts/test-ppt-file-upload-e2e.ts"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
