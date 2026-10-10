import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Reports">
      <EmptyState title="Reports" body="People, attendance and payroll reports will live here." />
    </AppShell>
  );
}
