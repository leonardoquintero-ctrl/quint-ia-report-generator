export interface EngineCitation {
  url: string;
  title: string;
}

export interface EngineQueryResult {
  responseText: string;
  citations: EngineCitation[];
}

export interface EngineQueryContext {
  /**
   * Domains being scored in this full pass (client + competitors), passed through so
   * mock adapters can fabricate plausible per-domain citation behavior. Real adapters
   * ignore this — the point of the check is whether a domain comes up unprompted.
   */
  domainsToCheck: string[];
}

// "chatgpt"/"perplexity" are the two engines the Instant Assessment spec scores;
// "claude" still runs for real but is a bonus signal excluded from the score — see
// src/lib/types.ts's EngineName/ScoredEngineName for where this distinction matters.
export interface EngineAdapter {
  readonly engineName: "claude" | "chatgpt" | "perplexity";
  runQuery(prompt: string, context: EngineQueryContext): Promise<EngineQueryResult>;
}
