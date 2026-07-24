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

// G2/Capterra have no public "does this domain have a profile" API — checking this
// for real means either scraping (fragile, ToS risk) or a paid search API
// (SerpAPI/DataForSEO-style), neither of which is decided yet. Stubbed per the
// handoff's own explicit deferral (§8) rather than faking a signal.
async function checkG2Capterra(): Promise<OffsiteResult["g2_capterra"]> {
  return { g2_profile: false, capterra_profile: false, review_count: 0 };
}

export async function runOffsiteChecks(companyName: string): Promise<OffsiteResult> {
  const [youtube, g2_capterra] = await Promise.all([checkYouTube(companyName), checkG2Capterra()]);

  return {
    youtube,
    g2_capterra,
    // Two remaining sources are still unnamed (handoff §9 open item) — structure is
    // ready, nothing to populate yet.
    source_3_tbd: {},
    source_4_tbd: {},
  };
}
