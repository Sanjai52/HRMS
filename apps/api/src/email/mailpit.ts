import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "@hrms/core";

export function createEmail(): EmailProvider {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST ?? "localhost",
    port: Number(process.env.EMAIL_SMTP_PORT ?? 1025),
    secure: false,
  });
  return {
    async send(message: EmailMessage): Promise<void> {
      await transporter.sendMail({ from: "HRMS <no-reply@hrms.local>", ...message });
    },
  };
}
