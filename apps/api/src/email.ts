import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "@hrms/core";

/**
 * SMTP-backed EmailProvider for the API (Mailpit in the local stack).
 * Transport failures are logged and swallowed: a missing mailbox must never
 * break the request mill that triggered the message.
 */
export function emailProvider(): EmailProvider {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? process.env.EMAIL_SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? process.env.EMAIL_SMTP_PORT ?? 1025),
    secure: false,
  });
  return {
    async send(message: EmailMessage): Promise<void> {
      try {
        await transporter.sendMail({ from: "HRMS <no-reply@hrms.local>", ...message });
      } catch (e) {
        console.error("email send failed:", (e as Error).message);
      }
    },
  };
}
