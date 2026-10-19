import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { cliffAbi } from "@/lib/botchain/abi";

/**
 * The hand-written ABI, against the real compiled contract, on a real EVM.
 *
 * Drives the contract only through the app's hand-written ABI and viem.
 *
 *   npm run test:integration
 */

const PORT = 8546;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let wallet: WalletClient;
let address: Address;
let deployBlock: bigint;
const account = privateKeyToAccount(KEY);

// Secondary beneficiary account: anvil account #2
const BEN_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const beneficiaryAccount = privateKeyToAccount(BEN_KEY);

function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName),
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data?.errorName;
}

beforeAll(async () => {
  node = spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  wallet = createWalletClient({ account, chain: local, transport: http() });

  // Wait for anvil to bind
  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const artifact = JSON.parse(
    readFileSync(
      new URL("../../contracts/out/Cliff.sol/Cliff.json", import.meta.url),
      "utf8",
    ),
  ) as { bytecode: { object: Hex } };

  const hash = await wallet.deployContract({
    abi: cliffAbi,
    bytecode: artifact.bytecode.object,
    account,
    chain: local,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  address = receipt.contractAddress!;
  deployBlock = receipt.blockNumber;

  process.env.NEXT_PUBLIC_BOHR_RPC = RPC;
  process.env.NEXT_PUBLIC_BOTCHAIN_NETWORK = "testnet";
  process.env.NEXT_PUBLIC_CONTRACT_968 = address;
  process.env.NEXT_PUBLIC_DEPLOY_BLOCK_968 = String(deployBlock > 1n ? deployBlock - 1n : 1n);
}, 60_000);

afterAll(() => {
  node?.kill("SIGTERM");
});

describe("Cliff ABI against compiled contract on anvil", () => {
  it("deploys successfully", () => {
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("creates a vesting schedule and verifies gas < 130_000", async () => {
    const cliffSeconds = 30n * 86400n; // 30 days
    const durationSeconds = 90n * 86400n; // 90 days
    const amount = parseEther("1.0");

    const hash = await wallet.writeContract({
      address,
      abi: cliffAbi,
      functionName: "create",
      args: [beneficiaryAccount.address, cliffSeconds, durationSeconds],
      value: amount,
      account,
      chain: local,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Real gas paid in transaction
    expect(receipt.gasUsed).toBeLessThan(130_000n);

    // Read back schedule 1
    const schedule = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "scheduleOf",
      args: [1n],
    });

    expect(schedule.beneficiary.toLowerCase()).toBe(beneficiaryAccount.address.toLowerCase());
    expect(schedule.cliff).toBe(cliffSeconds);
    expect(schedule.duration).toBe(durationSeconds);
    expect(schedule.total).toBe(amount);
    expect(schedule.released).toBe(0n);
  });

  it("returns 0 vested and releasable before the cliff", async () => {
    const vested = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "vested",
      args: [1n],
    });
    expect(vested).toBe(0n);

    const releasable = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "releasable",
      args: [1n],
    });
    expect(releasable).toBe(0n);

    // Attempting to release before cliff reverts with NothingReleasable
    try {
      await publicClient.simulateContract({
        address,
        abi: cliffAbi,
        functionName: "release",
        args: [1n],
        account,
      });
      throw new Error("expected revert before cliff");
    } catch (err) {
      expect(revertName(err)).toBe("NothingReleasable");
    }
  });

  it("vests after cliff and allows release to transfer to beneficiary", async () => {
    // Advance time past cliff: 35 days from creation
    const thirtyFiveDays = 35 * 86400;
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [thirtyFiveDays] as any,
    });
    await publicClient.request({ method: "evm_mine" as any });

    const vested = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "vested",
      args: [1n],
    });
    expect(vested).toBeGreaterThan(0n);

    const releasable = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "releasable",
      args: [1n],
    });
    expect(releasable).toBe(vested);

    const benBalBefore = await publicClient.getBalance({ address: beneficiaryAccount.address });

    // Stranger triggers release (account sends tx)
    const releaseHash = await wallet.writeContract({
      address,
      abi: cliffAbi,
      functionName: "release",
      args: [1n],
      account,
      chain: local,
    });
    const releaseReceipt = await publicClient.waitForTransactionReceipt({ hash: releaseHash });
    expect(releaseReceipt.status).toBe("success");

    const benBalAfter = await publicClient.getBalance({ address: beneficiaryAccount.address });
    expect(benBalAfter - benBalBefore).toBe(releasable);

    const scheduleAfter = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "scheduleOf",
      args: [1n],
    });
    expect(scheduleAfter.released).toBe(releasable);
  });

  it("vests exactly total at and after duration end", async () => {
    // Advance time past end (another 60 days, total > 95 days)
    const sixtyDays = 60 * 86400;
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [sixtyDays] as any,
    });
    await publicClient.request({ method: "evm_mine" as any });

    const total = parseEther("1.0");

    const vested = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "vested",
      args: [1n],
    });
    expect(vested).toBe(total);

    const releasable = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "releasable",
      args: [1n],
    });

    const benBalBefore = await publicClient.getBalance({ address: beneficiaryAccount.address });

    // Release remainder
    const releaseHash = await wallet.writeContract({
      address,
      abi: cliffAbi,
      functionName: "release",
      args: [1n],
      account,
      chain: local,
    });
    await publicClient.waitForTransactionReceipt({ hash: releaseHash });

    const benBalAfter = await publicClient.getBalance({ address: beneficiaryAccount.address });
    expect(benBalAfter - benBalBefore).toBe(releasable);

    const finalSchedule = await publicClient.readContract({
      address,
      abi: cliffAbi,
      functionName: "scheduleOf",
      args: [1n],
    });
    expect(finalSchedule.released).toBe(total);
  });

  it("reverts on invalid create arguments with custom errors", async () => {
    // Zero value
    try {
      await publicClient.simulateContract({
        address,
        abi: cliffAbi,
        functionName: "create",
        args: [beneficiaryAccount.address, 100n, 200n],
        value: 0n,
        account,
      });
      throw new Error("expected revert on ZeroValue");
    } catch (err) {
      expect(revertName(err)).toBe("ZeroValue");
    }

    // Cliff exceeds duration
    try {
      await publicClient.simulateContract({
        address,
        abi: cliffAbi,
        functionName: "create",
        args: [beneficiaryAccount.address, 300n, 200n],
        value: parseEther("1"),
        account,
      });
      throw new Error("expected revert on CliffExceedsDuration");
    } catch (err) {
      expect(revertName(err)).toBe("CliffExceedsDuration");
    }
  });
});
