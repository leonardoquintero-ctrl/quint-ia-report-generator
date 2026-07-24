import Anthropic from "@anthropic-ai/sdk";
import { getEmailProvider } from "../email/provider";
import type { FastPassResult, Locale } from "../types";

// Haiku for speed — this runs synchronously inside the intake request, before the
// "you're all set" screen can render, so it needs to be fast, not exhaustive.
const FAST_MODEL = "claude-haiku-4-5-20251001";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — fast pass cannot generate its email.");
  return new Anthropic({ apiKey });
}

// v1 copy, drafted from the handoff's voice constraints (§5) since the "already
// drafted" EN/ES copy wasn't included in the handoff paste. Swap this system prompt
// for the approved copy once available — nothing else needs to change.
function buildSystemPrompt(locale: Locale, fastPass: FastPassResult): string {
  const languageLine =
    locale === "ES"
      ? "Write the entire email in Spanish (Latin American Spanish, plain and direct)."
      : "Write the entire email in English.";

  return `You are drafting an instant AI-visibility snapshot email for a prospective client who just paid for a Quint·IA Vantage Quick-Start Blueprint.

${languageLine}

Voice and structure, in order:
1. Lead with the single most severe, most concrete, most verifiable finding from the JSON data below. State the plain-language consequence, not jargon. Frame the likely cause in a non-alarmist way.
2. Stack 2-3 more findings, each backed by a real number from the JSON. Never invent or use placeholder statistics — only cite numbers that are actually present in the data.
3. Close by confirming the full Blueprint report arrives within 5-10 business days.

Explicitly do NOT:
- Mention competitors or any previous vendor/agency the client may have used — that judgment call belongs in the human-crafted full Blueprint, not this automated snapshot.
- Invent findings, metrics, or numbers not present in the JSON.
- Use technical jargon or raw JSON field names — translate everything into plain language.

Fast-pass data:
${JSON.stringify(fastPass, null, 2)}`;
}

export interface FastPassEmailResult {
  subject: string;
  body: string;
}

export async function generateFastPassEmail(
  fastPass: FastPassResult,
  locale: Locale
): Promise<FastPassEmailResult> {
  const client = getClient();
  const systemPrompt = buildSystemPrompt(locale, fastPass);

  const message = await client.messages.create({
    model: FAST_MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: "Draft the fast-pass snapshot email now." }],
  });

  const body = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const subject =
    locale === "ES" ? "Tu instantánea de visibilidad en IA está lista" : "Your AI visibility snapshot is ready";

  return { subject, body };
}

export async function sendFastPassEmail(
  to: string,
  fastPass: FastPassResult,
  locale: Locale
): Promise<void> {
  const { subject, body } = await generateFastPassEmail(fastPass, locale);
  const result = await getEmailProvider().send({ to, subject, text: body });
  if (!result.success) {
    console.error(`[fastpass email] Failed to send to ${to}: ${result.error}`);
  }
}
