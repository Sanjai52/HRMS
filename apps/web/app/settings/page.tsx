import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Settings">
      <EmptyState title="Settings" body="Organization profile, roles and preferences will live here." />
    </AppShell>
  );
}
