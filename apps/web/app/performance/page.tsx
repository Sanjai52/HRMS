import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Performance">
      <EmptyState title="Performance" body="Goals, reviews and ratings will live here." />
    </AppShell>
  );
}
