import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { runSiteChecks } from "./siteChecks";
import { runOffsiteChecks } from "./offsite";
import { runPromptVisibilityChecks } from "./visibility";
import { synthesizeClientReport } from "../synthesis/clientReport";
import { synthesizeOwnerReport } from "../synthesis/ownerReport";
import { getEmailProvider } from "../email/provider";
import type { CompetitorInput, FullPassResult, Locale } from "../types";

const OWNER_EMAIL = process.env.OWNER_REPORT_EMAIL ?? "team@quintiavantage.com";

export async function runFullPass(reportId: string): Promise<void> {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) throw new Error(`Report ${reportId} not found`);

  await db.update(reports).set({ status: "full_pass_running", updatedAt: new Date() }).where(eq(reports.id, reportId));

  try {
    const competitors: CompetitorInput[] = JSON.parse(report.competitors || "[]");
    const targetQuestions: string[] = JSON.parse(report.targetQuestions || "[]");
    const locale = report.locale as Locale;

    const [site, visibility, offsite] = await Promise.all([
      runSiteChecks(report.domain),
      runPromptVisibilityChecks(targetQuestions, report.domain, competitors),
      runOffsiteChecks(report.companyName),
    ]);

    const fullPass: FullPassResult = { site, visibility, offsite };

    const [clientReport, ownerReport] = await Promise.all([
      synthesizeClientReport(fullPass, locale),
      synthesizeOwnerReport(fullPass, competitors),
    ]);

    // This DB write is the real "did the pipeline succeed" signal — the report is
    // fully generated and durably stored at this point. Email delivery below is a
    // best-effort notification on top of that, in its own try/catch, so a failure
    // sending either email can never revert an already-successful report back to
    // full_pass_failed.
    await db
      .update(reports)
      .set({
        status: "full_pass_done",
        fullPassJson: JSON.stringify(fullPass),
        clientReportJson: JSON.stringify(clientReport),
        ownerReportJson: JSON.stringify(ownerReport),
        fullPassError: null,
        fullPassCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    try {
      const emailProvider = getEmailProvider();

      // Client report auto-sends here — confirmed with the user: the bespoke,
      // human-crafted Blueprint is a separate later deliverable built from the owner
      // report's skeleton, not gated behind approval in this system.
      await emailProvider.send({
        to: report.email,
        subject: locale === "ES" ? "Tu Quick-Start Blueprint está listo" : "Your Quick-Start Blueprint is ready",
        text: formatClientReportEmail(clientReport, reportId),
      });

      await emailProvider.send({
        to: OWNER_EMAIL,
        subject: `[Owner Report] ${report.companyName} (${report.domain})`,
        text: formatOwnerReportEmail(ownerReport, report.companyName),
      });
    } catch (err) {
      console.error(`Full pass succeeded but email delivery failed for report ${reportId}:`, err);
    }
  } catch (err) {
    console.error(`Full pass failed for report ${reportId}:`, err);
    await db
      .update(reports)
      .set({
        status: "full_pass_failed",
        fullPassError: err instanceof Error ? err.message : "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));
  }
}

function formatClientReportEmail(
  clientReport: Awaited<ReturnType<typeof synthesizeClientReport>>,
  reportId: string
): string {
  const findingsText = clientReport.findings
    .map((f, i) => `${i + 1}. ${f.finding}\n   Why it matters: ${f.why_it_matters}\n   What fixing it does: ${f.what_fixing_it_does}`)
    .join("\n\n");

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${clientReport.disclaimer}\n\n${findingsText}\n\n${clientReport.coverage_disclosure}\n\n${clientReport.closing}\n\nFull report: ${baseUrl}/report/${reportId}`;
}

function formatOwnerReportEmail(
  ownerReport: Awaited<ReturnType<typeof synthesizeOwnerReport>>,
  companyName: string
): string {
  const anomalies = ownerReport.flagged_anomalies.length
    ? ownerReport.flagged_anomalies.map((a) => `- ${a}`).join("\n")
    : "None flagged";
  const actions = ownerReport.action_skeleton.map((a) => `- [${a.tag}] ${a.item}`).join("\n");

  return `FLAGGED ANOMALIES\n${anomalies}\n\nRAW FINDINGS\n${ownerReport.raw_findings}\n\nCOMPETITOR COMPARISON\n${
    ownerReport.competitor_comparison ?? "No competitors supplied"
  }\n\n90-DAY ACTION SKELETON\n${actions}\n\n(${companyName})`;
}
