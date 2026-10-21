"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

/**
 * Term-sheet shell: light stock, serif headings, a wide content well.
 *
 * A vesting schedule is read by the person it pays, often months after anyone set it up, so the
 * page is built to be legible rather than impressive — white card on a soft ground, a visible
 * timeline strip in the header, and no dark chrome.
 */
export default function PageShell({ children, nav = [], title, description }: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <header
        className="flex-shrink-0"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="mx-auto w-full px-6 md:px-8 py-4 flex items-center justify-between gap-4" style={{ maxWidth: "1060px" }}>
          <Link href="/" className="flex items-center gap-3 no-underline">
            {/* A cliff then a ramp, drawn rather than described. */}
            <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden="true">
              <path d="M1 17 L11 17 L29 2" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="11" cy="17" r="2.5" fill="var(--accent)" />
            </svg>
            <span className="text-[19px] font-semibold tracking-[-0.015em]" style={{ fontFamily: "var(--font-serif)" }}>
              {app.name}
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {nav.length > 1 && (
              <nav className="hidden sm:flex items-center gap-5 mr-2">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className="nav-link text-[14px] no-underline"
                      style={{
                        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                        paddingBottom: "2px",
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
            <NetworkBadge />
            <div style={{ width: "160px" }}><ConnectButton /></div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full px-6 md:px-8 py-9" style={{ maxWidth: "1060px" }}>
        {title && <h1 className="text-[32px] md:text-[38px]" style={{ color: "var(--text-primary)" }}>{title}</h1>}
        {description && (
          <p className="mt-3 text-[16px]" style={{ color: "var(--text-secondary)", maxWidth: "62ch" }}>
            {description}
          </p>
        )}
        <div className={title || description ? "mt-8" : ""}>{children}</div>
      </main>

      <footer
        className="flex-shrink-0 mx-auto w-full px-6 md:px-8 py-7"
        style={{ maxWidth: "1060px", borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>{app.tagline}</span>
          <div className="flex-1" />
          <BuiltOnBotChain className="text-[12px]" style={{ color: "var(--text-secondary)" }} />
          <a href="https://botchain.ai" target="_blank" rel="noreferrer" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>botchain.ai</a>
          <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>BOT Chain Explorer</a>
        </div>
      </footer>
    </div>
  );
}
