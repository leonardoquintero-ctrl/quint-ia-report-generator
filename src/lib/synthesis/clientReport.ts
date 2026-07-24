import type { ClientReport, FullPassResult, Locale } from "../types";

// Deliberately NOT an LLM call. The Instant Assessment spec frames the client-facing
// report as "structured JSON as the source of truth, rendered into a branded
// report" — a direct rendering, not narrative synthesis. Keeping this a pure data
// transform (no Claude call) is both simpler/cheaper and structurally guarantees the
// output can't drift into recommendation-shaped language — the exact thing the spec
// (and the resist-scope-creep principle behind it) rules out. See
// src/app/report/[token]/page.tsx for how this renders.
const DISCLAIMER: Record<Locale, string> = {
  EN: "This is an automated diagnostic snapshot generated against Quint·IA Vantage's baseline AI-visibility criteria. It does not include recommendations or a prioritized action plan — those are prepared by a human strategist in your full Blueprint, delivered separately within 5 business days.",
  ES: "Esta es una instantánea de diagnóstico automatizada generada según los criterios base de visibilidad en IA de Quint·IA Vantage. No incluye recomendaciones ni un plan de acción priorizado — esos los prepara un estratega humano en tu Blueprint completo, entregado por separado dentro de 5 días hábiles.",
};

const COVERAGE_DISCLOSURE: Record<Locale, string> = {
  EN: "This baseline scores ChatGPT and Perplexity for AI visibility. Claude is tested as an additional signal but isn't included in the score. Google AI Overviews has no official API and isn't included in this dataset.",
  ES: "Esta línea base evalúa ChatGPT y Perplexity para la puntuación de visibilidad en IA. Claude se prueba como señal adicional pero no se incluye en la puntuación. Google AI Overviews no tiene una API oficial y no está incluido en este conjunto de datos.",
};

export function buildClientReport(
  fullPass: FullPassResult,
  domain: string,
  targetMarket: string,
  locale: Locale
): ClientReport {
  return {
    domain,
    target_market: targetMarket,
    disclaimer: DISCLAIMER[locale],
    coverage_disclosure: COVERAGE_DISCLOSURE[locale],
    visibility_score: fullPass.visibility.visibility_score,
    visibility_detail: {
      prompts_tracked: fullPass.visibility.prompts_tested,
      mentions: fullPass.visibility.mentions,
      competitor_share_of_voice: fullPass.visibility.competitor_share_of_voice,
    },
    domain_authority: fullPass.domain_authority,
    crawlability: fullPass.site.crawlability,
    technical_health: fullPass.site.technical_health,
    llms_txt_status: fullPass.site.llms_txt_status,
    entity_consistency: fullPass.offsite.entity_consistency,
    teasers: fullPass.teasers,
    locale,
    generated_at: new Date().toISOString(),
  };
}
