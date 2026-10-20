# Cliff

Team vesting with a cliff, then linear release.

### BOT Chain mainnet (677) — live

| | |
|---|---|
| Contract | [`0x38083268c3b2D7eBd93E272B88E6085F60a44f2d`](https://scan.botchain.ai/address/0x38083268c3b2D7eBd93E272B88E6085F60a44f2d) · source verified |
| Deploy block | 27329362 |

### Bohr testnet (968) — live

| | |
|---|---|
| Contract | [`0x27beC58ab2E4641CcF911773A96a6Bc55686C5e7`](https://scan.bohr.life/address/0x27beC58ab2E4641CcF911773A96a6Bc55686C5e7) · source verified |
| Deploy block | 27397032 |

The two addresses differ because the deployer's nonce diverged between the chains;
each is this contract on its own network. The site targets mainnet.

---

## What it does
Cliff locks BOT in a linear vesting schedule. Funds remain completely locked until the cliff duration elapses, after which they vest linearly until the schedule duration ends. Anyone may trigger `release()`, but released funds can only transfer to the beneficiary.

## What it deliberately cannot do
- **No owner**: nobody controls this contract after deployment
- **No cancellation**: schedules cannot be revoked or terminated early
- **No early release**: funds before the cliff cannot be accessed by anyone
- **No pause**: vesting schedules run unconditionally to completion

## Gas
- `create()`: ~114k gas (target: ~110k)
- `release()`: ~45k gas

## Honest limits
- Integer division: fractional wei is released at the final second so total released equals schedule total exactly
- Time is measured in seconds from block timestamp; sub-minute precision is subject to normal validator timestamp drift
