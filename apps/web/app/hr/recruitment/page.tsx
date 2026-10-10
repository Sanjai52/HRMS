import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui";
export default function Page() {
  return (
    <AppShell title="Recruitment">
      <EmptyState title="Recruitment" body="Job postings, applications and the hiring pipeline will live here." />
    </AppShell>
  );
}
