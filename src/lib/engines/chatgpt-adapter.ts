import OpenAI from "openai";
import type { EngineAdapter, EngineQueryContext, EngineQueryResult } from "./types";

const CHATGPT_MODEL = "gpt-5.5";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set — the ChatGPT visibility check cannot run without it.");
  return new OpenAI({ apiKey });
}

// REAL ADAPTER — uses OpenAI's web_search tool via the Responses API, mirroring the
// real Claude adapter's approach (real live search, citations read off the model's
// own annotations, not fabricated). Citations come from url_citation annotations on
// the output message's text (what ChatGPT actually cited), not every raw search
// result it saw along the way.
export class ChatGptEngineAdapter implements EngineAdapter {
  readonly engineName = "chatgpt" as const;

  async runQuery(prompt: string, _context: EngineQueryContext): Promise<EngineQueryResult> {
    const client = getClient();

    const response = await client.responses.create({
      model: CHATGPT_MODEL,
      input: prompt,
      tools: [{ type: "web_search" }],
    });

    let responseText = "";
    const citations: { url: string; title: string }[] = [];

    for (const item of response.output) {
      if (item.type === "message") {
        for (const block of item.content) {
          if (block.type === "output_text") {
            responseText += block.text;
            for (const annotation of block.annotations ?? []) {
              if (annotation.type === "url_citation") {
                citations.push({ url: annotation.url, title: annotation.title ?? "" });
              }
            }
          }
        }
      }
    }

    return { responseText, citations };
  }
}
