import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Leave approvals">
      <EmptyState title="Leave approvals" body="Pending team leave requests will appear here." />
    </AppShell>
  );
}
