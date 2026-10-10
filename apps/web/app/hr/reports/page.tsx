import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Reports">
      <EmptyState title="Coming in its phase" body="The hr/reports workflow has not been built yet. The sidebar and design tokens are ready for it." />
    </AppShell>
  );
}
