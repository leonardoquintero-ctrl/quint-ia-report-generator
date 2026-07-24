import pLimit from "p-limit";
import { ClaudeEngineAdapter } from "../engines/claude-adapter";
import { MockEngineAdapter } from "../engines/mock-adapter";
import { isDomainCited } from "../engines/citation";
import type { EngineAdapter } from "../engines/types";
import type { CompetitorInput, EngineName, ScoredEngineName, VisibilityMention, VisibilityResult } from "../types";

const SCORED_ENGINES: ScoredEngineName[] = ["chatgpt", "perplexity"];

// Claude is real (web_search tool) — it still runs and its results are captured
// (visibility.claude_bonus_signal) since it's free real data, but per the Instant
// Assessment spec, visibility_score is ChatGPT + Perplexity only. ChatGPT/Perplexity
// are mocked until their API keys arrive; swap either MockEngineAdapter instance for
// a real implementation here to go live — nothing else in the pipeline changes.
function getEngineAdapters(): EngineAdapter[] {
  return [new ClaudeEngineAdapter(), new MockEngineAdapter("chatgpt", 30), new MockEngineAdapter("perplexity", 30)];
}

// Concurrency-limited to avoid bursting rate limits across ~60 live calls
// (prompts x engines).
const CONCURRENCY = 5;

interface ComboResult {
  prompt: string;
  engine: EngineName;
  citedDomains: Set<string>;
}

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
      limit(async (): Promise<ComboResult> => {
        try {
          const result = await adapter.runQuery(prompt, { domainsToCheck });
          const citedDomains = new Set(domainsToCheck.filter((d) => isDomainCited(result.citations, d)));
          return { prompt, engine: adapter.engineName, citedDomains };
        } catch (err) {
          console.error(`[visibility] ${adapter.engineName} failed for prompt "${prompt}":`, err);
          return { prompt, engine: adapter.engineName, citedDomains: new Set<string>() };
        }
      })
    )
  );

  const combos = await Promise.all(tasks);
  const scoredCombos = combos.filter((c): c is ComboResult & { engine: ScoredEngineName } =>
    (SCORED_ENGINES as string[]).includes(c.engine)
  );

  const mentions: VisibilityMention[] = scoredCombos.map((c) => ({
    prompt: c.prompt,
    engine: c.engine,
    cited: c.citedDomains.has(domain),
  }));

  const totalScoredCombos = prompts.length * SCORED_ENGINES.length;
  const clientCitations = scoredCombos.filter((c) => c.citedDomains.has(domain)).length;
  const visibility_score = totalScoredCombos > 0 ? Math.round((clientCitations / totalScoredCombos) * 100) : 0;

  const competitor_share_of_voice: Record<string, number> = {};
  for (const d of domainsToCheck) {
    const citations = scoredCombos.filter((c) => c.citedDomains.has(d)).length;
    competitor_share_of_voice[d] = totalScoredCombos > 0 ? Math.round((citations / totalScoredCombos) * 100) : 0;
  }

  const claude_bonus_signal: VisibilityMention[] = combos
    .filter((c) => c.engine === "claude")
    .map((c) => ({ prompt: c.prompt, engine: c.engine, cited: c.citedDomains.has(domain) }));

  return {
    prompts_tested: prompts.length,
    engines_covered: ["chatgpt", "perplexity", "claude"],
    engines_not_covered: ["google_ai_overviews"],
    coverage_note:
      "Google AI Overviews has no official API; would require SerpAPI or DataForSEO to include. Disclosed here rather than silently omitted.",
    mentions,
    visibility_score,
    competitor_share_of_voice,
    claude_bonus_signal,
  };
}
