import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Time tracking">
      <EmptyState title="Time tracking" body="Check-in, check-out and attendance history will live here." />
    </AppShell>
  );
}
