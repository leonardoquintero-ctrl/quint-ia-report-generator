export type Locale = "EN" | "ES";

export interface CompetitorInput {
  name?: string;
  domain: string;
}

// ─── Fast pass (intake-time, synchronous, unchanged shape) ─────────────────
export interface FastPassResult {
  domain: string;
  timestamp: string;
  homepage_crawlable: boolean;
  http_status: number;
  ssl_valid: boolean;
  h1_present: boolean;
  h1_text: string;
  word_count_homepage: number;
  page_compressed: boolean;
  llms_txt: { present: boolean; valid_format: boolean; issues: string[] };
  robots_txt: {
    present: boolean;
    blocks_gptbot: boolean;
    blocks_claudebot: boolean;
    blocks_perplexitybot: boolean;
    blocks_google_extended: boolean;
  };
}

// ─── Full pass — site checks (per-page, per "Instant Assessment" spec) ─────
export interface CrawlabilityEntry {
  path: string;
  status: number;
  crawlable: boolean;
  // Present only when crawlable is false — distinguishes an outright block
  // (4xx/5xx) from a 200 response with no meaningful server-rendered text
  // (a JS-only shell an AI crawler can't read), per the spec's explicit ask.
  reason?: "blocked" | "js_only_shell";
}

export interface TechnicalHealthEntry {
  path: string;
  h1_present: boolean;
  word_count: number;
  compressed: boolean;
}

export interface SchemaInventoryEntry {
  page: string;
  types_found: string[];
  types_expected: string[];
}

export interface KnowledgeGraphPageCheck {
  exists: boolean;
  has_schema: boolean;
}

export interface LlmsTxtStatus {
  llms_txt_valid: boolean;
  robots_txt_valid: boolean;
  errors: string[];
}

export interface SiteChecksResult {
  crawlability: CrawlabilityEntry[];
  technical_health: TechnicalHealthEntry[];
  // Kept beyond the spec's minimum client-facing shape — internal detail the owner
  // report's raw findings draw on; not shown to the client as-is.
  schema_inventory: SchemaInventoryEntry[];
  knowledge_graph_pages: {
    about: KnowledgeGraphPageCheck;
    team: KnowledgeGraphPageCheck;
    products: KnowledgeGraphPageCheck;
    faq: KnowledgeGraphPageCheck;
    glossary: KnowledgeGraphPageCheck;
  };
  content_shape: {
    direct_answer_lead: boolean;
    faq_blocks_found: number;
    comparison_tables_found: number;
    author_bylines_found: number;
  };
  llms_txt_status: LlmsTxtStatus;
  // Per-bot detail behind llms_txt_status.errors — kept for the owner report; the
  // client-facing report only ever shows the consolidated valid/invalid + errors.
  robots_txt_bot_blocks: {
    blocks_gptbot: boolean;
    blocks_claudebot: boolean;
    blocks_perplexitybot: boolean;
    blocks_google_extended: boolean;
  };
  // Bonus internal signal, not part of the Instant Assessment spec's client-facing
  // contract — same treatment as youtube/claude_bonus_signal: owner-report raw
  // findings only.
  pagespeed: { lcp_seconds: number; score: number };
}

// ─── Full pass — prompt visibility ──────────────────────────────────────────
// "chatgpt"/"perplexity" are the two engines that count toward visibility_score, per
// the Instant Assessment spec. "claude" still runs for real (the one adapter with a
// working key today) but is excluded from the score — a free bonus signal, not part
// of the client-facing contract.
export type EngineName = "chatgpt" | "perplexity" | "claude";
export type ScoredEngineName = "chatgpt" | "perplexity";

export interface VisibilityMention {
  prompt: string;
  engine: EngineName;
  cited: boolean;
}

