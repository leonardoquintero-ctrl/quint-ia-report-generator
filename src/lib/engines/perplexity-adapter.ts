import type { EngineAdapter, EngineQueryContext, EngineQueryResult } from "./types";

const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search";

function getApiKey(): string {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set — the Perplexity visibility check cannot run without it.");
  return apiKey;
}

interface PerplexitySearchResult {
  title: string;
  url: string;
  snippet: string;
}

// REAL ADAPTER — uses Perplexity's Search API (not the Sonar answer/chat API).
// "Citation" here means a domain appearing among the top search results Perplexity
// returns for the buyer prompt used as the query, not a domain cited inside a
// generated answer (that's how the Claude/ChatGPT adapters work). Different
// mechanism, same downstream contract — citation.ts's domain-matching applies
// equally to result URLs from either shape. Swap for Perplexity's Sonar chat API
// later if answer-generated citations are preferred; nothing outside this file
// needs to change.
export class PerplexityEngineAdapter implements EngineAdapter {
  readonly engineName = "perplexity" as const;

  async runQuery(prompt: string, _context: EngineQueryContext): Promise<EngineQueryResult> {
    const res = await fetch(PERPLEXITY_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: prompt,
        max_results: 10,
        max_tokens_per_page: 256,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Perplexity search failed (${res.status}): ${body}`);
    }

    const data: { results: PerplexitySearchResult[] } = await res.json();
    const results = data.results ?? [];

    return {
      responseText: results.map((r) => `${r.title}: ${r.snippet}`).join("\n"),
      citations: results.map((r) => ({ url: r.url, title: r.title })),
    };
  }
}
