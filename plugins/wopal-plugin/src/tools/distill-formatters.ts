import type { PreviewCandidate } from "../memory/distill.js";

export function formatPreviewReport(
  candidates: PreviewCandidate[],
  title: string | null,
  messageCount: number,
): string {
  const lines: string[] = [];

  lines.push("## 🔍 Distillation Preview");
  lines.push("");
  lines.push(`**Session Messages:** ${messageCount}`);
  lines.push(`**Candidates Found:** ${candidates.length}`);

  if (title) {
    lines.push(`**Suggested Title:** ${title}`);
  }

  lines.push("");
  lines.push("### Candidate Memories");
  lines.push("");

  candidates.forEach((candidate, index) => {
    lines.push(`**[${index}] ${candidate.body.split("\n")[0]}**`);
    const bodyContent = candidate.body.slice(candidate.body.indexOf("\n") + 1);
    if (bodyContent) {
      const indentedBody = bodyContent
        .split("\n")
        .map((line) => (line ? `   ${line}` : "   "))
        .join("\n");
      lines.push(indentedBody);
    }
    lines.push(
      `   Category: \`${candidate.category}\` | Importance: ${candidate.importance}/10 | Concepts: ${candidate.concepts.join(", ") || "none"}`,
    );
    lines.push("");
  });

  lines.push("---");
  lines.push("");
  lines.push("**Next Steps:**");
  lines.push(
    "- To write all candidates: `context_manage action=confirm`",
  );
  lines.push(
    "- To write specific candidates: `context_manage action=confirm selectedIndices=[0,2,5]`",
  );
  lines.push("- To cancel: `context_manage action=cancel`");

  return lines.join("\n");
}

export function formatConfirmReportWithDedup(
  selected: PreviewCandidate[],
  title: string | null,
  result: { created: number; merged: number; skipped: number; mergeDetails?: Array<{ existingId: string; existingPreview: string; mergedPreview: string }> },
): string {
  const lines: string[] = [];

  lines.push("## ✅ Distillation Complete (with Deduplication)");
  lines.push("");
  lines.push(
    `**Selected:** ${selected.length} | **Created:** ${result.created} | **Merged:** ${result.merged} | **Skipped:** ${result.skipped}`,
  );

  if (title) {
    lines.push(`**Session Title:** ${title}`);
  }

  lines.push("");
  lines.push("### Written Memories");
  lines.push("");

  selected.forEach((m, i) => {
    lines.push(
      `**[${i}] ${m.category} | 重要性: ${m.importance}/10 | 标签: ${m.concepts.join(", ") || "none"}**`,
    );
    lines.push(m.body);
    lines.push("");
  });

  if (result.mergeDetails && result.mergeDetails.length > 0) {
    lines.push("### Merge Details");
    lines.push("");
    for (const md of result.mergeDetails) {
      lines.push(`- Merged into \`${md.existingId}\`:`);
      lines.push(`  - Before: ${md.existingPreview}`);
      lines.push(`  - After: ${md.mergedPreview}`);
    }
    lines.push("");
  }

  if (result.skipped > 0) {
    lines.push(
      `> ℹ️ ${result.skipped} candidate(s) skipped as duplicates`,
    );
  }

  return lines.join("\n");
}
