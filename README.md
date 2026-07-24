# Quint·IA Vantage — Quick-Start Blueprint Report Generator

Everything downstream of "token-gated URL hit": an instant fast-pass email, an async
full-pass scan (site checks + 3-engine prompt visibility + off-site presence), and two
synthesized reports (client-facing + internal owner). The upstream CTA → HubSpot form
→ payment flow is a separate, already-built app — this one starts where that ends.

**Deployed:** https://quint-ia-report-generator.vercel.app — auto-deploys on push to
`main` via the GitHub → Vercel integration (project `quint-ia/quint-ia-report-generator`).

## Setup

```bash
npm install
cp .env.example .env       # fill in what you have; see comments in that file
npm run db:migrate         # creates/updates tables (local file or hosted Turso)
npm run dev
```

Use `.env`, not `.env.local` — `drizzle-kit` only reads `.env`.

No Turso account needed to develop locally: leave `TURSO_DATABASE_URL` at its default
(`file:./local.db`) and `TURSO_AUTH_TOKEN` unset.

Without `ANTHROPIC_API_KEY`, the fast pass and both report syntheses fail cleanly
(logged, `reports.status` moves to a failed state) — nothing crashes the process.

## Flow

1. **`POST /api/intake`** — the upstream HubSpot workflow's webhook target (see
   "HubSpot webhook contract" below). Creates a `reports` row, runs the **fast pass
   synchronously** (`src/lib/fastpass/checks.ts` — HTTP/SSL/H1/word-count/compression/
   llms.txt/robots.txt, all deterministic, no paid APIs), emails an instant snapshot
   (`src/lib/fastpass/email.ts`, Claude Haiku, EN/ES), then hands the full pass off to
   the queue provider and returns immediately.
2. **Full pass** (`src/lib/fullpass/runFullPass.ts`) — runs async, off the request's
   critical path:
   - Site & content checks (`siteChecks.ts`): schema inventory, knowledge-graph page
     presence (`/about`, `/team`, `/products`, `/faq`, `/glossary`), content-shape
     heuristics, PageSpeed.
   - Prompt visibility (`visibility.ts`): the client's target buyer questions run
     against Claude (real, via the `web_search` tool), OpenAI, and Perplexity
     (currently mocked — see below), citation-checked against the client's domain and
     any competitor domains, concurrency-limited via `p-limit`.
   - Off-site presence (`offsite.ts`): YouTube (real, via the YouTube Data API), G2/
     Capterra and two more sources (stubbed — no data-source decision made yet).
   - Two Claude syntheses (`src/lib/synthesis/`): the client report (constrained,
     disclaimer-first, 3-5 findings, teases the human-crafted Blueprint) and the owner
     report (raw findings, flagged anomalies first, draft 90-day action skeleton).
   - **The client report emails automatically** the moment the full pass completes —
     there's no approval gate in this system. The bespoke, human-crafted Blueprint is
     a separate, later deliverable the team builds from the owner report's skeleton;
     it isn't sent by this app.
3. **`GET /report/[token]`** — `token` is the `reports.id` itself (no separate token
   column). Renders the synthesized client report once `full_pass_done`; shows a
   plain "still processing" or "failed" state otherwise. Doesn't drive a live
   progress bar — there's no upstream screen waiting on this route the way the funnel
   app's `ScanningStep` waits on its scan.

## HubSpot webhook contract (`/api/intake`)

HubSpot's workflow "webhook" action lets whoever builds the workflow define the JSON
body freely via personalization tokens — there's no fixed universal payload shape to
target. **This is our contract**; configure the upstream workflow's webhook action to
POST exactly this shape (`src/lib/validation.ts`):

```json
{
  "hubspot_contact_id": "optional",
  "hubspot_deal_id": "optional",
  "company_name": "Acme Robotics",
  "domain": "acmerobotics.com",
  "competitors": [{ "name": "RoboWorks", "domain": "roboworks.com" }],
  "target_questions": ["What's the best warehouse robotics platform for a mid-size operation?"],
  "locale": "EN",
  "email": "jordan@acmerobotics.com",
  "contact_name": "Jordan Lee"
}
```

**Needs verification against the real HubSpot workflow once it's built** — this is a
placeholder contract, not a confirmed one.

## Engine adapters (`src/lib/engines/`)

`EngineAdapter.runQuery(prompt, context)` → `{ responseText, citations }`. Claude is
real, using Anthropic's `web_search` server tool (`claude-adapter.ts`) — citations come
from the `citations` array attached to response text blocks (what Claude actually
cited), not every raw search result it saw. OpenAI and Perplexity are
`MockEngineAdapter` instances (`mock-adapter.ts`) that fabricate deterministic
citation behavior per `(engine, prompt, domain)` — clearly marked as mock, not a real
signal. `context.domainsToCheck` lets the mock reference the actual client/competitor
domains being scored rather than a generic placeholder URL.

