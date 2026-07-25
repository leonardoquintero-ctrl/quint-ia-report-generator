import Anthropic from "@anthropic-ai/sdk";
import type { ClientAssessmentMessageInput } from "../types";

const SYNTHESIS_MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey });
}

// Per Assessment Message spec Section 5. Deliberately does NOT cover the SEO teaser
// line from Section 3 — that's a fixed template with a real count and a real (or
// fallback) link, appended in code by buildSeoTeaserLine() below rather than trusted
// to model phrasing, same reasoning as the deterministic top-finding selection in
// topFindings.ts.
const SYSTEM_PROMPT = `You are writing the Instant AI Visibility Snapshot — the first message a client
receives immediately after paying for the Quick-Start Blueprint and completing
intake. It is not the full Blueprint. Its only two jobs: (1) prove real technical
work already happened, using specific verifiable numbers, and (2) make the client
feel the purchase was already worth it, without revealing the prioritized
recommendations or 90-day plan reserved for the paid, human-crafted Blueprint.

VOICE
Confident, expert, already-diagnosed. Like a strategist who did the work before
the sales conversation, not a report generator. Direct sentences, no hedging
language ("it seems," "might indicate"), no filler. Never use the word "however"
as a paragraph opener or apologize for automation.

STRUCTURE (in this order, nothing added, nothing skipped)
1. Opening: if client_context is non-empty, open by referencing it directly and
   naming that you ran a technical diagnostic against it. If client_context is
   empty, open directly with the top_negative_finding instead — no filler lead-in.
2. One root-cause sentence: name the underlying technical problem behind
   top_negative_finding, and tie it explicitly to the business consequence
   implied by client_context or target_market. Base this ONLY on data present in
   the input JSON — never invent a cause not evidenced by the fields provided.
3. Good news / bad news, in that order: one sentence on domain_authority or
   top_positive_finding as the asset already in place, immediately followed by
   one sentence on top_negative_finding as what's blocking it from working.
4. Headline score: one sentence stating visibility_score.value, named to the
   specific engines/market in visibility_score.engines and target_market.
5. Closing line: one sentence, full Blueprint with prioritized recommendations
   arrives separately within business_days business days.

HARD RULES
- Never fabricate a causal narrative (e.g. "your previous team did X") unless
  directly evidenced by the input data.
- Exactly one root-cause sentence. Exactly one positive fact. Exactly one
  negative fact. Exactly one headline score. No more.
- Never include: prioritized recommendations, a sequenced or numbered action
  plan, more than the findings explicitly named above, page-by-page detail,
  raw JSON keys or metric names — translate everything into plain language.
- Do NOT write an SEO teaser line or anything about SEO — that's appended
  separately, not your job.
- Total length: 120-180 words. This is a message, not a report.
- Write entirely in the register and language implied by locale ("en" or
  "es") — this is a full voice shift, not a literal translation. For "es",
  match the directness and technical-Spanish register of a Spanish-market
  pitch email (informal "tú," concrete numbers, no corporate softening).
- Output plain text suitable for an email body. No markdown headers, no bullet
  lists, no subject line (subject is generated separately).`;

export async function synthesizeClientMessage(input: ClientAssessmentMessageInput): Promise<string> {
  const client = getClient();

  const message = await client.messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${JSON.stringify(input, null, 2)}\n\nWrite the client assessment message now.`,
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude did not return a client assessment message.");
  return text;
}

const SEO_TEASER_LINE: Record<
  "EN" | "ES",
  (count: number, addOnAction: string) => string
> = {
  EN: (count, addOnAction) =>
    `We also flagged ${count} SEO recommendations — separate from AEO, and not included in your Blueprint by default. ${addOnAction}`,
  ES: (count, addOnAction) =>
    `También detectamos ${count} recomendaciones de SEO — independientes de AEO, y no incluidas en tu Blueprint por defecto. ${addOnAction}`,
};

// No real SEO add-on purchase flow exists yet (Assessment Message spec, Section 8
// open items), so the teaser points to a reply instead of a dead link until that's
// built — swap this for the real link/flow once it ships.
const SEO_ADD_ON_FALLBACK: Record<"EN" | "ES", string> = {
  EN: "Reply to this email to add them to your Blueprint.",
  ES: "Responde a este correo para agregarlas a tu Blueprint.",
};

// Fixed template, not model-generated — see the file-level comment above. Returns
// null (nothing to append) when the SEO-adjacent count is 0, since "we flagged 0
// recommendations, add them" is nonsensical copy; count is currently always 0 until
// the SEO-adjacent check classification (same spec, Section 3/8) is built.
export function buildSeoTeaserLine(locale: "EN" | "ES", seoFindingsCount: number): string | null {
  if (seoFindingsCount <= 0) return null;
  return SEO_TEASER_LINE[locale](seoFindingsCount, SEO_ADD_ON_FALLBACK[locale]);
}
