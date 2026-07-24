import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { NavBar } from "@/components/NavBar";
import type { ClientReport } from "@/lib/types";

function scoreColor(score: number): string {
  if (score >= 70) return "var(--mint)";
  if (score >= 40) return "var(--amber)";
  return "var(--red)";
}

function statusBadge(ok: boolean, trueLabel = "Valid", falseLabel = "Invalid"): { label: string; color: string } {
  return ok ? { label: trueLabel, color: "var(--mint)" } : { label: falseLabel, color: "var(--red)" };
}

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
        title="Your snapshot is still being generated"
        body="You should have already received an instant snapshot by email. This full diagnostic typically follows shortly after — check back soon."
      />
    );
  }

  const clientReport: ClientReport = JSON.parse(report.clientReportJson);
  const generatedDate = new Date(clientReport.generated_at).toLocaleDateString(
    clientReport.locale === "ES" ? "es-ES" : "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );
  const scoreCircumference = 2 * Math.PI * 58;
  const color = scoreColor(clientReport.visibility_score);
  const scoreDash = `${(clientReport.visibility_score / 100) * scoreCircumference} ${scoreCircumference}`;
  const maxShare = Math.max(1, ...Object.values(clientReport.visibility_detail.competitor_share_of_voice));

  return (
    <div style={{ minHeight: "100vh" }}>
      <NavBar tag="Instant AI Visibility Snapshot" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 40px 100px" }}>
        <span
          style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--indigo)" }}
        >
          Instant AI Visibility Snapshot
        </span>
        <h1 style={{ fontSize: "clamp(26px, 3vw, 36px)", fontWeight: 700, letterSpacing: "-0.035em", marginTop: 12 }}>
          {report.companyName}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 8, marginBottom: 32 }}>
          Generated {generatedDate} · {clientReport.domain} · Target market: {clientReport.target_market}
        </p>

        <div className="gloss-card" style={{ padding: "22px 26px", marginBottom: 24, borderLeft: "3px solid var(--indigo)" }}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>{clientReport.disclaimer}</p>
        </div>

        {/* Score + key counts */}
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, marginBottom: 18 }}>
          <div
            className="gloss-card"
            style={{ padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}
          >
            <div style={{ position: "relative", width: 120, height: 120, marginBottom: 12 }}>
              <svg width="120" height="120" viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="66" cy="66" r="58" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                <circle cx="66" cy="66" r="58" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={scoreDash} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 700, color }}>
                  {clientReport.visibility_score}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>/ 100</span>
              </div>
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Visibility Score</span>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>ChatGPT + Perplexity, {clientReport.visibility_detail.prompts_tracked} prompts</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}>
            <Metric label="Referring domains" value={String(clientReport.domain_authority.referring_domains)} detail={`Source: ${clientReport.domain_authority.source}`} color="var(--cyan)" />
            <Metric label="Content opportunities found" value={String(clientReport.teasers.content_opportunities_found)} detail="Detailed in your full Blueprint" color="var(--violet)" />
            <Metric label="Third-party channels flagged" value={String(clientReport.teasers.third_party_channels_flagged)} detail="Detailed in your full Blueprint" color="var(--pink)" />
            <Metric label="Pages checked" value={String(clientReport.crawlability.length)} detail="Crawlability + technical health" color="var(--mint)" />
          </div>
        </div>

        {/* Competitor share of voice */}
        <div className="gloss-card" style={{ padding: "28px 32px", marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>Share of voice</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(clientReport.visibility_detail.competitor_share_of_voice).map(([domain, share]) => {
              const isClient = domain === clientReport.domain;
              return (
                <div key={domain}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: isClient ? 700 : 500, color: isClient ? "var(--indigo)" : "var(--text-secondary)" }}>
                      {domain}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: isClient ? "var(--indigo)" : "var(--text-secondary)" }}>
                      {share}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 4,
                        width: `${Math.round((share / maxShare) * 100)}%`,
                        background: isClient ? "linear-gradient(90deg,#4F6EF7,#00D4FF)" : "rgba(255,255,255,0.16)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Crawlability + technical health */}
        <div className="gloss-card" style={{ padding: "28px 32px", marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>Crawlability &amp; technical health</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>Path</th>
                  <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
                  <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>Crawlable</th>
                  <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>H1</th>
                  <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>Word count</th>
                  <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 500 }}>Compressed</th>
                </tr>
              </thead>
              <tbody>
                {clientReport.crawlability.map((c) => {
                  const health = clientReport.technical_health.find((t) => t.path === c.path);
                  return (
                    <tr key={c.path} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace" }}>{c.path}</td>
                      <td style={{ padding: "10px 12px" }}>{c.status || "—"}</td>
                      <td style={{ padding: "10px 12px", color: c.crawlable ? "var(--mint)" : "var(--red)" }}>
                        {c.crawlable ? "Yes" : c.reason === "js_only_shell" ? "No (JS-only shell)" : "No (blocked)"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{health ? (health.h1_present ? "Yes" : "No") : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{health ? health.word_count : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{health ? (health.compressed ? "Yes" : "No") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* llms.txt / robots.txt + entity consistency */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
          <div className="gloss-card" style={{ padding: "28px 32px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>AI crawler access</h2>
            <div style={{ display: "flex", gap: 24, marginBottom: 14 }}>
              <StatusRow label="llms.txt" ok={clientReport.llms_txt_status.llms_txt_valid} />
              <StatusRow label="robots.txt" ok={clientReport.llms_txt_status.robots_txt_valid} />
            </div>
            {clientReport.llms_txt_status.errors.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {clientReport.llms_txt_status.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="gloss-card" style={{ padding: "28px 32px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Entity consistency</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              <StatusRow label="LinkedIn" ok={clientReport.entity_consistency.linkedin} trueLabel="Found" falseLabel="Not found" />
              <StatusRow label="Crunchbase" ok={clientReport.entity_consistency.crunchbase} trueLabel="Found" falseLabel="Not found" />
              <StatusRow label="G2" ok={clientReport.entity_consistency.g2} trueLabel="Found" falseLabel="Not found" />
              <StatusRow label="Capterra" ok={clientReport.entity_consistency.capterra} trueLabel="Found" falseLabel="Not found" />
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}>
          {clientReport.coverage_disclosure}
        </p>

        <div className="gloss-card" style={{ padding: "28px 32px", textAlign: "center", background: "rgba(79,110,247,0.06)", borderColor: "rgba(79,110,247,0.2)" }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>
            {clientReport.locale === "ES"
              ? "Tu Blueprint completo — con recomendaciones priorizadas y un plan de 90 días — llega por separado."
              : "Your full Blueprint — with prioritized recommendations and a 90-day plan — arrives separately."}
          </p>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", padding: 22, position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color }} />
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color, lineHeight: 1, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{detail}</div>
    </div>
  );
}

function StatusRow({ label, ok, trueLabel, falseLabel }: { label: string; ok: boolean; trueLabel?: string; falseLabel?: string }) {
  const badge = statusBadge(ok, trueLabel, falseLabel);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: badge.color }} />
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 11.5, color: badge.color, fontFamily: "'JetBrains Mono', monospace" }}>{badge.label}</span>
    </div>
  );
}

function StatusScreen({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <NavBar tag="Instant AI Visibility Snapshot" />
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</p>
      </main>
    </div>
  );
}
