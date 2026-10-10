import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Performance reviews">
      <EmptyState title="Performance reviews" body="Review cycles, completion and ratings will live here." />
    </AppShell>
  );
}
