import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="My team">
      <EmptyState title="My team" body="Team directory and member status will live here." />
    </AppShell>
  );
}
