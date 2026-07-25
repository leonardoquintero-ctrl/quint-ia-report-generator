import { after } from "next/server";
import { runFullPass } from "../fullpass/runFullPass";

// Decouples "make sure the full pass eventually runs" from how it actually gets
// triggered. No Upstash QStash account exists yet (confirmed with the user), so
// DirectCallQueueProvider is the default; QStashQueueProvider is ready to switch to
// the moment credentials exist — swapping getQueueProvider()'s return value is the
// only change needed, nothing else in the app depends on which one is active.
export interface QueueProvider {
  enqueueFullPass(reportId: string): Promise<void>;
}

// Fallback for local dev / until QStash is set up: runs the full pass in the same
// process via Next's after(), same deferred-execution pattern the sibling funnel app
// uses. This does NOT solve the Vercel timeout risk the full pass carries (that's
// exactly why QStashQueueProvider exists) — it's a stand-in, not a production answer.
class DirectCallQueueProvider implements QueueProvider {
  async enqueueFullPass(reportId: string): Promise<void> {
    after(() => runFullPass(reportId));
  }
}

// Publishes to QStash's REST API directly (no need for their SDK just to publish;
// @upstash/qstash is used only for verifying the callback's signature in
// /api/fullpass/run). QSTASH_URL matters: some accounts get a region-pinned QStash
// cluster (e.g. https://qstash-us-east-1.upstash.io) rather than the shared global
// https://qstash.upstash.io — publishing to the wrong one 404s with "user not found
// in this region," so QSTASH_URL must come from the same console page as the token,
// not be assumed.
class QStashQueueProvider implements QueueProvider {
  async enqueueFullPass(reportId: string): Promise<void> {
    const token = process.env.QSTASH_TOKEN;
    const baseUrl = process.env.QSTASH_CALLBACK_BASE_URL;
    const qstashUrl = process.env.QSTASH_URL || "https://qstash.upstash.io";
    if (!token || !baseUrl) {
      throw new Error("QSTASH_TOKEN and QSTASH_CALLBACK_BASE_URL must both be set to use QStashQueueProvider.");
    }

    const destination = `${baseUrl.replace(/\/$/, "")}/api/fullpass/run`;
    const res = await fetch(`${qstashUrl.replace(/\/$/, "")}/v2/publish/${encodeURIComponent(destination)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportId }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`QStash publish failed (${res.status}): ${body}`);
    }
  }
}

export function getQueueProvider(): QueueProvider {
  if (process.env.QSTASH_TOKEN && process.env.QSTASH_CALLBACK_BASE_URL) {
    return new QStashQueueProvider();
  }
  return new DirectCallQueueProvider();
}
