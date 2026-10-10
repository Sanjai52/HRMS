import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui";
export default function Page() {
  return (
    <AppShell title="Profile">
      <EmptyState title="Profile" body="Personal details and job information will live here." />
    </AppShell>
  );
}
