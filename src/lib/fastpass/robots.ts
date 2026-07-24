// A real per-user-agent robots.txt parser — Handoff 2's version matched a literal
// substring like "user-agent: gptbot\ndisallow: /", which breaks on blank lines
// between directives, comments, multiple Disallow lines per group, or a different
// case/spacing. This groups directives by the user-agent(s) they actually apply to,
// per the robots.txt spec's group semantics (a group is one or more User-agent lines
// followed by their directives, ending at the next User-agent line that starts a new
// group).
export function parseRobotsGroups(text: string): Map<string, string[]> {
  const disallowsByAgent = new Map<string, string[]>();
  let currentAgents: string[] = [];
  let sawDirectiveForGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "user-agent") {
      if (sawDirectiveForGroup) {
        currentAgents = [];
        sawDirectiveForGroup = false;
      }
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      if (!disallowsByAgent.has(agent)) disallowsByAgent.set(agent, []);
    } else if (field === "disallow" && value !== "") {
      sawDirectiveForGroup = true;
      for (const agent of currentAgents) {
        disallowsByAgent.get(agent)?.push(value);
      }
    } else if (field === "allow" || field === "disallow") {
      // "Disallow:" with an empty value means "disallow nothing" — still counts as
      // this group having a directive, so a later User-agent line starts a new group.
      sawDirectiveForGroup = true;
    }
  }

  return disallowsByAgent;
}

// A bot is considered fully blocked if its group (or the wildcard "*" group, per
// standard robots.txt fallback behavior) disallows the whole site.
export function isBotBlocked(disallowsByAgent: Map<string, string[]>, botName: string): boolean {
  const own = disallowsByAgent.get(botName.toLowerCase());
  if (own && own.some((path) => path === "/" || path === "/*")) return true;

  // Only fall back to the wildcard group if the bot has no dedicated group at all —
  // a bot with its own (even empty) group is not subject to "*" rules.
  if (!own) {
    const wildcard = disallowsByAgent.get("*");
    if (wildcard?.some((path) => path === "/" || path === "/*")) return true;
  }

  return false;
}
