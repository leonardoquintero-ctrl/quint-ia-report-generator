import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { runFullPass } from "@/lib/fullpass/runFullPass";

// The full pass can run for minutes across ~60 live LLM calls — this needs the
// platform's max function duration, not the default. (Requires a Vercel plan that
// supports extended durations; Hobby caps at 60s regardless of this setting.)
export const maxDuration = 300;

// QStash callback target. Verifies the request actually came from QStash when
// signing keys are configured; skipped in local dev / before Upstash credentials
// exist, since DirectCallQueueProvider (src/lib/queue/provider.ts) calls runFullPass
// directly in-process and never hits this route at all in that mode. This route
// still works for manual testing via curl regardless.
async function verifyQStashSignature(req: Request, rawBody: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return true; // not configured yet — allow through

  const signature = req.headers.get("upstash-signature");
  if (!signature) return false;

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  try {
    return await receiver.verify({ signature, body: rawBody });
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  const verified = await verifyQStashSignature(req, rawBody);
  if (!verified) {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody || "{}");
  const reportId = body?.reportId;
  if (typeof reportId !== "string" || !reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  await runFullPass(reportId);

  return NextResponse.json({ ok: true });
}
