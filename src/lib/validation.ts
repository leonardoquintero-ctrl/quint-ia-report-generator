import { z } from "zod";

// Contract for the upstream HubSpot workflow's "custom webhook" action. HubSpot lets
// whoever builds the workflow define the JSON body freely (via personalization
// tokens) — there's no fixed universal payload shape to target, so this is OUR
// contract: configure the HubSpot workflow's webhook action to POST exactly this
// shape. Needs verification against the real workflow once it's built (handoff §9).
export const intakeWebhookSchema = z.object({
  hubspot_contact_id: z.string().optional(),
  hubspot_deal_id: z.string().optional(),
  company_name: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  // e.g. "US", "Colombia", "LatAm->US" — shown as-is on the client report. Kept
  // separate from target_questions: this app takes client-supplied buyer questions
  // directly (more precise than generating them from a market string), but the
  // report still needs a market label per the Instant Assessment spec's output shape.
  target_market: z.string().trim().min(1).default("Not specified"),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().optional(),
        domain: z.string().trim().min(1),
      })
    )
    .max(5)
    .default([]),
  target_questions: z.array(z.string().trim().min(1)).min(1).max(20),
  locale: z.enum(["EN", "ES"]).default("EN"),
  email: z.string().trim().email(),
  contact_name: z.string().trim().min(1),
});

export type IntakeWebhookPayload = z.infer<typeof intakeWebhookSchema>;
