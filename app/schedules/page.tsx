import PageShell from "@/components/layout/PageShell";
import MySchedules from "@/components/cliff/MySchedules";
import { NAV } from "@/lib/nav";

export const metadata = {
  title: "Schedules — Cliff",
  description: "Every vesting schedule this wallet created or is the beneficiary of.",
};

export default function SchedulesPage() {
  return (
    <PageShell
      nav={NAV}
      title="Schedules"
      description="Everything this wallet created or stands to receive."
    >
      <MySchedules />
    </PageShell>
  );
}
