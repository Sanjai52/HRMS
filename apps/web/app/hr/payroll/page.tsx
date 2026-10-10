import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Payroll runs">
      <EmptyState title="Payroll runs" body="Payroll batches, history and processing status will live here." />
    </AppShell>
  );
}