To go live: implement `EngineAdapter` for OpenAI (Responses API `web_search` tool) or
Perplexity (`sonar` model) and swap the `MockEngineAdapter` instance in
`getEngineAdapters()` in `src/lib/fullpass/visibility.ts`. Nothing else changes.

## Long-running full pass & the queue provider (`src/lib/queue/provider.ts`)

The full pass can run for minutes across ~60 live LLM calls (prompts × 3 engines),
which risks Vercel's function-timeout on a plain request/response cycle. `QueueProvider`
decouples "make sure the full pass eventually runs" from how it's triggered:

- **`DirectCallQueueProvider`** (default, no Upstash account exists yet) — runs the
  full pass in-process via Next's `after()`, same pattern as the sibling funnel app's
  scan. Fine for local dev; does **not** solve the Vercel timeout risk.
- **`QStashQueueProvider`** — publishes to Upstash QStash's REST API, which calls back
  to `POST /api/fullpass/run` outside the original request's lifecycle. Untested until
  `QSTASH_TOKEN`/`QSTASH_CALLBACK_BASE_URL` are set (credentials pending). `/api/fullpass/run`
  verifies the callback's signature via `@upstash/qstash`'s `Receiver` when
  `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` are set; skipped otherwise.
  `maxDuration` is set to 300s on that route — requires a Vercel plan that supports
  extended durations (Hobby caps at 60s regardless).

Switching providers is a one-line change in `getQueueProvider()` — everything else in
the app is unaffected either way.

## Email delivery (`src/lib/email/provider.ts`)

Neither handoff doc decided a provider. `EmailProvider` interface + `ResendEmailProvider`,
same swap pattern as `PaymentProvider` in the funnel app. Without `RESEND_API_KEY` set,
sends are logged to the console instead — the pipeline still completes normally.

## Data model (`src/db/schema.ts`)

One `reports` table, one row per report job (Drizzle + Turso, same stack as the
funnel app). `id` doubles as the shareable `/report/[token]` URL token — no expiration
policy decided yet (defaults to non-expiring, same as the funnel app). `status` moves
through `fast_pass_pending` → `fast_pass_done` → `full_pass_running` →
`full_pass_done` | `full_pass_failed` (plain string column — libSQL has no native
enum). Stores both raw scan data (`fastPassJson`, `fullPassJson`) and both synthesized
outputs (`clientReportJson`, `ownerReportJson`) — the client report needs to be
durably retrievable at `/report/[token]`, not just emailed once.

## Deferred / stubbed (per the handoff spec's own scope)

- **Google AI Overviews** citation checking — no official API exists; disclosed
  honestly in the client report's `coverage_disclosure` field rather than silently
  omitted.
- **G2/Capterra + two more off-site sources** — no data-source decision made
  (scraping vs. a paid search API). Structure is in `OffsiteResult`; only YouTube is
  actually implemented.
- **Periodic/historical tracking** (Peec-style share-of-voice trends) — explicitly
  deferred until there are retainer clients to justify it. Every report today is a
  self-contained, on-demand job.

## Assumptions made

- **New repo, separate from `quint-ia-blueprint-funnel`** and a dedicated Turso
  database — matches the handoff's "separate mini app" framing.
- **EN/ES fast-pass email copy is v1, not final** — drafted from the handoff's voice
  constraints (§5) since the "already drafted" copy wasn't included in the handoff
  paste. Swap `buildSystemPrompt()` in `src/lib/fastpass/email.ts` for the approved
  copy; nothing else needs to change.
- **Four-pillars scorecard language** uses the pillar names given in the handoff
  itself (technical readability, owned knowledge graph, content shape, off-site
  citations) — final wording from the "AEO Services copy doc" can be dropped into the
  synthesis system prompts later without changing any code.
- **Report token = the row's own id**, no expiration — same reasoning as the funnel
  app's report URLs.
- **`@anthropic-ai/sdk` pinned to `^0.114.0`**, not `^0.32.1` — worth checking the
  funnel app's pin too; `^0.32.1` on a 0.x package only allows patch updates within
  `0.32.x` under semver rules, so it's very likely stuck on a stale SDK version
  despite looking like a normal caret range.
- **Content-shape checks are heuristic, not ground truth** (`direct_answer_lead`,
  `faq_blocks_found`, `comparison_tables_found`, `author_bylines_found` in
  `siteChecks.ts`) — pattern-matching on HTML structure, documented as best-effort
  signal in both the code and (via the synthesis prompts) the reports themselves.

## For production on Vercel

Same Turso-swap note as the funnel app: point `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`
at a real hosted database (Vercel's filesystem is ephemeral/read-only per invocation,
so `file:./local.db` only works for local dev). Set up Upstash QStash before relying
on this in production — the `after()` fallback does not protect against Vercel's
function-timeout on a full pass that runs long.
