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
  cached = nodemailer.createTransport({
    host,
    port,
    secure: false,
    // Short conservative timeouts. Locally Mailpit responds within
    // milliseconds; anything above 5s is a real problem, not a slow SMTP.
    // Also disables the STARTTLS negotiation attempt Mailpit doesn't support.
    ignoreTLS: true,
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
