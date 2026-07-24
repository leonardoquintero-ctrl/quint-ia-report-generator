import Anthropic from "@anthropic-ai/sdk";
import type { ClientReport, FullPassResult, Locale } from "../types";

const SYNTHESIS_MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey });
}

const TOOL_NAME = "record_client_report";

const CLIENT_REPORT_SCHEMA = {
  type: "object" as const,
  properties: {
    disclaimer: {
      type: "string",
      description:
        "Opens by clearly stating this is an automated diagnostic per Quint·IA Vantage's baseline criteria, and that the personalized 90-day plan follows human review during the readout call.",
    },
    scorecard: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          pillar: {
            type: "string",
            enum: ["technical_readability", "owned_knowledge_graph", "content_shape", "offsite_citations"],
          },
          label: { type: "string" },
          summary: {
            type: "string",
            description: "Plain-language summary — no raw metric names or JSON keys.",
          },
        },
        required: ["pillar", "label", "summary"],
      },
    },
    findings: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          finding: { type: "string" },
          why_it_matters: { type: "string" },
          what_fixing_it_does: { type: "string" },
        },
        required: ["finding", "why_it_matters", "what_fixing_it_does"],
      },
    },
    coverage_disclosure: {
      type: "string",
      description: "Plainly discloses that Google AI Overviews isn't in this dataset (Claude, ChatGPT, Perplexity are).",
    },
    closing: {
      type: "string",
      description: "Teases the human-crafted full plan, arriving in 5-10 business days.",
    },
  },
  required: ["disclaimer", "scorecard", "findings", "coverage_disclosure", "closing"],
};

function buildSystemPrompt(locale: Locale): string {
  const languageLine =
    locale === "ES"
      ? "Write every text field in Spanish (Latin American Spanish, plain and direct)."
      : "Write every text field in English.";

  return `You are generating a client-facing Quick-Start Blueprint technical report for Quint·IA Vantage.

${languageLine}

Constraints:
1. Disclaimer first: automated diagnostic per baseline criteria; the personalized 90-day plan follows human review.
2. Disclosure: explicitly state Google AI Overviews is not included in this dataset — the baseline uses Claude, ChatGPT, and Perplexity.
3. Scorecard: plain-language summary across exactly 4 pillars (technical readability, owned knowledge graph, content shape, off-site citations). Never expose raw JSON keys or metric names.
4. Findings: exactly 3 to 5, each as finding -> why it matters (plain language) -> what fixing it typically achieves.
5. Closing: tease the upcoming human-crafted plan, arriving in 5-10 business days.
Do not invent metrics or data outside the provided JSON.`;
}

export async function synthesizeClientReport(fullPass: FullPassResult, locale: Locale): Promise<ClientReport> {
  const client = getClient();

  const message = await client.messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 2000,
    system: buildSystemPrompt(locale),
    messages: [
      {
        role: "user",
        content: `Full-pass scan data:\n${JSON.stringify(fullPass, null, 2)}\n\nGenerate the client report now.`,
      },
    ],
    tools: [{ name: TOOL_NAME, description: "Record the synthesized client report", input_schema: CLIENT_REPORT_SCHEMA }],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured client report.");
  }

  // Anthropic's tool-forced structured output is best-effort against the schema, not
  // strictly enforced — a `required` field can still come back missing (observed with
  // the owner report's action_skeleton). Defaulting here rather than letting a
  // downstream .map()/.join() throw on undefined.
  const input = toolUse.input as Partial<Omit<ClientReport, "locale" | "generated_at">>;
  return {
    disclaimer: input.disclaimer ?? "",
    scorecard: input.scorecard ?? [],
    findings: input.findings ?? [],
    coverage_disclosure: input.coverage_disclosure ?? "",
    closing: input.closing ?? "",
    locale,
    generated_at: new Date().toISOString(),
  };
}
