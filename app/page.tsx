import PageShell from "@/components/layout/PageShell";
import CreateForm from "@/components/cliff/CreateForm";
import { NAV } from "@/lib/nav";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <PageShell nav={NAV} title={app.name} description={app.tagline}>
      <div className="flex flex-col gap-4">
        <CreateForm />
      </div>
    </PageShell>
  );
}
