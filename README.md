# Cliff

Team vesting with a cliff, then linear release.

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
