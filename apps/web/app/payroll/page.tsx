import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Payroll">
      <EmptyState title="Payroll" body="Pay periods, batches and payslips will live here." />
    </AppShell>
  );
}
