import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Notifications">
      <EmptyState title="Coming in its phase" body="The notifications workflow has not been built yet. The sidebar and design tokens are ready for it." />
    </AppShell>
  );
}
