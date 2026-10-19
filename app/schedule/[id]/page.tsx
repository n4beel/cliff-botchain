import PageShell from "@/components/layout/PageShell";
import ScheduleView from "@/components/cliff/ScheduleView";
import { NAV } from "@/lib/nav";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SchedulePage({ params }: PageProps) {
  const { id } = await params;

  return (
    <PageShell
      nav={NAV}
      title={`Schedule #${id}`}
      description={`Vesting schedule #${id} on BOT Chain`}
    >
      <ScheduleView id={id} />
    </PageShell>
  );
}
