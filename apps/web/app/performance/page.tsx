import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Performance">
      <EmptyState title="Coming in its phase" body="The performance workflow has not been built yet. The sidebar and design tokens are ready for it." />
    </AppShell>
  );
}
