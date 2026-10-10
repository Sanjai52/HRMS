import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Leave administration">
      <EmptyState title="Leave administration" body="Leave requests, policies and approvals will live here." />
    </AppShell>
  );
}
