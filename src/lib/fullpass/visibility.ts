import pLimit from "p-limit";
import { ClaudeEngineAdapter } from "../engines/claude-adapter";
import { MockEngineAdapter } from "../engines/mock-adapter";
import { isDomainCited } from "../engines/citation";
import type { EngineAdapter } from "../engines/types";
import type { CompetitorInput, VisibilityResult } from "../types";

// Claude is real (web_search tool). OpenAI/Perplexity are mocked until their API
// keys arrive — swap either MockEngineAdapter instance for a real implementation
// here to go live; nothing else in the pipeline changes.
function getEngineAdapters(): EngineAdapter[] {
  return [new ClaudeEngineAdapter(), new MockEngineAdapter("openai", 30), new MockEngineAdapter("perplexity", 30)];
}

// Concurrency-limited to avoid bursting rate limits across ~60 live calls
// (prompts x engines) — the one genuinely good idea to carry over from Handoff 2.
const CONCURRENCY = 5;

export async function runPromptVisibilityChecks(
  prompts: string[],
  domain: string,
  competitors: CompetitorInput[]
): Promise<VisibilityResult> {
  const adapters = getEngineAdapters();
  const domainsToCheck = [domain, ...competitors.map((c) => c.domain)];
  const limit = pLimit(CONCURRENCY);

  const tasks = prompts.flatMap((prompt) =>
    adapters.map((adapter) =>
      limit(async () => {
        try {
          const result = await adapter.runQuery(prompt, { domainsToCheck });
          return {
            prompt,
            engine: adapter.engineName,
            client_cited: isDomainCited(result.citations, domain),
            citations_returned: result.citations,
            competitor_cited: competitors.map((c) => ({
              domain: c.domain,
              cited: isDomainCited(result.citations, c.domain),
            })),
          };
        } catch (err) {
          console.error(`[visibility] ${adapter.engineName} failed for prompt "${prompt}":`, err);
          return {
            prompt,
            engine: adapter.engineName,
            client_cited: false,
            citations_returned: [],
            competitor_cited: competitors.map((c) => ({ domain: c.domain, cited: false })),
            error: "API Failure",
          };
        }
      })
    )
  );

  const results = await Promise.all(tasks);

  return {
    prompts_tested: prompts.length,
    engines_covered: ["claude", "openai", "perplexity"],
    engines_not_covered: ["google_ai_overviews"],
    coverage_note:
      "Google AI Overviews has no official API; would require SerpAPI or DataForSEO to include. Disclosed here rather than silently omitted.",
    results,
  };
}
