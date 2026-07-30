import { ContinueListeningRow } from "@/components/library/continue-listening-row";
import { AppShell } from "@/components/shared/app-shell";

export default function HomePage() {
  return (
    <AppShell eyebrow="Private listening" title="Your library">
      <ContinueListeningRow />
    </AppShell>
  );
}
