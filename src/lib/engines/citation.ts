import type { EngineCitation } from "./types";

function extractDomain(url: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Citation-based only (not text-mention matching) — the data contract's
// citations_returned/competitor_cited fields are specifically about what the engine
// actually cited as a source, not whether the domain name happened to appear in prose.
export function isDomainCited(citations: EngineCitation[], targetDomain: string): boolean {
  const target = extractDomain(targetDomain);
  if (!target) return false;
  return citations.some((c) => {
    const citedDomain = extractDomain(c.url);
    return citedDomain !== null && citedDomain.includes(target);
  });
}
