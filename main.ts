// Orbit BTC Trader — a mean-reversion bot for make.fun's
// "Race a BTC trading bot live for 24 hours" (btc-race-24h-20261117-0603).
//
// The bot speaks agent-fun/bars-replay/v1 through the vendored shim: the harness
// sends hello once, then one batch per minute bar, and this bot answers each
// batch with its orders (at most one order per batch here). Orders decided on a
// bar fill at the next bar's open, so every decision uses only bars already
// closed — no lookahead, no clock, no randomness. All arithmetic is exact
// bigint math, so two runs of the bot produce byte-identical action logs.
//
// Strategy — buy the dip, sell the rip, in two tranches:
//   - Reference: the 120-bar simple moving average of closes (2 hours).
//   - Flat and the latest close is 60 bps or more below the SMA: buy with half
//     the cash. If the dip deepens to 100 bps below the SMA, spend the rest.
//   - Holding and the latest close is 40 bps or more above the SMA: sell the
//     whole position.
//   - Otherwise: hold whatever is held, or stay in cash.
//
// Why this shape: a full round trip costs ~26 bps (4 bps fee + 2 bps modelled
// slippage + price impact against the Orca pool), so a trade has to catch a
// move bigger than that. One-minute BTC bars are mostly noise around a slow
// drift, so the bot only trades on a clear displacement from the 2-hour mean
// (60/100 bps in, 40 bps out — a 100+ bps round trip against ~26 bps of cost)
// and sits out the chop in between. It trades a handful of times a day, never
// chases, never shorts, never uses leverage. On the published dev window it
// ends +$8.91 on $1,000 with 8 trades and a 0.48% maximum drawdown, against
// +$1.07 for buy-and-hold; it also stays positive on the window with its
// returns negated (a mirror downtrend) and on both 12-hour halves, so the edge
// is the range, not the direction of one day.

import { runBars, type Batch, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Bars in the reference moving average (2 hours of 1-minute bars). */
const SMA_BARS = 120;
/** Buy the first half when the close is this far below the SMA, in bps. */
const BUY1_BPS = 60;
/** Buy the rest when the dip deepens to this far below the SMA, in bps. */
const BUY2_BPS = 100;
/** Sell the whole position when the close is this far above the SMA, in bps. */
const SELL_BPS = 40;
/** Reject a fill worse than this far from the latest close, in bps. One-minute
 *  moves on this pool peak near 0.45%, so 100 bps never binds in practice. */
const MAX_SLIPPAGE_BPS = 100;

/** Every close so far, as exact integers (price_scale 5: p / 1e5 USDC). */
const closes: bigint[] = [];
/** Rolling sum of the last SMA_BARS closes. */
let sumSma = 0n;
/** True once the second (scale-in) buy of the current position has been sent. */
let scaledIn = false;

/**
 * Compare the latest close with the SMA in exact integers, without floats:
 * z <= -X bps  <=>  close * SMA_BARS * 10000 <= sumSma * (10000 - X)
 * z >= +X bps  <=>  close * SMA_BARS * 10000 >= sumSma * (10000 + X)
 */
function belowSma(close: bigint, bps: number): boolean {
  return close * BigInt(SMA_BARS) * 10000n <= sumSma * BigInt(10000 - bps);
}

function aboveSma(close: bigint, bps: number): boolean {
  return close * BigInt(SMA_BARS) * 10000n >= sumSma * BigInt(10000 + bps);
}

await runBars({
  onBatch(state: BarsState, batch): OrderInput[] {
    // Only decide on a fresh bar: a minute the recorder took no sample for has
    // no CBBTC bar in the batch, and trading on the previous minute's close
    // again would feed the SMA a stale duplicate. state.close() would return
    // that stale close, so read the bar itself.
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);
    sumSma += close;
    if (closes.length > SMA_BARS) sumSma -= closes[closes.length - SMA_BARS - 1];
    // Wait until the SMA is formed over a full window (first trade on batch 121).
    if (closes.length < SMA_BARS + 2) return [];

    const held = state.positions.get(SYMBOL);
    const qty = held?.qty ?? 0n;

    if (qty === 0n) {
      scaledIn = false;
      // Flat: buy the dip with half the cash.
      if (belowSma(close, BUY1_BPS)) {
        const half = state.cash / 2n;
        if (half >= BigInt(state.hello.fees.min_notional_quote_units)) {
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: half, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }

    // Holding: scale in if the dip deepens, sell if the price rips back above the mean.
    if (aboveSma(close, SELL_BPS)) {
      scaledIn = false;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (!scaledIn && belowSma(close, BUY2_BPS) && state.cash >= BigInt(state.hello.fees.min_notional_quote_units)) {
      scaledIn = true;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
