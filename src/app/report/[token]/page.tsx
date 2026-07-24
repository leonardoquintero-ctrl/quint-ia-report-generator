import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { NavBar } from "@/components/NavBar";
import type { ClientReport } from "@/lib/types";

const PILLAR_COLORS: Record<string, string> = {
  technical_readability: "var(--cyan)",
  owned_knowledge_graph: "var(--indigo)",
  content_shape: "var(--violet)",
  offsite_citations: "var(--mint)",
};

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [report] = await db.select().from(reports).where(eq(reports.id, token));

  if (!report) {
    return <StatusScreen title="Report not found" body="This report link doesn't match anything on file." />;
  }

  if (report.status === "full_pass_failed") {
    return (
      <StatusScreen
        title="We hit a snag generating this report"
        body="Something went wrong finishing the full analysis. Reach out and we'll get it regenerated."
      />
    );
  }

  if (report.status !== "full_pass_done" || !report.clientReportJson) {
    return (
      <StatusScreen
        title="Your Blueprint is still being generated"
        body="You should have already received an instant snapshot by email. The full report typically follows within a few minutes to a few business days depending on volume — check back soon."
      />
    );
  }

  const clientReport: ClientReport = JSON.parse(report.clientReportJson);
  const generatedDate = new Date(clientReport.generated_at).toLocaleDateString(
    clientReport.locale === "ES" ? "es-ES" : "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <NavBar tag="Quick-Start Blueprint" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 40px 100px" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--indigo)",
          }}
        >
          AI Visibility Report
        </span>
        <h1 style={{ fontSize: "clamp(26px, 3vw, 36px)", fontWeight: 700, letterSpacing: "-0.035em", marginTop: 12 }}>
          {report.companyName}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 8, marginBottom: 32 }}>
          Generated {generatedDate} · {report.domain}
        </p>

        <div className="gloss-card" style={{ padding: "22px 26px", marginBottom: 24, borderLeft: "3px solid var(--indigo)" }}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>
            {clientReport.disclaimer}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 2,
            borderRadius: 14,
            overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border-subtle)",
            marginBottom: 32,
          }}
        >
          {clientReport.scorecard.map((entry) => (
            <div key={entry.pillar} style={{ background: "var(--bg-surface)", padding: 24, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: PILLAR_COLORS[entry.pillar] ?? "var(--indigo)",
                }}
              />
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8, color: PILLAR_COLORS[entry.pillar] ?? "var(--indigo)" }}>
                {entry.label}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>{entry.summary}</div>
            </div>
          ))}
        </div>

        <div className="gloss-card" style={{ padding: "32px 32px", marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 22 }}>Top findings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {clientReport.findings.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 16 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(79,110,247,0.12)",
                    border: "1px solid rgba(79,110,247,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--indigo)",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>{f.finding}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--text-secondary)", marginBottom: 6 }}>
                    <strong style={{ color: "var(--text-primary)" }}>Why it matters:</strong> {f.why_it_matters}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--text-primary)" }}>What fixing it does:</strong> {f.what_fixing_it_does}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}>
          {clientReport.coverage_disclosure}
        </p>

        <div
          className="gloss-card"
          style={{ padding: "28px 32px", textAlign: "center", background: "rgba(79,110,247,0.06)", borderColor: "rgba(79,110,247,0.2)" }}
        >
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>{clientReport.closing}</p>
        </div>
      </main>
    </div>
  );
}

function StatusScreen({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <NavBar tag="Quick-Start Blueprint" />
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</p>
      </main>
    </div>
  );
}
