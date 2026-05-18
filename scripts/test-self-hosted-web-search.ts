import { fetchSelfHostedWebSearch, fetchWebContext, getWebSearchConfig } from "../lib/agent/tools/web-context";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: pnpm exec tsx scripts/test-self-hosted-web-search.ts "重庆今天温度"');
    process.exit(1);
  }

  const config = getWebSearchConfig();
  console.log(`primary=${config.primary}`);
  console.log(`selfHostedEnabled=${config.selfHostedEnabled}`);
  console.log(`selfHostedEndpoint=${config.selfHostedEndpoint}`);
  console.log(`selfHostedEndpointValid=${config.selfHostedEndpointValid}`);
  console.log(`baiduFallbackConfigured=${config.hasApiKey}`);
  console.log("");

  const result = config.primary === "self_hosted"
    ? await fetchSelfHostedWebSearch(query)
    : await fetchWebContext(query).then((messages) => ({
        provider: "agent_context",
        query,
        summary: messages[0]?.content || "",
        items: []
      }));

  console.log(`provider=${result.provider}`);
  console.log(`query=${result.query}`);
  console.log(`summary=${result.summary}`);
  console.log("");

  result.items.slice(0, 8).forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`);
    console.log(`   ${item.url}`);
    if (item.snippet) console.log(`   ${item.snippet.slice(0, 280)}`);
    console.log("");
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Self-hosted web search verification failed.");
  process.exit(1);
});
