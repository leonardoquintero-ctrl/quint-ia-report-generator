import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";

// JSON status endpoint — report-generator otherwise only exposes an HTML report page
// (/report/[token]), which isn't fetchable as data. Lets other systems (e.g. the
// funnel demo's status-polling proxy) check progress without scraping HTML.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [report] = await db
    .select({ status: reports.status, error: reports.fullPassError })
    .from(reports)
    .where(eq(reports.id, id));

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({ status: report.status, error: report.error });
}
