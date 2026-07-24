import * as cheerio from "cheerio";
import type { SchemaInventoryEntry, SiteChecksResult } from "../types";

const USER_AGENT = "Mozilla/5.0 (compatible; QuintIABlueprintBot/1.0)";
const FETCH_TIMEOUT_MS = 10_000;

function normalizeUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

async function fetchPage(url: string): Promise<{ ok: boolean; html: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: controller.signal });
    if (!res.ok) return { ok: false, html: null };
    return { ok: true, html: await res.text() };
  } catch {
    return { ok: false, html: null };
  } finally {
    clearTimeout(timer);
  }
}

function collectJsonLdTypes(node: unknown, acc: string[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj["@type"]) {
    const t = obj["@type"];
    if (Array.isArray(t)) acc.push(...t.map(String));
    else acc.push(String(t));
  }
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) collectJsonLdTypes(item, acc);
  }
}

function extractJsonLdTypes(html: string): string[] {
  const $ = cheerio.load(html);
  const types: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) collectJsonLdTypes(item, types);
    } catch {
      // malformed JSON-LD — not our job to fix it, just note it wasn't parseable
    }
  });
  return [...new Set(types)];
}

// Candidate paths per knowledge-graph page. No sitemap-driven discovery yet (a
// reasonable v2 improvement) — this tries the common conventions directly.
const KG_PAGE_CANDIDATES: Record<string, string[]> = {
  about: ["/about", "/about-us", "/company"],
  team: ["/team", "/our-team", "/leadership"],
  products: ["/products", "/services", "/solutions"],
  faq: ["/faq", "/faqs", "/help"],
  glossary: ["/glossary", "/resources/glossary"],
};

async function checkKnowledgeGraphPage(
  baseUrl: string,
  candidates: string[]
): Promise<{ exists: boolean; has_schema: boolean }> {
  for (const path of candidates) {
    const { ok, html } = await fetchPage(`${baseUrl}${path}`);
    if (ok && html) {
      return { exists: true, has_schema: extractJsonLdTypes(html).length > 0 };
    }
  }
  return { exists: false, has_schema: false };
}

// Content-shape heuristics are explicitly best-effort pattern matching, not ground
// truth — they inform the report's "content shape" pillar, not a certified audit.
function analyzeContentShape(html: string): SiteChecksResult["content_shape"] {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const firstParagraph = $("p").first().text().trim();
  const leadText = metaDescription || firstParagraph;
  // Heuristic: a lead that's a concise, direct sentence (not empty, not a wall of
  // marketing copy) reads as "answers what this is" up front.
  const direct_answer_lead = leadText.length > 0 && leadText.length < 220;

  const faqHeadingMatches = $("h1, h2, h3")
    .filter((_, el) => /frequently asked questions|faq/i.test($(el).text()))
    .length;
  const detailsBlocks = $("details").length;
  const hasFaqSchema = extractJsonLdTypes($.html()).includes("FAQPage");
  const faq_blocks_found = hasFaqSchema ? Math.max(1, faqHeadingMatches + detailsBlocks) : faqHeadingMatches + detailsBlocks;

  const comparison_tables_found = $("table").filter((_, el) => {
    const context = ($(el).prev().text() + " " + ($(el).attr("aria-label") ?? "") + " " + $(el).find("caption").text()).toLowerCase();
    return /\bvs\b|compar/i.test(context);
  }).length;

  const author_bylines_found = $('[rel="author"], .author, .byline, [itemprop="author"]').length;

  return { direct_answer_lead, faq_blocks_found, comparison_tables_found, author_bylines_found };
}

async function checkPageSpeed(url: string): Promise<{ lcp_seconds: number; score: number }> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({ url, category: "PERFORMANCE", strategy: "MOBILE" });
  if (apiKey) params.set("key", apiKey);

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`);
    if (!res.ok) return { lcp_seconds: 0, score: 0 };
    const data = await res.json();
    const score = Math.round((data?.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    const lcpMs = data?.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue ?? 0;
    return { lcp_seconds: Math.round((lcpMs / 1000) * 10) / 10, score };
  } catch {
    return { lcp_seconds: 0, score: 0 };
  }
}

export async function runSiteChecks(rawDomain: string): Promise<SiteChecksResult> {
  const baseUrl = normalizeUrl(rawDomain);

  const homepage = await fetchPage(baseUrl);
  const homepageTypes = homepage.html ? extractJsonLdTypes(homepage.html) : [];

  const schema_inventory: SchemaInventoryEntry[] = [
    { page: "/", types_found: homepageTypes, types_expected: ["Organization", "WebSite"] },
  ];

  const [about, team, products, faq, glossary] = await Promise.all([
    checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.about),
    checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.team),
    checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.products),
    checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.faq),
    checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.glossary),
  ]);

  const content_shape = homepage.html
    ? analyzeContentShape(homepage.html)
    : { direct_answer_lead: false, faq_blocks_found: 0, comparison_tables_found: 0, author_bylines_found: 0 };

  const pagespeed = await checkPageSpeed(baseUrl);

  return {
    schema_inventory,
    knowledge_graph_pages: { about, team, products, faq, glossary },
    content_shape,
    pagespeed,
  };
}
