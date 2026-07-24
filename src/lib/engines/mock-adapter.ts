import type { EngineAdapter, EngineQueryContext, EngineQueryResult } from "./types";

// MOCK ADAPTER — no real API call. OpenAI (web_search tool) and Perplexity (Sonar)
// keys aren't available yet; this stands in behind the same EngineAdapter interface
// so swapping in the real implementation later is a one-file change, same pattern as
// the funnel app's MockEngineAdapter. It fabricates citation behavior deterministically
// per (engine, prompt, domain) so results are stable across runs and actually
// reference the domains being scored (not a generic placeholder URL) — this is NOT a
// real visibility signal.
//
// To go live: implement EngineAdapter with a real call (OpenAI Responses API
// `web_search` tool, or Perplexity's `sonar` model) and swap the instance in
// getEngineAdapters() in src/lib/fullpass/runFullPass.ts. Nothing else changes.
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export class MockEngineAdapter implements EngineAdapter {
  readonly engineName: "chatgpt" | "perplexity";
  private citationWeight: number; // 0-100, rough odds any given domain gets "cited"

  constructor(engineName: "chatgpt" | "perplexity", citationWeight = 30) {
    this.engineName = engineName;
    this.citationWeight = citationWeight;
  }

  async runQuery(prompt: string, context: EngineQueryContext): Promise<EngineQueryResult> {
    await new Promise((resolve) => setTimeout(resolve, 150 + (hashString(prompt) % 250)));

    const citedDomains = context.domainsToCheck.filter((domain) => {
      const seed = hashString(`${this.engineName}::${prompt}::${domain.toLowerCase()}`);
      return seed % 100 < this.citationWeight;
    });

    const responseText =
      citedDomains.length > 0
        ? `[mock ${this.engineName} answer] For "${prompt}", sources worth checking include ${citedDomains.join(", ")}.`
        : `[mock ${this.engineName} answer] Here's a general answer to "${prompt}" without a specific cited source.`;

    const citations = citedDomains.map((domain) => {
      const seed = hashString(`${this.engineName}::${prompt}::${domain}::source`);
      return { url: `https://${domain}/`, title: `${domain} — referenced source (mock, seed ${seed % 97})` };
    });

    return { responseText, citations };
  }
}
