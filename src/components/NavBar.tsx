export function NavBar({ tag }: { tag?: string }) {
  return (
    <nav className="funnel-nav">
      <div className="funnel-nav-inner">
        <div className="funnel-logo">
          Quint<span className="dot">·</span>
          <span className="ia">IA</span>
          <span className="vantage">Vantage</span>
        </div>
        {tag && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-muted)" }}>
            {tag}
          </div>
        )}
      </div>
    </nav>
  );
}
