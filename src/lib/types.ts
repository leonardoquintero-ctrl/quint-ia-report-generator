export type Locale = "EN" | "ES";

export interface CompetitorInput {
  name?: string;
  domain: string;
}

// ─── Fast pass (Handoff spec §4.1) ─────────────────────────────────────────
// Purely technical, deterministic, no paid APIs — computed synchronously on intake.
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

// ─── Full pass — site & content (§4.2) ─────────────────────────────────────
export interface SchemaInventoryEntry {
  page: string;
  types_found: string[];
  types_expected: string[];
}

export interface KnowledgeGraphPageCheck {
  exists: boolean;
  has_schema: boolean;
}

export interface SiteChecksResult {
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
  pagespeed: { lcp_seconds: number; score: number };
}

// ─── Full pass — prompt visibility (§4.3) ──────────────────────────────────
export type EngineName = "perplexity" | "openai" | "claude";

export interface CitationSource {
  url: string;
  title: string;
}

export interface PromptVisibilityResult {
  prompt: string;
  engine: EngineName;
  client_cited: boolean;
  citations_returned: CitationSource[];
  competitor_cited: { domain: string; cited: boolean }[];
  error?: string;
}

export interface VisibilityResult {
  prompts_tested: number;
  engines_covered: EngineName[];
  engines_not_covered: string[];
  coverage_note: string;
  results: PromptVisibilityResult[];
}

// ─── Full pass — off-site presence (§4.4) ──────────────────────────────────
export interface OffsiteResult {
  youtube: { channel_found: boolean; videos_found: number };
  g2_capterra: { g2_profile: boolean; capterra_profile: boolean; review_count: number };
  source_3_tbd: Record<string, never>;
  source_4_tbd: Record<string, never>;
}

// ─── Assembled full-pass object stored in reports.full_pass_json ──────────
export interface FullPassResult {
  site: SiteChecksResult;
  visibility: VisibilityResult;
  offsite: OffsiteResult;
}

// ─── Synthesized client report (§6.1) ──────────────────────────────────────
export interface ClientReportFinding {
  finding: string;
  why_it_matters: string;
  what_fixing_it_does: string;
}

export interface ClientReportScorecardEntry {
  pillar: "technical_readability" | "owned_knowledge_graph" | "content_shape" | "offsite_citations";
  label: string;
  summary: string;
}

export interface ClientReport {
  disclaimer: string;
  scorecard: ClientReportScorecardEntry[];
  findings: ClientReportFinding[];
  coverage_disclosure: string;
  closing: string;
  locale: Locale;
  generated_at: string;
}

// ─── Synthesized owner report (§6.2) ───────────────────────────────────────
export interface OwnerActionItem {
  item: string;
  tag: "DIY" | "Partner" | "Done-For-You";
}

export interface OwnerReport {
  flagged_anomalies: string[];
  raw_findings: string; // plain-language but unsimplified narrative per pillar
  competitor_comparison: string | null;
  action_skeleton: OwnerActionItem[];
  generated_at: string;
}
