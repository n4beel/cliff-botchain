"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContracts } from "wagmi";
import Panel from "@/components/ui/Panel";
import Spinner from "@/components/ui/Spinner";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { cliffAbi } from "@/lib/botchain/abi";

// The chain's own symbol. Hardcoding "BOT" labelled every testnet amount as mainnet
// currency, which is the confusion the network badge exists to prevent.
const SYMBOL = activeBotChain.nativeCurrency.symbol;

/**
 * Every schedule the connected wallet created or is the beneficiary of.
 *
 * The contract numbers schedules globally and keeps no per-address index, but `Created` indexes
 * both the creator and the beneficiary, so two filtered log queries find the whole set. This
 * matters most for the beneficiary, who is never told their schedule number by anything — before
 * this the only route back to a schedule was for someone to send you the id and for you to keep it.
 */
type CreatedEvent = Extract<(typeof cliffAbi)[number], { type: "event"; name: "Created" }>;

/** Taken from the ABI itself; re-typing the signature here is how the two drift apart. */
const CREATED = cliffAbi.find(
  (item): item is CreatedEvent => item.type === "event" && item.name === "Created",
)!;

export default function MySchedules() {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result

  const [ids, setIds] = useState<bigint[] | null>(null);
  const [failed, setFailed] = useState(false);

  const ready = Boolean(address) && isBotChainId(chainId) && isDeployed(chainId);
  const deployment = isBotChainId(chainId) && isDeployed(chainId) ? getDeployment(chainId) : null;
  const contract = deployment?.address;
  const fromBlock = deployment?.deployBlock;

  const scanned = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !publicClient || !address || !contract || fromBlock === undefined) return;
    const key = `${chainId}:${address.toLowerCase()}`;
    if (scanned.current === key) return;
    scanned.current = key;

    let cancelled = false;
    void (async () => {
      try {
        const [created, receiving] = await Promise.all([
          publicClient.getLogs({ address: contract, event: CREATED, args: { creator: address }, fromBlock }),
          publicClient.getLogs({ address: contract, event: CREATED, args: { beneficiary: address }, fromBlock }),
        ]);
        if (cancelled) return;

        const seen = new Set<string>();
        const found: bigint[] = [];
        for (const log of [...created, ...receiving]) {
          const { id } = log.args;
          if (id === undefined || seen.has(id.toString())) continue;
          seen.add(id.toString());
          found.push(id);
        }
        found.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // newest first
        setIds(found);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, publicClient, address, contract, fromBlock, chainId]);

  const details = useReadContracts({
    contracts: (ids ?? []).flatMap((id) => [
      { address: contract, abi: cliffAbi, functionName: "scheduleOf" as const, args: [id] as const },
      { address: contract, abi: cliffAbi, functionName: "releasable" as const, args: [id] as const },
    ]),
    query: { enabled: Boolean(ids?.length) && Boolean(contract) },
  });

  const rows = useMemo(() => {
    if (!ids || !address) return [];
    const me = address.toLowerCase();
    return ids.map((id, i) => {
      const schedule = details.data?.[i * 2]?.result as
        | {
            beneficiary: Address; start: bigint; cliff: bigint;
            duration: bigint; total: bigint; released: bigint;
          }
        | undefined;
      const releasable = details.data?.[i * 2 + 1]?.result as bigint | undefined;
      const role = schedule
        ? schedule.beneficiary.toLowerCase() === me
          ? "receiving"
          : "created"
        : "";
      return { id, schedule, releasable, role };
    });
  }, [ids, details.data, address]);

  if (!ready) return null;

  if (failed) {
    return (
      <Panel>
        <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          Could not list your schedules — the node refused the log query. Schedules are still
          reachable by number.
        </p>
      </Panel>
    );
  }

  if (ids === null) {
    return (
      <Panel>
        <Spinner label="Finding your schedules" />
      </Panel>
    );
  }

  if (ids.length === 0) {
    return (
      <Panel>
        <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          No schedules yet for this wallet, as creator or as beneficiary.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <span
          className="text-[11px] uppercase tracking-[0.08em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Your schedules
        </span>

        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {rows.map(({ id, schedule, releasable, role }) => (
            <li
              key={id.toString()}
              className="flex items-baseline gap-3 flex-wrap py-2"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <Link
                href={`/schedule/${id.toString()}`}
                className="mono text-[13px] underline"
                style={{ color: "var(--accent)" }}
              >
                #{id.toString()}
              </Link>

              <span className="mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {schedule ? `${formatEther(schedule.total)} ${SYMBOL}` : "…"}
              </span>

              <span
                className="text-[11px] uppercase tracking-[0.06em]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {role}
              </span>

              {releasable !== undefined && releasable > 0n && (
                <span
                  className="mono text-[11px] uppercase tracking-[0.06em] ml-auto"
                  style={{ color: "var(--accent)" }}
                >
                  {formatEther(releasable)} ${SYMBOL} ready
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
