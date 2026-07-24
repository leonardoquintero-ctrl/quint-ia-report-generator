// libSQL/SQLite has no native enum support, so reports.status is a plain string
// column constrained by convention to this union.
export type ReportStatus =
  | "fast_pass_pending"
  | "fast_pass_done"
  | "full_pass_running"
  | "full_pass_done"
  | "full_pass_failed";
