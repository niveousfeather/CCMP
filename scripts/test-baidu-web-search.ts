import { fetchBaiduWebSearch } from "../lib/agent/tools/web-context";

async function main() {
  const query = process.argv.slice(2).join(" ").trim() || "NexusAI 内部 AI 工具平台";
  const result = await fetchBaiduWebSearch(query);

  console.log(`provider: ${result.provider}`);
  console.log(`mode: ${process.env.AGENT_WEB_SEARCH_MODE || "web_search"}`);
  console.log(`query: ${result.query}`);
  if (result.rawMeta?.requestId) console.log(`requestId: ${result.rawMeta.requestId}`);
  console.log(`summary: ${result.summary || "无摘要"}`);
  console.log("");
  console.log("items:");
  for (const item of result.items) {
    console.log(`- ${item.title}`);
    if (item.url) console.log(`  url: ${item.url}`);
    if (item.snippet) console.log(`  snippet: ${item.snippet.slice(0, 180)}`);
  }
}

main().catch((error) => {
  console.error(`Baidu web search test failed: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
