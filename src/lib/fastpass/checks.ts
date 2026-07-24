import * as cheerio from "cheerio";
import { parseRobotsGroups, isBotBlocked } from "./robots";
import type { FastPassResult } from "../types";

const USER_AGENT = "Mozilla/5.0 (compatible; QuintIABlueprintBot/1.0)";
const FETCH_TIMEOUT_MS = 10_000;

function normalizeUrl(domain: string): string {
  if (/^https?:\/\//i.test(domain)) return domain;
  return `https://${domain}`;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function checkLlmsTxt(content: string): { present: boolean; valid_format: boolean; issues: string[] } {
  const issues: string[] = [];
  const trimmed = content.trim();

  const hasH1 = /^#\s+.+/m.test(trimmed);
  if (!hasH1) issues.push("Missing a top-level H1 title");

  const hasLinks = /\[[^\]]+\]\([^)]+\)/.test(trimmed);
  if (!hasLinks) issues.push("No markdown links found");

  return { present: true, valid_format: issues.length === 0, issues };
}

export async function runFastPassChecks(rawDomain: string): Promise<FastPassResult> {
  const targetUrl = normalizeUrl(rawDomain);

  const result: FastPassResult = {
    domain: rawDomain,
    timestamp: new Date().toISOString(),
    homepage_crawlable: false,
    http_status: 0,
    ssl_valid: false,
    h1_present: false,
    h1_text: "",
    word_count_homepage: 0,
    page_compressed: false,
    llms_txt: { present: false, valid_format: false, issues: [] },
    robots_txt: {
      present: false,
      blocks_gptbot: false,
      blocks_claudebot: false,
      blocks_perplexitybot: false,
      blocks_google_extended: false,
    },
  };

  // Homepage fetch. ssl_valid mirrors whether we could complete a request over
  // HTTPS at all — a real TLS failure (expired/self-signed/mismatched cert) throws
  // before we ever get a response, same as a DNS or connection failure. We can't
  // perfectly distinguish "bad cert" from "site unreachable" with a plain fetch, but
  // both are legitimate "can't safely reach this site" signals worth surfacing as
  // false rather than guessing true from the URL string alone.
  try {
    const homeRes = await fetchWithTimeout(targetUrl);
    result.ssl_valid = true;
    result.http_status = homeRes.status;
    result.homepage_crawlable = homeRes.ok;
    result.page_compressed = /gzip|br|deflate/i.test(homeRes.headers.get("content-encoding") ?? "");

    if (homeRes.ok) {
      const html = await homeRes.text();
      const $ = cheerio.load(html);
      $("script, style, noscript").remove();

      const h1 = $("h1").first();
      result.h1_present = h1.length > 0;
      result.h1_text = h1.text().trim();
      result.word_count_homepage = $("body").text().split(/\s+/).filter(Boolean).length;
    }
  } catch {
    result.ssl_valid = false;
    result.homepage_crawlable = false;
    result.http_status = 0;
  }

  // robots.txt
  try {
    const robotsRes = await fetchWithTimeout(`${targetUrl}/robots.txt`);
    if (robotsRes.ok) {
      const robotsText = await robotsRes.text();
      const groups = parseRobotsGroups(robotsText);
      result.robots_txt = {
        present: true,
        blocks_gptbot: isBotBlocked(groups, "gptbot"),
        blocks_claudebot: isBotBlocked(groups, "claudebot"),
        blocks_perplexitybot: isBotBlocked(groups, "perplexitybot"),
        blocks_google_extended: isBotBlocked(groups, "google-extended"),
      };
    }
  } catch {
    // present stays false — a fetch failure here isn't itself a finding
  }

  // llms.txt
  try {
    const llmsRes = await fetchWithTimeout(`${targetUrl}/llms.txt`);
    if (llmsRes.ok) {
      const llmsText = await llmsRes.text();
      result.llms_txt = checkLlmsTxt(llmsText);
    }
  } catch {
    // present stays false
  }

  return result;
}
