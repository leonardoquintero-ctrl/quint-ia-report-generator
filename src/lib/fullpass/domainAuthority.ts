import type { DomainAuthorityResult } from "../types";

// Domain Authority / referring-domain count needs an SEO data provider (Ahrefs or
// Moz) — no account/key exists yet. Same swap pattern as every other pending
// integration in this app: interface, mock default, real adapter later.
export interface DomainAuthorityProvider {
  getReferringDomains(domain: string): Promise<DomainAuthorityResult>;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// MOCK — fabricates a deterministic, plausible-looking referring-domain count per
// domain so results are stable across runs. NOT a real SEO signal.
class MockDomainAuthorityProvider implements DomainAuthorityProvider {
  async getReferringDomains(domain: string): Promise<DomainAuthorityResult> {
    const seed = hashString(domain.toLowerCase());
    return { referring_domains: seed % 500, source: "mock" };
  }
}

// TODO: replace with a real Ahrefs or Moz adapter once a provider is chosen and an
// API key exists — swap the return value here, nothing else in the pipeline changes.
export function getDomainAuthorityProvider(): DomainAuthorityProvider {
  return new MockDomainAuthorityProvider();
}
