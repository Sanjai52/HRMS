import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Leave management">
      <EmptyState title="Leave management" body="Leave balances, requests and approvals will live here." />
    </AppShell>
  );
}
