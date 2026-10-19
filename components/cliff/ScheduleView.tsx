"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BaseError,
  ContractFunctionRevertedError,
  formatEther,
  type Hex,
} from "viem";
import {
  useAccount,
  useBlockNumber,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import BotChainGate from "@/components/botchain/BotChainGate";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { activeBotChain, addressUrl, isBotChainId } from "@/lib/botchain/chain";
import { getDeployment, ZERO_ADDRESS } from "@/lib/botchain/deployment";
import { cliffAbi } from "@/lib/botchain/abi";
import {
  cliffDate,
  endDate,
  formatDateTimeUTC,
  scheduleStatus,
  startDate,
  vestingProgressPercent,
  type CliffSchedule,
} from "@/lib/cliff";

// The chain's own symbol. Hardcoding "BOT" labelled every testnet amount as mainnet
// currency, which is the confusion the network badge exists to prevent.
const SYMBOL = activeBotChain.nativeCurrency.symbol;

export default function ScheduleView({ id }: { id: string }) {
  const chainId = useChainId();
  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;

  let idBigInt: bigint | null = null;
  try {
    idBigInt = BigInt(id);
  } catch {
    idBigInt = null;
  }

  const scheduleQuery = useReadContract({
    address: deployment?.address,
    abi: cliffAbi,
    functionName: "scheduleOf",
    args: idBigInt !== null ? [idBigInt] : undefined,
    query: { enabled: Boolean(deployment && idBigInt !== null) },
  });

  const vestedQuery = useReadContract({
    address: deployment?.address,
    abi: cliffAbi,
    functionName: "vested",
    args: idBigInt !== null ? [idBigInt] : undefined,
    query: { enabled: Boolean(deployment && idBigInt !== null) },
  });

  const releasableQuery = useReadContract({
    address: deployment?.address,
    abi: cliffAbi,
    functionName: "releasable",
    args: idBigInt !== null ? [idBigInt] : undefined,
    query: { enabled: Boolean(deployment && idBigInt !== null) },
  });

  // Watch blocks for live releasable updates (§3.1: depend only on blockNumber and stable refetchers)
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const refetchSchedule = scheduleQuery.refetch;
  const refetchVested = vestedQuery.refetch;
  const refetchReleasable = releasableQuery.refetch;

  useEffect(() => {
    if (blockNumber) {
      void refetchSchedule();
      void refetchVested();
      void refetchReleasable();
    }
  }, [blockNumber, refetchSchedule, refetchVested, refetchReleasable]);

  if (idBigInt === null || idBigInt <= 0n) {
    return (
      <Panel>
        <div className="flex flex-col gap-2">
          <p
            className="text-[11px] uppercase tracking-[0.04em]"
            style={{ color: "var(--text-secondary)" }}
          >
            Invalid Schedule ID
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
            &ldquo;{id}&rdquo; is not a valid schedule ID.
          </p>
          <Link href="/" className="text-[12px] underline mt-1" style={{ color: "var(--accent)" }}>
            ← Back to Create Schedule
          </Link>
        </div>
      </Panel>
    );
  }

  if (scheduleQuery.isLoading) {
    return (
      <Panel>
        <Spinner label={`Loading schedule #${id} from BOT Chain...`} />
      </Panel>
    );
  }

  // §3.10: Distinguish RPC load error from empty/not-found
  if (scheduleQuery.isError) {
    return (
      <Panel>
        <div className="flex flex-col gap-2">
          <p
            className="text-[11px] uppercase tracking-[0.04em]"
            style={{ color: "var(--danger)" }}
          >
            Could not read schedule
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Failed to query schedule #{id} from the node. Check your network or try again.
          </p>
          <Button size="sm" variant="ghost" onClick={() => void refetchSchedule()}>
            Retry Read
          </Button>
        </div>
      </Panel>
    );
  }

  const raw = scheduleQuery.data;
  if (!raw || raw.beneficiary === ZERO_ADDRESS || raw.total === 0n) {
    return (
      <Panel>
        <div className="flex flex-col gap-2">
          <p
            className="text-[11px] uppercase tracking-[0.04em]"
            style={{ color: "var(--text-secondary)" }}
          >
            Schedule Not Found
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
            No vesting schedule exists on chain with ID #{id}.
          </p>
          <Link href="/" className="text-[12px] underline mt-1" style={{ color: "var(--accent)" }}>
            ← Back to Create Schedule
          </Link>
        </div>
      </Panel>
    );
  }

  const schedule: CliffSchedule = {
    beneficiary: raw.beneficiary,
    start: Number(raw.start),
    cliff: Number(raw.cliff),
    duration: Number(raw.duration),
    total: raw.total,
    released: raw.released,
  };

  const vestedAmount = vestedQuery.data ?? 0n;
  const releasableAmount = releasableQuery.data ?? 0n;
  const progressPct = vestingProgressPercent(schedule);
  const status = scheduleStatus(schedule);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[16px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Schedule #{id}
              </span>
              <StatusBadge status={status} />
            </div>

            <Link
              href="/"
              className="text-[11px] uppercase tracking-[0.04em] underline"
              style={{ color: "var(--text-secondary)" }}
            >
              New Schedule
            </Link>
          </div>

          {/* Progress bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex justify-between items-center text-[11px]">
              <span style={{ color: "var(--text-secondary)" }}>Vesting Progress</span>
              <span className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                {progressPct}%
              </span>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}
            >
              <div
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>

          {/* Balances summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <StatCard
              label="Total Locked"
              value={`${formatEther(schedule.total)} ${SYMBOL}`}
              sub={`${schedule.total.toString()} wei`}
            />
            <StatCard
              label="Released So Far"
              value={`${formatEther(schedule.released)} ${SYMBOL}`}
              sub={`${schedule.released.toString()} wei`}
            />
            <StatCard
              label="Releasable Now"
              value={`${formatEther(releasableAmount)} ${SYMBOL}`}
              sub={`Vested: ${formatEther(vestedAmount)} ${SYMBOL}`}
              highlight={releasableAmount > 0n}
            />
          </div>

          {/* Schedule details */}
          <div
            className="flex flex-col gap-2.5 p-3 rounded text-[12px]"
            style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <span style={{ color: "var(--text-secondary)" }}>Beneficiary</span>
              <a
                href={addressUrl(chainId, schedule.beneficiary)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] underline break-all"
                style={{ color: "var(--accent)" }}
              >
                {schedule.beneficiary}
              </a>
            </div>

            <div className="flex justify-between items-center gap-1">
              <span style={{ color: "var(--text-secondary)" }}>Created (Start)</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-primary)" }}>
                {formatDateTimeUTC(startDate(schedule))}
              </span>
            </div>

            <div className="flex justify-between items-center gap-1">
              <span style={{ color: "var(--text-secondary)" }}>Cliff Date</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-primary)" }}>
                {formatDateTimeUTC(cliffDate(schedule))} ({Math.round(schedule.cliff / 86400)}d)
              </span>
            </div>

            <div className="flex justify-between items-center gap-1">
              <span style={{ color: "var(--text-secondary)" }}>Full Vesting Date</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-primary)" }}>
                {formatDateTimeUTC(endDate(schedule))} ({Math.round(schedule.duration / 86400)}d)
              </span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Release action card */}
      <ReleaseAction
        id={idBigInt}
        beneficiary={schedule.beneficiary}
        releasable={releasableAmount}
        status={status}
        onReleased={() => {
          void refetchSchedule();
          void refetchVested();
          void refetchReleasable();
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: "Before cliff" | "Vesting" | "Completed" }) {
  if (status === "Completed") return <Badge variant="confirmed">Completed</Badge>;
  if (status === "Vesting") return <Badge variant="pending">Vesting</Badge>;
  return <Badge variant="default">Before cliff</Badge>;
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 p-3 rounded"
      style={{
        background: "var(--bg-base)",
        border: `1px solid ${highlight ? "var(--accent)" : "var(--border-subtle)"}`,
      }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.06em]"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[15px] font-semibold"
        style={{ color: highlight ? "var(--accent)" : "var(--text-primary)" }}
      >
        {value}
      </span>
      {sub ? (
        <span className="text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function ReleaseAction({
  id,
  beneficiary,
  releasable,
  status,
  onReleased,
}: {
  id: bigint;
  beneficiary: string;
  releasable: bigint;
  status: "Before cliff" | "Vesting" | "Completed";
  onReleased: () => void;
}) {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;

  const receipt = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
    query: { enabled: Boolean(hash) },
  });

  const settledHash = useRef<Hex | null>(null);

  useEffect(() => {
    if (!hash || settledHash.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;

    settledHash.current = hash;

    if (receipt.isSuccess) {
      setStage("confirmed");
      toast("success", "Released", "Funds have been transferred to the beneficiary.");
      onReleased();
    } else {
      setStage("failed");
      toast("error", "Release failed", "Transaction reverted. Check the explorer and try again.");
    }
  }, [hash, receipt.isSuccess, receipt.isError, toast, onReleased]);

  const handleRelease = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId) || releasable === 0n) return;

    setStage("signing");
    setHash(null);
    settledHash.current = null;

    try {
      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: cliffAbi,
        functionName: "release",
        args: [id],
        chainId,
      });

      setHash(txHash);
      setStage("pending");
    } catch (err) {
      setStage("idle");

      const reverted =
        err instanceof BaseError
          ? err.walk((e) => e instanceof ContractFunctionRevertedError)
          : null;

      if (reverted instanceof ContractFunctionRevertedError) {
        const error = reverted.data;
        if (error?.errorName === "NothingReleasable") {
          toast("warning", "Nothing releasable", "No vested funds are available to claim right now.");
          return;
        }
        if (error?.errorName === "NotFound") {
          toast("error", "Schedule not found", "This schedule does not exist.");
          return;
        }
        if (error?.errorName === "TransferFailed") {
          toast("error", "Transfer failed", "The beneficiary account rejected the BOT transfer.");
          return;
        }
      }

      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) {
        toast("info", "Cancelled", "Nothing was sent.");
      } else {
        toast("error", "Release failed", message);
      }
    }
  }, [deployment, chainId, releasable, id, writeContractAsync, toast]);

  const isBeneficiary =
    address && address.toLowerCase() === beneficiary.toLowerCase();

  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <div>
          <h3
            className="text-[12px] font-semibold uppercase tracking-[0.04em]"
            style={{ color: "var(--text-primary)" }}
          >
            Release Vested Funds
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Anyone may trigger a release. However, funds are strictly transferred to the beneficiary
            address ({beneficiary.slice(0, 6)}…{beneficiary.slice(-4)}).
            {isBeneficiary ? " (You are the beneficiary)." : ""}
          </p>
        </div>

        {/* §3.3: stage === 'confirmed' checked FIRST */}
        {stage === "confirmed" ? (
          <div className="flex flex-col gap-2">
            <TxStatus
              stage="confirmed"
              hash={hash}
              confirmedLabel="Funds released to beneficiary on chain"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStage("idle");
                setHash(null);
                settledHash.current = null;
              }}
            >
              Dismiss
            </Button>
          </div>
        ) : (
          <BotChainGate
            noWalletNote="Viewing the schedule works without a wallet. Triggering a release requires connecting a wallet."
          >
            <div className="flex flex-col gap-3">
              {stage === "idle" || stage === "failed" ? (
                <Button
                  onClick={handleRelease}
                  disabled={releasable === 0n}
                >
                  {releasable > 0n
                    ? `Release ${formatEther(releasable)} ${SYMBOL}`
                    : status === "Before cliff"
                      ? "Cliff Not Reached Yet"
                      : status === "Completed"
                        ? "Schedule Fully Released"
                        : "Nothing Releasable Yet"}
                </Button>
              ) : null}

              <TxStatus
                stage={stage}
                hash={hash}
                failedLabel="Transaction failed — no funds were released."
              />
            </div>
          </BotChainGate>
        )}
      </div>
    </Panel>
  );
}
