import * as lancedb from "@lancedb/lancedb";
import path from "path";
import os from "os";

async function main() {
  const dbPath = path.join(os.homedir(), ".wopal", "memory", "lancedb");
  const db = await lancedb.connect(dbPath);

  const table = await db.openTable("memories");

  // Delete empty records (id is empty or null)
  console.log("Deleting empty records...");
  await table.delete("id IS NULL OR id = ''");
  
  // Delete records with corrupted text (contains non-printable chars)
  console.log("Deleting corrupted records...");
  const all = await table.query().toArray();
  for (const r of all) {
    const text = r.text as string;
    if (text && /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
      console.log(`  Deleting corrupted: ${r.id}`);
      await table.delete(`id = '${r.id}'`);
    }
  }

  console.log("\n=== Remaining Records ===");
  const remaining = await table.query().toArray();
  console.log(`Total: ${remaining.length} records\n`);
  
  for (let i = 0; i < remaining.length; i++) {
    const r = remaining[i] as Record<string, unknown>;
    console.log(`[${i + 1}] ${r.category}: ${r.text}`);
    console.log(`    Metadata: ${typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata)}`);
  }
}

main().catch(console.error);