export interface VisibilityResult {
  prompts_tested: number;
  engines_covered: EngineName[];
  engines_not_covered: string[];
  coverage_note: string;
  mentions: VisibilityMention[]; // scored engines only (chatgpt + perplexity)
  visibility_score: number; // 0-100, chatgpt + perplexity only
  competitor_share_of_voice: Record<string, number>; // domain -> 0-100, includes the client's own domain for comparison
  // Claude's real results, kept for engineering visibility / the owner report's raw
  // findings — never surfaced in the client-facing report.
  claude_bonus_signal: VisibilityMention[];
}

// ─── Full pass — domain authority ──────────────────────────────────────────
export interface DomainAuthorityResult {
  referring_domains: number;
  source: "ahrefs" | "moz" | "mock";
}

// ─── Full pass — off-site / entity consistency ─────────────────────────────
export interface EntityConsistency {
  linkedin: boolean;
  crunchbase: boolean;
  g2: boolean;
  capterra: boolean;
}

export interface OffsiteResult {
  // Kept beyond the spec's entity-consistency set — extra signal for the owner
  // report, not part of the client-facing contract.
  youtube: { channel_found: boolean; videos_found: number };
  entity_consistency: EntityConsistency;
}

// ─── Full pass — strategic teasers (counts only, never content) ───────────
export interface Teasers {
  content_opportunities_found: number;
  third_party_channels_flagged: number;
}

// ─── Assembled full-pass object stored in reports.full_pass_json ──────────
export interface FullPassResult {
  site: SiteChecksResult;
  visibility: VisibilityResult;
  domain_authority: DomainAuthorityResult;
  offsite: OffsiteResult;
  teasers: Teasers;
}

// ─── Client-facing report — spec-literal, zero recommendations/narrative ──
// This is a direct rendering of FullPassResult, not an LLM synthesis — see
// src/lib/synthesis/clientReport.ts for why that's deliberate.
export interface ClientReport {
  domain: string;
  target_market: string;
  disclaimer: string;
  coverage_disclosure: string;
  visibility_score: number;
  visibility_detail: {
    prompts_tracked: number;
    mentions: VisibilityMention[];
    competitor_share_of_voice: Record<string, number>;
  };
  domain_authority: DomainAuthorityResult;
  crawlability: CrawlabilityEntry[];
  technical_health: TechnicalHealthEntry[];
  llms_txt_status: LlmsTxtStatus;
  entity_consistency: EntityConsistency;
  teasers: Teasers;
  locale: Locale;
  generated_at: string;
}

// ─── Owner report — internal only, still Claude-synthesized ───────────────
export interface OwnerActionItem {
  item: string;
  tag: "DIY" | "Partner" | "Done-For-You";
}

export interface OwnerReport {
  // Always present: these are draft suggestions for the Blueprint-crafting team,
  // never the final Blueprint content — see the resist-scope-creep memory note.
  disclaimer: string;
  flagged_anomalies: string[];
  raw_findings: string;
  competitor_comparison: string | null;
  action_skeleton: OwnerActionItem[];
  generated_at: string;
}

// ─── Client assessment message — short post-payment email, Claude-synthesized ─────
// Distinct from ClientReport above: ClientReport is the data-only /report/[token]
// page (Section 7 of the Assessment Message spec — stays a pure rendering, no LLM).
// This is the short (120-180 word) email sent immediately after payment, generated
// per Section 5 of that spec. top_positive_finding/top_negative_finding/seo_findings
// are picked by deterministic code (src/lib/synthesis/topFindings.ts), never by the
// model — Claude only phrases what's already selected, so "exactly one fact, always
// a real number" is guaranteed by code rather than trusted to model behavior.
export interface TopFinding {
  metric: string;
  value: string;
}

export interface TopNegativeFinding extends TopFinding {
  detail: string;
}

export interface ClientAssessmentMessageInput {
  locale: Locale;
  client_name: string;
  domain: string;
  target_market: string;
  client_context: string;
  visibility_score: { value: number; engines: string[] };
  domain_authority: DomainAuthorityResult;
  top_positive_finding: TopFinding;
  top_negative_finding: TopNegativeFinding;
  business_days: number;
}
