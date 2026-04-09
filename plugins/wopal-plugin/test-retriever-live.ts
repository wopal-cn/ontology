import { MemoryStore } from "./src/memory/store.js";
import { EmbeddingClient } from "./src/memory/embedder.js";
import { MemoryRetriever } from "./src/memory/retriever.js";

async function main() {
  const store = new MemoryStore();
  await store.init();
  const embedder = new EmbeddingClient();
  const retriever = new MemoryRetriever(store, embedder);

  console.log(`DB total: ${await store.count()}\n`);

  // Simulate what the injector sees
  const query = "继续 Issue 46 的验证工作";
  console.log(`Query: "${query}"\n`);

  const memories = await retriever.retrieve(query, { maxTokens: 1500 });
  console.log(`Returned: ${memories.length} memories\n`);

  for (const m of memories) {
    console.log(`[${m.category}] ${m.text}`);
  }
}

main().catch(console.error);
