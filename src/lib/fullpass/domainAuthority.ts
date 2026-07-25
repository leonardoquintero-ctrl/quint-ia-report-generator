import type { DomainAuthorityResult } from "../types";

// Domain Authority / referring-domain count needs an SEO data provider (Ahrefs or
// Moz). Same swap pattern as every other pending integration in this app: interface,
// mock default, real adapter behind a key check.
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

const MOZ_URL_METRICS_ENDPOINT = "https://lsapi.seomoz.com/v2/url_metrics";

interface MozUrlMetricsResult {
  root_domains_to_root_domain?: number;
  domain_authority?: number;
}

// REAL — Moz Links API v2 (see https://moz.com/help/links-api/making-calls/url-metrics).
// MOZ_API_KEY holds the already-base64-encoded "access_id:secret_key" pair Moz issues
// for HTTP Basic Auth, so it's passed straight through as the Authorization value.
// "root_domains_to_root_domain" is Moz's field for referring-domain count (the number
// of unique root domains currently linking to this root domain) — domain_authority
// itself isn't part of ClientReport (spec only wants the referring-domain count), but
// we keep it in the parsed shape in case owner-report synthesis wants it later.
class MozDomainAuthorityProvider implements DomainAuthorityProvider {
  async getReferringDomains(domain: string): Promise<DomainAuthorityResult> {
    const apiKey = process.env.MOZ_API_KEY;
    if (!apiKey) throw new Error("MOZ_API_KEY is not set — the Moz domain authority check cannot run without it.");

    const response = await fetch(MOZ_URL_METRICS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({ targets: [domain] }),
    });

    if (!response.ok) {
      throw new Error(`Moz url_metrics request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { results?: MozUrlMetricsResult[] };
    const result = data.results?.[0];
    if (!result) throw new Error(`Moz url_metrics returned no results for ${domain}`);

    return { referring_domains: result.root_domains_to_root_domain ?? 0, source: "moz" };
  }
}

export function getDomainAuthorityProvider(): DomainAuthorityProvider {
  return process.env.MOZ_API_KEY ? new MozDomainAuthorityProvider() : new MockDomainAuthorityProvider();
}
