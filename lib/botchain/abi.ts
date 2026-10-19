/**
 * Cliff ABI.
 *
 * Hand-written and `as const` rather than imported from `contracts/out`. The const assertion is
 * what gives viem and wagmi their argument and return types; a generated JSON artifact loses that
 * unless it is cast, and a mistyped argument would then only surface as a revert.
 *
 * Custom errors belong in the ABI so viem can decode reverts cleanly.
 */
export const cliffAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "payable",
    inputs: [
      { name: "beneficiary", type: "address" },
      { name: "cliffSeconds", type: "uint64" },
      { name: "durationSeconds", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "vested",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "releasable",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "scheduleOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "beneficiary", type: "address" },
          { name: "start", type: "uint64" },
          { name: "cliff", type: "uint64" },
          { name: "duration", type: "uint64" },
          { name: "total", type: "uint256" },
          { name: "released", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "Created",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "start", type: "uint64", indexed: false },
      { name: "cliff", type: "uint64", indexed: false },
      { name: "duration", type: "uint64", indexed: false },
      { name: "total", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "ZeroValue", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroDuration", inputs: [] },
  {
    type: "error",
    name: "CliffExceedsDuration",
    inputs: [
      { name: "cliff", type: "uint64" },
      { name: "duration", type: "uint64" },
    ],
  },
  {
    type: "error",
    name: "NotFound",
    inputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "error",
    name: "NothingReleasable",
    inputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
] as const;

export const contractAbi = cliffAbi;
