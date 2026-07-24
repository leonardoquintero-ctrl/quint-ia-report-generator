import type { OffsiteResult, SiteChecksResult, Teasers } from "../types";

// Counts only, never content — per the spec, the client-facing report may disclose
// that gaps exist, but never what to do about them. These counts are derived
// mechanically from data already computed elsewhere in the full pass; no new checks,
// no LLM call, no risk of drifting into recommendation-shaped language.
export function computeTeasers(site: SiteChecksResult, offsite: OffsiteResult): Teasers {
  const kg = site.knowledge_graph_pages;
  const kgGaps = Object.values(kg).filter((page) => !page.exists || !page.has_schema).length;

  const homepageSchemaGap = site.schema_inventory[0]?.types_found.length === 0 ? 1 : 0;
  const contentShapeGaps = [
    !site.content_shape.direct_answer_lead,
    site.content_shape.faq_blocks_found === 0,
    site.content_shape.comparison_tables_found === 0,
    site.content_shape.author_bylines_found === 0,
  ].filter(Boolean).length;

  const content_opportunities_found = kgGaps + homepageSchemaGap + contentShapeGaps;

  const entityGaps = Object.values(offsite.entity_consistency).filter((present) => !present).length;
  const youtubeGap = offsite.youtube.channel_found ? 0 : 1;

  const third_party_channels_flagged = entityGaps + youtubeGap;

  return { content_opportunities_found, third_party_channels_flagged };
}
