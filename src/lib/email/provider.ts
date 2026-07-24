// Email delivery layer. Neither handoff doc decided a provider (Handoff 2 left it as
// a TODO), so this follows the same swap pattern as PaymentProvider in the sibling
// quint-ia-blueprint-funnel app: one interface, one concrete implementation, one
// place to change if a different provider is ever wanted.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendResult {
  success: boolean;
  error?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

const FROM_ADDRESS = "Quint·IA Vantage <blueprint@quintiavantage.com>";

class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[email] Skipped (no RESEND_API_KEY set) — would send to ${message.to}: ${message.subject}`);
      return { success: true };
    }

    try {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown email error" };
    }
  }
}

// TODO: replace with a different provider here if Resend isn't the final choice —
// nothing else in the app depends on anything beyond the EmailProvider interface.
export function getEmailProvider(): EmailProvider {
  return new ResendEmailProvider();
}
