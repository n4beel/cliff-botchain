"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/components/layout/PageShell";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import MySchedules from "@/components/cliff/MySchedules";
import { NAV } from "@/lib/nav";

/**
 * Your schedules, and anyone else's by number.
 *
 * The list needs a connected wallet to mean anything, so on its own this page was blank to a
 * visitor — and a beneficiary arriving with a number someone sent them had nowhere to put it. The
 * field is the way in when the list cannot be, and secondary when it can, so it sits below as one
 * line rather than a panel.
 */
export default function SchedulesPage() {
  const [id, setId] = useState("");
  const router = useRouter();
  const trimmed = id.trim();

  return (
    <PageShell
      nav={NAV}
      title="Schedules"
      description="Everything this wallet created or stands to receive."
    >
      <div className="flex flex-col gap-5">
        <MySchedules />

        <form
          className="flex gap-2 items-end max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) router.push(`/schedule/${trimmed}`);
          }}
        >
          <div className="flex-1">
            <Input
              type="number"
              min="1"
              label="Open a schedule by number"
              placeholder="1"
              value={id}
              onChange={(e) => setId(e.target.value)}
              hint="Anyone's. No wallet needed to read one."
            />
          </div>
          <Button type="submit" disabled={!trimmed} variant="ghost">
            Open
          </Button>
        </form>
      </div>
    </PageShell>
  );
}
