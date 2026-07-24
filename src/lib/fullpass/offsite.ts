import type { OffsiteResult } from "../types";

async function checkYouTube(companyName: string): Promise<{ channel_found: boolean; videos_found: number }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log("[offsite] Skipped YouTube check (no YOUTUBE_API_KEY set)");
    return { channel_found: false, videos_found: 0 };
  }

  try {
    const params = new URLSearchParams({
      part: "snippet",
      type: "channel",
      q: companyName,
      maxResults: "1",
      key: apiKey,
    });
    const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (!channelRes.ok) return { channel_found: false, videos_found: 0 };
    const channelData = await channelRes.json();
    const channelId: string | undefined = channelData?.items?.[0]?.id?.channelId;
    if (!channelId) return { channel_found: false, videos_found: 0 };

    const videoParams = new URLSearchParams({
      part: "id",
      channelId,
      type: "video",
      maxResults: "50",
      key: apiKey,
    });
    const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${videoParams.toString()}`);
    const videosData = videosRes.ok ? await videosRes.json() : null;
    const videos_found = videosData?.pageInfo?.totalResults ?? videosData?.items?.length ?? 0;

    return { channel_found: true, videos_found };
  } catch (err) {
    console.error("[offsite] YouTube check failed:", err);
    return { channel_found: false, videos_found: 0 };
  }
}

// Entity-consistency (brand name/NAP) checks across LinkedIn, Crunchbase, G2, and
// Capterra. None of these have a public "does this company have a profile" API —
// the spec explicitly allows "best-effort scrape or manual-list fallback... for v1",
// so these are clearly-stubbed false checks rather than real scraping (fragile,
// ToS risk). Wire up a real check per source (a maintained list, a licensed data
// provider, or a scraping service you're comfortable with) to go live — this
// function is the only thing that needs to change.
async function checkEntityConsistency(): Promise<OffsiteResult["entity_consistency"]> {
  return { linkedin: false, crunchbase: false, g2: false, capterra: false };
}

export async function runOffsiteChecks(companyName: string): Promise<OffsiteResult> {
  const [youtube, entity_consistency] = await Promise.all([checkYouTube(companyName), checkEntityConsistency()]);

  return { youtube, entity_consistency };
}
