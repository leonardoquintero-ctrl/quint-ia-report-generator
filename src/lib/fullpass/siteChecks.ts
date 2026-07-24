import * as cheerio from "cheerio";
import { parseRobotsGroups, isBotBlocked } from "../fastpass/robots";
import { checkLlmsTxt } from "../fastpass/checks";
import type { CrawlabilityEntry, SchemaInventoryEntry, SiteChecksResult, TechnicalHealthEntry } from "../types";

const USER_AGENT = "Mozilla/5.0 (compatible; QuintIABlueprintBot/1.0)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGES = 10;
// Below this word count on a 200 response, treat the page as a JS-only shell an AI
// crawler can't read — best-effort heuristic, not a certainty (some legitimately
// short pages exist), but it's the signal the spec explicitly asks for.
const JS_SHELL_WORD_COUNT_THRESHOLD = 50;

function normalizeUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

interface FetchedPage {
  status: number;
  ok: boolean;
  html: string | null;
  compressed: boolean;
}

async function fetchPage(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: controller.signal });
    const compressed = /gzip|br|deflate/i.test(res.headers.get("content-encoding") ?? "");
    if (!res.ok) return { status: res.status, ok: false, html: null, compressed };
    return { status: res.status, ok: true, html: await res.text(), compressed };
  } catch {
    return { status: 0, ok: false, html: null, compressed: false };
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

function bodyWordCount(html: string): number {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return $("body").text().split(/\s+/).filter(Boolean).length;
}

// Page-set discovery: sitemap.xml if present (real signal of the site's actual
// structure), else a fallback list of common paths. No traffic/analytics data source
// exists, so "top 10 pages by traffic" (as the spec suggests) isn't available —
// this is the documented, honest fallback.
async function discoverPages(baseUrl: string): Promise<string[]> {
  const sitemap = await fetchPage(`${baseUrl}/sitemap.xml`);
  if (sitemap.ok && sitemap.html) {
    try {
      const $ = cheerio.load(sitemap.html, { xmlMode: true });
      const paths = $("url > loc")
        .map((_, el) => {
          try {
            return new URL($(el).text()).pathname || "/";
          } catch {
            return null;
          }
        })
        .get()
        .filter((p): p is string => p !== null);
      if (paths.length > 0) {
        return [...new Set(["/", ...paths])].slice(0, MAX_PAGES);
      }
    } catch {
      // malformed sitemap — fall through to the static fallback
    }
  }

  return ["/", "/about", "/pricing", "/blog", "/contact", "/products", "/services", "/faq", "/docs", "/careers"].slice(
    0,
    MAX_PAGES
  );
}

async function checkPage(
  baseUrl: string,
  path: string
): Promise<{ crawlability: CrawlabilityEntry; technicalHealth: TechnicalHealthEntry | null }> {
  const page = await fetchPage(`${baseUrl}${path}`);

  if (!page.ok) {
    return { crawlability: { path, status: page.status, crawlable: false, reason: "blocked" }, technicalHealth: null };
  }

  const html = page.html ?? "";
  const wordCount = bodyWordCount(html);
  const isJsShell = wordCount < JS_SHELL_WORD_COUNT_THRESHOLD;

  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const h1_present = $("h1").length > 0;

  return {
    crawlability: {
      path,
      status: page.status,
      crawlable: !isJsShell,
      ...(isJsShell ? { reason: "js_only_shell" as const } : {}),
    },
    technicalHealth: { path, h1_present, word_count: wordCount, compressed: page.compressed },
  };
}

// Candidate paths per knowledge-graph page. No sitemap-driven discovery for these
// specifically (they need a positive match on a known convention, not just "a page
// exists") — tries the common conventions directly.
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
    const page = await fetchPage(`${baseUrl}${path}`);
    if (page.ok && page.html) {
      return { exists: true, has_schema: extractJsonLdTypes(page.html).length > 0 };
    }
  }
  return { exists: false, has_schema: false };
}

// Content-shape heuristics are explicitly best-effort pattern matching, not ground
// truth — they inform the owner report's raw findings, not a certified audit.
function analyzeContentShape(html: string): SiteChecksResult["content_shape"] {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const firstParagraph = $("p").first().text().trim();
  const leadText = metaDescription || firstParagraph;
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

async function checkLlmsTxtStatus(
  baseUrl: string
): Promise<{ status: SiteChecksResult["llms_txt_status"]; botBlocks: SiteChecksResult["robots_txt_bot_blocks"] }> {
  const errors: string[] = [];

  const llmsPage = await fetchPage(`${baseUrl}/llms.txt`);
  const llmsCheck = llmsPage.ok && llmsPage.html ? checkLlmsTxt(llmsPage.html) : { present: false, valid_format: false, issues: [] };
  if (llmsPage.ok) errors.push(...llmsCheck.issues);
  else errors.push("llms.txt not found");

  const botBlocks = {
    blocks_gptbot: false,
    blocks_claudebot: false,
    blocks_perplexitybot: false,
    blocks_google_extended: false,
  };

  const robotsPage = await fetchPage(`${baseUrl}/robots.txt`);
  let robots_txt_valid = false;
  if (robotsPage.ok && robotsPage.html) {
    const groups = parseRobotsGroups(robotsPage.html);
    botBlocks.blocks_gptbot = isBotBlocked(groups, "gptbot");
    botBlocks.blocks_claudebot = isBotBlocked(groups, "claudebot");
    botBlocks.blocks_perplexitybot = isBotBlocked(groups, "perplexitybot");
    botBlocks.blocks_google_extended = isBotBlocked(groups, "google-extended");
    if (groups.size === 0) errors.push("robots.txt present but no parseable User-agent directives found");
    else robots_txt_valid = true;
  } else {
    errors.push("robots.txt not found");
  }

  return {
    status: { llms_txt_valid: llmsPage.ok && llmsCheck.valid_format, robots_txt_valid, errors },
    botBlocks,
  };
}

export async function runSiteChecks(rawDomain: string): Promise<SiteChecksResult> {
  const baseUrl = normalizeUrl(rawDomain);

  const [homepage, pages, kgPages, llmsStatus, pagespeed] = await Promise.all([
    fetchPage(baseUrl),
    discoverPages(baseUrl).then((paths) => Promise.all(paths.map((path) => checkPage(baseUrl, path)))),
    Promise.all([
      checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.about),
      checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.team),
      checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.products),
      checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.faq),
      checkKnowledgeGraphPage(baseUrl, KG_PAGE_CANDIDATES.glossary),
    ]),
    checkLlmsTxtStatus(baseUrl),
    checkPageSpeed(baseUrl),
  ]);

  const homepageTypes = homepage.html ? extractJsonLdTypes(homepage.html) : [];
  const schema_inventory: SchemaInventoryEntry[] = [
    { page: "/", types_found: homepageTypes, types_expected: ["Organization", "WebSite"] },
  ];

  const [about, team, products, faq, glossary] = kgPages;
  const content_shape = homepage.html
    ? analyzeContentShape(homepage.html)
    : { direct_answer_lead: false, faq_blocks_found: 0, comparison_tables_found: 0, author_bylines_found: 0 };

  return {
    crawlability: pages.map((p) => p.crawlability),
    technical_health: pages.map((p) => p.technicalHealth).filter((t): t is TechnicalHealthEntry => t !== null),
    schema_inventory,
    knowledge_graph_pages: { about, team, products, faq, glossary },
    content_shape,
    llms_txt_status: llmsStatus.status,
    robots_txt_bot_blocks: llmsStatus.botBlocks,
    pagespeed,
  };
}
