import type { FullPassResult, TopFinding, TopNegativeFinding } from "../types";

// Deterministic, not LLM-judged. The client assessment message (Section 5 of the
// Assessment Message spec) needs exactly one positive and one negative fact, each
// with a real number — picking those algorithmically guarantees the model can't
// invent or misjudge which finding is "the" headline; it only phrases what code
// already chose. Ranked worst/best-first below; the first applicable candidate wins.
// This is a first-pass heuristic, not exhaustive — tune the ranking as real report
// data shows which findings actually matter most to lead with.

function findBlockedPage(fullPass: FullPassResult) {
  return fullPass.site.crawlability.find((c) => c.reason === "blocked");
}

function findJsOnlyShell(fullPass: FullPassResult) {
  return fullPass.site.crawlability.find((c) => c.reason === "js_only_shell");
}

export function selectTopNegativeFinding(fullPass: FullPassResult): TopNegativeFinding {
  const { site, visibility, domain_authority } = fullPass;

  if (!site.llms_txt_status.robots_txt_valid || site.llms_txt_status.errors.length > 0) {
    return {
      metric: "AI bot access",
      value: "blocked",
      detail: site.llms_txt_status.errors[0] ?? "robots.txt blocks one or more AI crawlers",
    };
  }

  const blocked = findBlockedPage(fullPass);
  if (blocked) {
    return {
      metric: "Page crawlability",
      value: `HTTP ${blocked.status} on ${blocked.path}`,
      detail: "AI crawlers can't read this page at all.",
    };
  }

  const jsShell = findJsOnlyShell(fullPass);
  if (jsShell) {
    return {
      metric: "Page crawlability",
      value: `${jsShell.path} renders no readable content`,
      detail: "JavaScript-only page — AI crawlers see an empty shell.",
    };
  }

  const missingSchema = site.schema_inventory.find(
    (s) => s.types_found.length === 0 && s.types_expected.length > 0
  );
  if (missingSchema) {
    return {
      metric: "Structured data",
      value: `0 of ${missingSchema.types_expected.length} expected schema types found`,
      detail: `${missingSchema.page} has no machine-readable schema markup.`,
    };
  }

  const missingKgPage = Object.entries(site.knowledge_graph_pages).find(([, v]) => !v.exists);
  if (missingKgPage) {
    return {
      metric: "Knowledge graph coverage",
      value: `no ${missingKgPage[0]} page found`,
      detail: "AI engines have no dedicated page to cite for this topic.",
    };
  }

  if (visibility.visibility_score < 30) {
    return {
      metric: "AI visibility score",
      value: `${visibility.visibility_score}/100`,
      detail: "Cited in a small minority of tested buyer prompts.",
    };
  }

  if (domain_authority.referring_domains < 50) {
    return {
      metric: "Domain authority",
      value: `${domain_authority.referring_domains} referring domains`,
      detail: "Limited third-party signal for engines to draw on.",
    };
  }

  // Fallback — always a real, present number, never a placeholder.
  return {
    metric: "AI visibility score",
    value: `${visibility.visibility_score}/100`,
    detail: "Room to grow relative to full category coverage.",
  };
}

export function selectTopPositiveFinding(fullPass: FullPassResult): TopFinding {
  const { site, offsite, domain_authority, visibility } = fullPass;

  if (domain_authority.referring_domains >= 100) {
    return { metric: "Domain authority", value: `${domain_authority.referring_domains} referring domains` };
  }

  const consistency = Object.values(offsite.entity_consistency);
  if (consistency.length > 0 && consistency.every(Boolean)) {
    return { metric: "Off-site entity consistency", value: "consistent across all profiles checked" };
  }

  const directAnswerBlocks = site.content_shape.faq_blocks_found + site.content_shape.comparison_tables_found;
  if (directAnswerBlocks > 0) {
    return { metric: "Direct-answer content", value: `${directAnswerBlocks} FAQ/comparison blocks found` };
  }

  if (!findBlockedPage(fullPass) && !findJsOnlyShell(fullPass)) {
    return { metric: "Site crawlability", value: "no blocked or JS-only pages found" };
  }

  if (visibility.visibility_score > 0) {
    return { metric: "AI visibility score", value: `${visibility.visibility_score}/100` };
  }

  // Fallback — always a real, present number, never a placeholder.
  return { metric: "Domain authority", value: `${domain_authority.referring_domains} referring domains` };
}
