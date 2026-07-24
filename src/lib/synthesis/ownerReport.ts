import Anthropic from "@anthropic-ai/sdk";
import type { CompetitorInput, FullPassResult, OwnerReport } from "../types";

const SYNTHESIS_MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey });
}

const TOOL_NAME = "record_owner_report";

// Static, not LLM-generated — guarantees the wording is always exactly this,
// regardless of how Claude phrases the rest of the report. Confirmed with the user:
// the action skeleton stays, but must always read as draft suggestions, not the
// final Blueprint content.
const DISCLAIMER =
  "Draft suggestions only, generated automatically — not the final Blueprint. Review, edit, and reprioritize before anything here reaches the client.";

const OWNER_REPORT_SCHEMA = {
  type: "object" as const,
  properties: {
    flagged_anomalies: {
      type: "array",
      items: { type: "string" },
      description: "Surfaced first: bot blocks, 404s on key pages, missing SSL, etc.",
    },
    raw_findings: {
      type: "string",
      description: "Full findings per pillar, all pages checked, no simplification.",
    },
    competitor_comparison: {
      type: ["string", "null"],
      description: "Comparison against supplied competitor domains, or null if none were supplied.",
    },
    action_skeleton: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          tag: { type: "string", enum: ["DIY", "Partner", "Done-For-You"] },
        },
        required: ["item", "tag"],
      },
      description: "Draft 90-day action skeleton for the team to edit — structured and blunt, not a finished narrative.",
    },
  },
  required: ["flagged_anomalies", "raw_findings", "competitor_comparison", "action_skeleton"],
};

const SYSTEM_PROMPT = `You are generating the internal Quick-Start Blueprint owner report for the Quint·IA Vantage team.

Constraints:
1. Flagged anomalies first: bot blocks, 404s on key pages, missing SSL, or anything else broken — surfaced at the top, not buried.
2. Raw findings: full detail across all pillars and pages checked. Do not simplify or hide data.
3. Competitor comparison: this field must be null ONLY if zero competitor domains were supplied. If even one competitor domain is supplied below, this field is REQUIRED and must compare the client's visibility_score/share-of-voice/citation data against each supplied competitor by name — never null when competitors exist.
4. Action skeleton: REQUIRED, minimum 3 items, every item tagged DIY, Partner, or Done-For-You — never an empty array. Even with limited test data, synthesize at least one action item per real gap found in raw_findings/flagged_anomalies (e.g. missing schema, missing entity profiles, thin content). This is a draft for the team to edit — keep it structured and blunt, not narrative prose.
No client-facing disclaimers are needed. This is an internal working document — write in English regardless of the client's locale.`;

export async function synthesizeOwnerReport(
  fullPass: FullPassResult,
  competitors: CompetitorInput[]
): Promise<OwnerReport> {
  const client = getClient();

  const message = await client.messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Full-pass scan data:\n${JSON.stringify(fullPass, null, 2)}\n\nCompetitor domains supplied: ${
          competitors.length > 0 ? competitors.map((c) => c.domain).join(", ") : "none"
        }\n\nGenerate the owner report now.`,
      },
    ],
    tools: [{ name: TOOL_NAME, description: "Record the synthesized owner report", input_schema: OWNER_REPORT_SCHEMA }],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured owner report.");
  }

  // Anthropic's tool-forced structured output is best-effort against the schema, not
  // strictly enforced — `required` doesn't guarantee a field is actually present, as
  // observed with `action_skeleton` being dropped entirely. Defaulting missing
  // fields here rather than letting a downstream .map()/.join() throw on undefined.
  const input = toolUse.input as Partial<Omit<OwnerReport, "generated_at" | "disclaimer">>;
  return {
    disclaimer: DISCLAIMER,
    flagged_anomalies: input.flagged_anomalies ?? [],
    raw_findings: input.raw_findings ?? "",
    competitor_comparison: input.competitor_comparison ?? null,
    action_skeleton: input.action_skeleton ?? [],
    generated_at: new Date().toISOString(),
  };
}
