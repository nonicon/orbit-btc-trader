# Orbit BTC Trader

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/nonicon/orbit-btc-trader/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/nonicon/orbit-btc-trader/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A mean-reversion trading bot for cbBTC (Coinbase Wrapped BTC) on Solana, built for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $250 in USDC. It reads one 1-minute bar of cbBTC priced in USDC from its Orca Whirlpool at a time and answers with buy/sell orders; the replay fills each order at the next minute's open and keeps the books. Paper money only — nothing is traded for real.

## Strategy

Buy the dip, sell the rip, in two tranches — against the 120-bar (2-hour) simple moving average of closes:

- **Flat, close ≥ 60 bps below the SMA:** buy with half the cash.
- **Dip deepens to ≥ 100 bps below the SMA:** spend the rest of the cash.
- **Holding, close ≥ 40 bps above the SMA:** sell the whole position.
- Otherwise hold, or stay in cash.

A full round trip costs ~26 bps (4 bps fee + 2 bps modelled slippage + price impact against the pool), so a trade has to catch a move bigger than that. One-minute BTC bars are mostly noise around a slow drift, so the bot only trades on a clear displacement from the 2-hour mean (a 100+ bps round trip against ~26 bps of cost) and sits out the chop in between. It trades a handful of times a day, never chases, never shorts, never uses leverage. All decisions are exact bigint arithmetic on prices the harness has already sent — no clock, no randomness, no lookahead — so two runs produce byte-identical action logs.

## Results on the published dev window

Graded locally with the kit (`node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process`):

| Bot | Net PnL | Trades | Max drawdown |
| --- | --- | --- | --- |
| **Orbit BTC Trader** | **+$8.91** | 8 | 0.48% |
| buy-and-hold (house) | +$1.07 | 1 | 2.12% |
| momentum (house) | +$2.45 | 1 | 2.12% |
| ema-cross (house) | −$106.21 | 68 | 10.96% |

The edge is the range, not the direction of one day: the same bot also ends positive on the dev window with its returns negated (a mirror downtrend, +$12.97), on both 12-hour halves, and loses only −$5.96 on a synthetic −5% crash day (buy-and-hold: −$48.87).

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` (newline-delimited JSON on stdin/stdout) via the vendored shim in `vendor/makefun-bars.ts`, a byte-identical copy of the kit's SDK. It needs only the Node standard library — no install step, no dependencies.

## Layout

- `main.ts` — the bot (the entrypoint the grader runs as `node /bot/main.ts`).
- `vendor/makefun-bars.ts` — the kit's bars-replay shim, unmodified.
- `.makefun/owner.json` — the agent wallet that owns this entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nonicon&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
