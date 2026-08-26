/**
 * Mailpit HTTP API client.
 *
 * Mailpit is the local SMTP catcher run via docker-compose. Every email the
 * app sends in dev + CI lands here, and this client is how tests fetch them
 * (e.g. for the password-reset E2E).
 *
 * Reference: https://mailpit.axllent.org/docs/api-v1/
 */

export interface MailpitMessage {
  ID: string;
  MessageID: string;
  Subject: string;
  From: { Address: string; Name: string };
  To: Array<{ Address: string; Name: string }>;
  Created: string;
  Snippet: string;
}

export interface MailpitMessageBody {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
  From: { Address: string; Name: string };
  To: Array<{ Address: string; Name: string }>;
}

export class MailpitClient {
  constructor(private readonly baseUrl: string) {}

  /** Wait for a message to `to` matching an optional subject filter. */
  async waitForMessageTo(
    to: string,
    opts: { subjectContains?: string; timeoutMs?: number } = {},
  ): Promise<MailpitMessageBody> {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch(
        `${this.baseUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      );
      if (!res.ok) throw new Error(`mailpit search failed: ${res.status}`);
      const data = (await res.json()) as { messages: MailpitMessage[] };
      const match = data.messages.find(
        (m) =>
          !opts.subjectContains ||
          m.Subject.toLowerCase().includes(opts.subjectContains.toLowerCase()),
      );
      if (match) return this.getMessage(match.ID);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(
      `mailpit: no message to ${to}${
        opts.subjectContains ? ` matching subject '${opts.subjectContains}'` : ""
      } within ${timeoutMs}ms`,
    );
  }

  async getMessage(id: string): Promise<MailpitMessageBody> {
    const res = await fetch(`${this.baseUrl}/api/v1/message/${id}`);
    if (!res.ok) throw new Error(`mailpit get failed: ${res.status}`);
    return (await res.json()) as MailpitMessageBody;
  }

  async deleteAll(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`mailpit purge failed: ${res.status}`);
  }
}
