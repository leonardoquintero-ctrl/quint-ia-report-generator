import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// One row per report job — created when the tokenized URL is hit (HubSpot webhook),
// carried through fast pass and full pass. libSQL/SQLite has no native enum, so
// `status` is a plain string constrained by convention to:
//   fast_pass_pending -> fast_pass_done -> full_pass_running -> full_pass_done | full_pass_failed
// The row's own id doubles as the shareable report token in /report/[token], same
// pattern used in the sibling quint-ia-blueprint-funnel app.
export const reports = sqliteTable("reports", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // From the upstream HubSpot intake/payment flow (separate app) via webhook
  hubspotContactId: text("hubspot_contact_id"),
  hubspotDealId: text("hubspot_deal_id"),
  companyName: text("company_name").notNull(),
  domain: text("domain").notNull(),
  competitors: text("competitors").notNull(), // JSON: [{ name?, domain }]
  targetQuestions: text("target_questions").notNull(), // JSON: string[]
  locale: text("locale").notNull().default("EN"), // "EN" | "ES"
  email: text("email").notNull(),
  contactName: text("contact_name").notNull(),

  status: text("status").notNull().default("fast_pass_pending"),

  fastPassJson: text("fast_pass_json"),
  fastPassEmailSentAt: integer("fast_pass_email_sent_at", { mode: "timestamp" }),

  fullPassJson: text("full_pass_json"),
  fullPassError: text("full_pass_error"),
  fullPassCompletedAt: integer("full_pass_completed_at", { mode: "timestamp" }),

  // Synthesized outputs (Section 6). clientReportJson must be durably stored, not
  // just emailed once — /report/[token] renders it directly.
  clientReportJson: text("client_report_json"),
  ownerReportJson: text("owner_report_json"),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
