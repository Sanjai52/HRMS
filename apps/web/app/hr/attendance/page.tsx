import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Attendance management">
      <EmptyState title="Attendance management" body="Daily attendance, filters and corrections will live here." />
    </AppShell>
  );
}
