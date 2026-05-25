import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

const root = process.cwd();

function rel(path: string) {
  return join(root, path);
}

function read(path: string) {
  return readFileSync(rel(path), "utf8");
}

function exists(path: string) {
  return existsSync(rel(path));
}

function listFiles(path: string): string[] {
  const abs = rel(path);
  if (!existsSync(abs)) return [];
  const entries = readdirSync(abs);
  return entries.flatMap((entry) => {
    const full = join(abs, entry);
    const relative = join(path, entry);
    return statSync(full).isDirectory() ? listFiles(relative) : [relative];
  });
}

function containsAny(content: string, terms: string[]) {
  return terms.find((term) => content.includes(term)) || null;
}

const pagePath = "app/(dashboard)/smart-tools/capability-map/page.tsx";
const apiPath = "app/api/capability-map/course-ability-graph/route.ts";
const smartToolsPath = "components/smart-tools/smart-tools-data.ts";
const capabilityFiles = [
  pagePath,
  apiPath,
  ...listFiles("components/capability-map"),
  "lib/capability-map/course-ability-graph.ts",
  "lib/capability-map/types.ts"
].filter((file) => /\.(ts|tsx|css|md)$/.test(file));

const combined = capabilityFiles
  .filter((file) => exists(file))
  .map((file) => `\n/* ${file} */\n${read(file)}`)
  .join("\n");

const smartTools = exists(smartToolsPath) ? read(smartToolsPath) : "";
const forbiddenChat = containsAny(combined, ["/api/ai/chat", "api/ai/chat"]);
const forbiddenTask = containsAny(combined, ["taskCard", "generatedFiles"]);
const forbiddenRuntime = containsAny(combined, ["lib/agent/runtime", "@/lib/agent/runtime"]);
const forbiddenOffice = containsAny(combined, ["word-engine", "excel-engine", "academic-ppt", "pptx-writer"]);
const forbiddenDataWrite = containsAny(combined, ["writeFile", "appendFile", "mkdir"]);

const checks: Check[] = [
  {
    name: "smart tools capability-map page exists",
    pass: exists(pagePath)
  },
  {
    name: "components/capability-map has implementation files",
    pass: listFiles("components/capability-map").some((file) => file.endsWith(".tsx"))
  },
  {
    name: "lib/capability-map has course ability graph logic",
    pass: exists("lib/capability-map/course-ability-graph.ts")
  },
  {
    name: "capability-map API route exists",
    pass: exists(apiPath)
  },
  {
    name: "smart tools data contains capability map card",
    pass: /id:\s*"capability-map"/.test(smartTools) && smartTools.includes("能力图谱")
  },
  {
    name: "smart tools card routes to /smart-tools/capability-map",
    pass: smartTools.includes('href: "/smart-tools/capability-map"')
  },
  {
    name: "capability map does not call /api/ai/chat",
    pass: !forbiddenChat,
    detail: forbiddenChat || undefined
  },
  {
    name: "capability map does not create task cards or generated files",
    pass: !forbiddenTask,
    detail: forbiddenTask || undefined
  },
  {
    name: "capability map does not import agent runtime",
    pass: !forbiddenRuntime,
    detail: forbiddenRuntime || undefined
  },
  {
    name: "capability map does not connect Word/Excel/PPT engines",
    pass: !forbiddenOffice,
    detail: forbiddenOffice || undefined
  },
  {
    name: "capability map does not write data files",
    pass: !forbiddenDataWrite,
    detail: forbiddenDataWrite || undefined
  }
];

const passed = checks.filter((check) => check.pass).length;

for (const check of checks) {
  const status = check.pass ? "PASS" : "FAIL";
  const detail = check.detail ? ` (${check.detail})` : "";
  console.log(`${status} ${check.name}${detail}`);
}

if (passed !== checks.length) {
  console.error(`Capability map integration checks failed. ${passed}/${checks.length} PASS.`);
  process.exit(1);
}

console.log(`Capability map integration checks passed. ${passed}/${checks.length} PASS.`);
