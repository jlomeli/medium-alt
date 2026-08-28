/**
 * Email transport.
 *
 * Dev + CI: nodemailer against Mailpit SMTP (docker-compose).
 * Prod: same nodemailer transport against Resend SMTP (or swap for Resend REST
 * — irrelevant to the auth surface; the caller only sees `sendEmail`).
 *
 * Config lives in env vars: SMTP_HOST, SMTP_PORT, EMAIL_FROM. See .env.example.
 */
import nodemailer from "nodemailer";

let cached: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST ?? "127.0.0.1";
  const port = Number(process.env.SMTP_PORT ?? "1025");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // TLS profile depends on the environment. In dev/CI the target is Mailpit,
  // which has no TLS support at all — enabling STARTTLS negotiation there
  // stalls the send. In production the target is a real relay (Resend etc.)
  // where the reset-token URL must never traverse the wire in plaintext.
  //
  // Rules:
  //   - Port 465 → implicit TLS (SMTPS).
  //   - Otherwise, require STARTTLS in production; ignore it locally.
  const isProd = process.env.NODE_ENV === "production";
  const secure = port === 465;

  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: isProd && !secure,
    ignoreTLS: !isProd && !secure,
    auth: user && pass ? { user, pass } : undefined,
    // Short conservative timeouts. Locally Mailpit responds within
    // milliseconds; anything above 5s is a real problem, not a slow SMTP.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 5_000,
  });
  return cached;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "Medium-Alt <no-reply@medium-alt.local>";
  await getTransport().sendMail({ from, ...input });
}
