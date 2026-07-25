import { NextResponse, after } from "next/server";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { intakeWebhookSchema } from "@/lib/validation";
import { runFastPassChecks } from "@/lib/fastpass/checks";
import { sendFastPassEmail } from "@/lib/fastpass/email";
import { getQueueProvider } from "@/lib/queue/provider";
import { eq } from "drizzle-orm";

// HubSpot webhook target — hit once the upstream intake/payment flow (separate app)
// completes and the workflow's tokenized URL / webhook fires. Runs the fast pass
// SYNCHRONOUSLY (this is the "seconds, not days" instant snapshot the CTA flow is
// waiting on) before returning, then hands the full pass off to the queue provider.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = intakeWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  const [report] = await db
    .insert(reports)
    .values({
      hubspotContactId: data.hubspot_contact_id,
      hubspotDealId: data.hubspot_deal_id,
      companyName: data.company_name,
      domain: data.domain,
      targetMarket: data.target_market,
      competitors: JSON.stringify(data.competitors),
      targetQuestions: JSON.stringify(data.target_questions),
      locale: data.locale,
      email: data.email,
      contactName: data.contact_name,
      status: "fast_pass_pending",
    })
    .returning();

  try {
    const fastPass = await runFastPassChecks(data.domain);

    await db
      .update(reports)
      .set({
        status: "fast_pass_done",
        fastPassJson: JSON.stringify(fastPass),
        fastPassEmailSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, report.id));

    // Deferred via after(), not plain fire-and-forget: a slow/failed email must not
    // block the intake response, but without after() the serverless function can
    // freeze right after responding and cut this network call off mid-flight before
    // it (or its .catch() logger) ever completes.
    after(() =>
      sendFastPassEmail(data.email, fastPass, data.locale).catch((err) =>
        console.error(`[intake] Fast-pass email failed for report ${report.id}:`, err)
      )
    );
  } catch (err) {
    console.error(`[intake] Fast pass failed for report ${report.id}:`, err);
    // Fast pass failing doesn't fail the whole intake — the full pass can still run
    // and produce a report; we just log it and continue.
  }

  await getQueueProvider().enqueueFullPass(report.id);

  return NextResponse.json({ reportId: report.id, status: "fast_pass_done" });
}
