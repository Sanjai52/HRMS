import type { ReactNode } from "react";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata = {
  title: "HRMS — People operations, minus the paperwork",
  description: "Employee directory, attendance, leave, payroll and hiring in one workspace.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
