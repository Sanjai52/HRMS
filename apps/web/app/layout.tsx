import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "HRMS — People operations, minus the paperwork",
  description: "Employee directory, attendance, leave, payroll and hiring in one workspace.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-hof antialiased">{children}</body>
    </html>
  );
}
