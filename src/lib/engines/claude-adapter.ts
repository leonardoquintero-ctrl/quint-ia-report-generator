import Anthropic from "@anthropic-ai/sdk";
import type { EngineAdapter, EngineQueryContext, EngineQueryResult } from "./types";

const VISIBILITY_MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — the full pass cannot run without it.");
  return new Anthropic({ apiKey });
}

// REAL ADAPTER — uses Anthropic's web_search server tool so Claude answers buyer
// prompts the way a real user would experience it (with actual live search), and we
// read citations off the text blocks' `citations` arrays (what Claude actually cited
// in its answer), not every raw search result it saw along the way.
export class ClaudeEngineAdapter implements EngineAdapter {
  readonly engineName = "claude" as const;

  async runQuery(prompt: string, _context: EngineQueryContext): Promise<EngineQueryResult> {
    const client = getClient();

    const message = await client.messages.create({
      model: VISIBILITY_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    });

    let responseText = "";
    const citations: { url: string; title: string }[] = [];

    for (const block of message.content) {
      if (block.type === "text") {
        responseText += block.text;
        for (const citation of block.citations ?? []) {
          if (citation.type === "web_search_result_location") {
            citations.push({ url: citation.url, title: citation.title ?? "" });
          }
        }
      }
    }

    return { responseText, citations };
  }
}
