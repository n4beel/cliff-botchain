"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BaseError,
  ContractFunctionRevertedError,
  isAddress,
  parseEther,
  parseEventLogs,
  type Hex,
} from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import BotChainGate from "@/components/botchain/BotChainGate";
import Panel from "@/components/ui/Panel";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { getDeployment, ZERO_ADDRESS } from "@/lib/botchain/deployment";
import { cliffAbi } from "@/lib/botchain/abi";

// The chain's own symbol. Hardcoding "BOT" labelled every testnet amount as mainnet
// currency, which is the confusion the network badge exists to prevent.
const SYMBOL = activeBotChain.nativeCurrency.symbol;

export default function CreateForm() {
  return (
    <BotChainGate
      noWalletNote="Creating a vesting schedule requires connecting a native BOT Chain wallet."
    >
      <CreateFormInner />
    </BotChainGate>
  );
}

function CreateFormInner() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [beneficiary, setBeneficiary] = useState("");
  const [cliffDays, setCliffDays] = useState("30");
  const [durationDays, setDurationDays] = useState("90");
  const [amount, setAmount] = useState("1");

  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;

  const receipt = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
    query: { enabled: Boolean(hash) },
  });

  /**
   * One settlement per transaction, keyed by its hash in a ref.
   * Settled-ref pattern copied from SealForm.tsx.
   */
  const settledHash = useRef<Hex | null>(null);

  useEffect(() => {
    if (!hash || settledHash.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;

    settledHash.current = hash;

    if (receipt.isSuccess) {
      setStage("confirmed");
      toast("success", "Schedule created", "The vesting schedule is now live on chain.");

      if (receipt.data?.logs) {
        try {
          const logs = parseEventLogs({
            abi: cliffAbi,
            eventName: "Created",
            logs: receipt.data.logs,
          });
          if (logs.length > 0 && logs[0].args?.id !== undefined) {
            setCreatedId(logs[0].args.id);
          }
        } catch {
          // Log decoding fallback: if parsing fails, user still has the transaction link
        }
      }
    } else {
      setStage("failed");
      toast(
        "error",
        "Transaction failed",
        "The schedule could not be created. Check the explorer and try again.",
      );
    }
  }, [hash, receipt.isSuccess, receipt.isError, receipt.data, toast]);

  // Validation
  const trimmedBeneficiary = beneficiary.trim();
  const beneficiaryValid =
    isAddress(trimmedBeneficiary) && trimmedBeneficiary.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const beneficiaryError =
    trimmedBeneficiary && !beneficiaryValid ? "Enter a valid non-zero EVM address." : undefined;

  const cliffDaysNum = Number(cliffDays);
  const durationDaysNum = Number(durationDays);

  const durationError =
    durationDays !== "" && (!Number.isFinite(durationDaysNum) || durationDaysNum <= 0)
      ? "Duration must be greater than 0 days."
      : undefined;

  const cliffError =
    cliffDays !== "" && (!Number.isFinite(cliffDaysNum) || cliffDaysNum < 0)
      ? "Cliff cannot be negative."
      : cliffDaysNum > durationDaysNum && durationDaysNum > 0
        ? "Cliff cannot exceed total vesting duration."
        : undefined;

  let amountWei: bigint | null = null;
  let amountError: string | undefined;
  try {
    if (amount !== "") {
      const parsed = parseEther(amount);
      if (parsed <= 0n) {
        amountError = "Amount must be greater than 0.";
      } else {
        amountWei = parsed;
      }
    }
  } catch {
    amountError = "Enter a valid BOT amount.";
  }

  const formValid =
    beneficiaryValid &&
    !durationError &&
    !cliffError &&
    !amountError &&
    durationDaysNum > 0 &&
    cliffDaysNum <= durationDaysNum &&
    amountWei !== null &&
    amountWei > 0n;

  const handleCreate = useCallback(async () => {
    if (!formValid || !deployment || !isBotChainId(chainId) || !amountWei) return;

    setStage("signing");
    setHash(null);
    setCreatedId(null);
    settledHash.current = null;

    try {
      const cliffSeconds = BigInt(Math.floor(cliffDaysNum * 86400));
      const durationSeconds = BigInt(Math.floor(durationDaysNum * 86400));

      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: cliffAbi,
        functionName: "create",
        args: [trimmedBeneficiary as Hex, cliffSeconds, durationSeconds],
        value: amountWei,
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
        if (error?.errorName === "ZeroValue") {
          toast("error", "Zero value", "Must lock at least some BOT.");
          return;
        }
        if (error?.errorName === "ZeroAddress") {
          toast("error", "Zero address", "Beneficiary cannot be the zero address.");
          return;
        }
        if (error?.errorName === "ZeroDuration") {
          toast("error", "Zero duration", "Vesting duration must be greater than zero.");
          return;
        }
        if (error?.errorName === "CliffExceedsDuration") {
          toast("error", "Invalid schedule", "Cliff duration cannot exceed total duration.");
          return;
        }
      }

      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) {
        toast("info", "Cancelled", "Nothing was sent.");
      } else {
        toast("error", "Could not create schedule", message);
      }
    }
  }, [
    formValid,
    deployment,
    chainId,
    amountWei,
    cliffDaysNum,
    durationDaysNum,
    trimmedBeneficiary,
    writeContractAsync,
    toast,
  ]);

  // Stage confirmed rendered FIRST per §3.3
  if (stage === "confirmed") {
    return (
      <Panel>
        <div className="flex flex-col gap-4">
          <TxStatus
            stage="confirmed"
            hash={hash}
            confirmedLabel="Vesting schedule created on chain"
          />

          {createdId !== null ? (
            <div
              className="flex flex-col gap-2 p-3.5 rounded"
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[11px] uppercase tracking-[0.04em]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Schedule ID
                </span>
                <span className="font-mono text-[14px] font-semibold" style={{ color: "var(--accent)" }}>
                  #{createdId.toString()}
                </span>
              </div>
              <Link
                href={`/schedule/${createdId.toString()}`}
                className="inline-flex items-center text-[12px] uppercase tracking-[0.04em] font-medium underline mt-1"
                style={{ color: "var(--accent)" }}
              >
                Open Schedule #{createdId.toString()} →
              </Link>
            </div>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStage("idle");
              setHash(null);
              setCreatedId(null);
              settledHash.current = null;
            }}
          >
            Create Another Schedule
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div>
          <h2
            className="text-[13px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--text-primary)" }}
          >
            New Vesting Schedule
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Lock BOT into a linear vesting curve with an initial cliff. Funds become claimable
            proportionally after the cliff.
          </p>
        </div>

        {/* Warning banner */}
        <div
          className="p-3 rounded text-[11px] leading-relaxed"
          style={{
            background: "rgba(245, 166, 35, 0.08)",
            border: "1px solid rgba(245, 166, 35, 0.25)",
            color: "var(--warning)",
          }}
        >
          <strong>Notice:</strong> No cancel and no early release. Once created, funds cannot be
          clawed back by the creator under any circumstances, and only the beneficiary can receive
          them as they vest.
        </div>

        <Input
          label="Beneficiary Address"
          placeholder="0x..."
          mono
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
          disabled={stage === "signing" || stage === "pending"}
          error={beneficiaryError}
          hint={
            address && !beneficiary
              ? `You can use your connected address (${address.slice(0, 6)}…${address.slice(-4)}) or any recipient.`
              : undefined
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Cliff Period (Days)"
            type="number"
            min="0"
            step="1"
            value={cliffDays}
            onChange={(e) => setCliffDays(e.target.value)}
            disabled={stage === "signing" || stage === "pending"}
            error={cliffError}
            hint="0% vests before this duration elapses."
          />

          <Input
            label="Total Vesting Duration (Days)"
            type="number"
            min="1"
            step="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            disabled={stage === "signing" || stage === "pending"}
            error={durationError}
            hint="100% is vested when duration completes."
          />
        </div>

        <Input
          label="Amount to Lock"
          type="text"
          placeholder="1.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={stage === "signing" || stage === "pending"}
          suffix="BOT"
          error={amountError}
          hint="Deposited into the contract from your connected wallet upon creation."
        />

        {stage === "idle" || stage === "failed" ? (
          <Button onClick={handleCreate} disabled={!formValid}>
            Create Schedule ({amount ? `${amount} ${SYMBOL}` : "..."})
          </Button>
        ) : null}

        <TxStatus
          stage={stage}
          hash={hash}
          failedLabel="Transaction failed — schedule was not created."
        />
      </div>
    </Panel>
  );
}
