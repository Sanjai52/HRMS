import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Notifications">
      <EmptyState title="Notifications" body="Leave decisions, payroll updates and announcements will arrive here." />
    </AppShell>
  );
}
