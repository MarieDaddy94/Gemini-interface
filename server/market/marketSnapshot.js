
// server/market/marketSnapshot.js
//
// Market snapshot builder for the squad & Autopilot.
// For now this generates a synthetic OHLC structure around a base price.
// Later you can swap the generator to use a real data feed
// (TradingView, broker API, Polygon, etc.) without touching callers.

/**
 * @typedef {Object} OhlcCandle
 * @property {number} time
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {Object} MarketSnapshot
 * @property {string} symbol
 * @property {string} primaryTimeframe
 * @property {number} lastPrice
 * @property {OhlcCandle[]} [m1]
 * @property {OhlcCandle[]} [m5]
 * @property {OhlcCandle[]} [m15]
 * @property {OhlcCandle[]} [h1]
 * @property {OhlcCandle[]} [h4]
 * @property {OhlcCandle[]} [d1]
 * @property {string} [trendSummary]
 * @property {string} [volatilitySummary]
 */

function generateSeries(basePrice, count, volatilityPoints, driftPointsPerBar) {
  /** @type {OhlcCandle[]} */
  const candles = [];
  let lastClose = basePrice;
  const now = Date.now();

  for (let i = count - 1; i >= 0; i--) {
    const t = now - i * 60_000; // 1-minute spacing baseline

    const rnd = (Math.random() - 0.5) * 2; // -1..1
    const move = driftPointsPerBar + rnd * volatilityPoints;

    const open = lastClose;
    const close = open + move;
    const high = Math.max(open, close) + Math.abs(volatilityPoints) * 0.3;
    const low = Math.min(open, close) - Math.abs(volatilityPoints) * 0.3;

    candles.push({
      time: t,
      open,
      high,
      low,
      close,
      volume: 0,
    });

    lastClose = close;
  }

  return candles;
}

/**
 * Rough trend + volatility text from a series.
 * @param {OhlcCandle[]} series
 */
function describeSeries(series) {
  if (!series || series.length < 4) {
    return { trend: 'unknown', vol: 'unknown' };
  }
  const first = series[0].close;
  const last = series[series.length - 1].close;
  const change = last - first;
  const pct = (change / first) * 100;

  let trend;
  if (pct > 1.5) trend = 'uptrend';
  else if (pct < -1.5) trend = 'downtrend';
  else trend = 'sideways';

  let sumRange = 0;
  for (const c of series) sumRange += c.high - c.low;
  const avgRange = sumRange / series.length;

  let vol;
  if (avgRange > first * 0.005) vol = 'high';
  else if (avgRange > first * 0.002) vol = 'medium';
  else vol = 'low';

  return {
    trend,
    vol,
    pctChange: pct,
  };
}

/**
 * Build a synthetic snapshot around a base price.
 *
 * @param {string} symbol
 * @param {string} primaryTimeframe
 * @param {number} basePrice
 * @returns {MarketSnapshot}
 */
function generateSyntheticSnapshot(symbol, primaryTimeframe, basePrice) {
  const base = basePrice || 40000;

  const m1 = generateSeries(base, 60, base * 0.0008, base * 0.0002);
  const m5 = generateSeries(base, 60, base * 0.0015, base * 0.0003);
  const m15 = generateSeries(base, 40, base * 0.002, base * 0.0004);
  const h1 = generateSeries(base, 48, base * 0.003, base * 0.0005);

  const desc1 = describeSeries(m1);
  const desc15 = describeSeries(m15);
  const descH1 = describeSeries(h1);

  const trendSummary = [
    `1m: ${desc1.trend} (${desc1.pctChange.toFixed(2)}%)`,
    `15m: ${desc15.trend} (${desc15.pctChange.toFixed(2)}%)`,
    `1h: ${descH1.trend} (${descH1.pctChange.toFixed(2)}%)`,
  ].join(' | ');

  const volSummary = `Approx intraday volatility: 1m ranges ~${(
    (m1[0].high - m1[0].low) /
    base
  ).toFixed(4)} of price per bar.`;

  const lastPrice = m1[m1.length - 1].close;

  return {
    symbol,
    primaryTimeframe,
    lastPrice,
    m1,
    m5,
    m15,
    h1,
    trendSummary,
    volatilitySummary: volSummary,
  };
}

/**
 * Public entry: build a snapshot for the current session.
 * Swap this implementation to real data when you have a feed.
 *
 * @param {any} sessionState
 * @returns {Promise<MarketSnapshot>}
 */
async function getMarketSnapshotForSession(sessionState) {
  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};

  const symbol =
    instrument.symbol || instrument.displayName || 'UNKNOWN_SYMBOL';

  // If you have real lastPrice in state, use it. Otherwise pick a generic base.
  const hintPrice =
    typeof instrument.lastPrice === 'number'
      ? instrument.lastPrice
      : symbol.includes('US30')
      ? 39000
      : symbol.includes('NAS') || symbol.includes('NQ')
      ? 17000
      : 2000;

  // Right now we just generate synthetic structure.
  const snapshot = generateSyntheticSnapshot(
    symbol,
    tf.currentTimeframe || 'unknown',
    hintPrice
  );

  return snapshot;
}

/**
 * Format snapshot as compact text for LLM prompts.
 *
 * @param {MarketSnapshot} snap
 */
function formatMarketSnapshotForPrompt(snap) {
  if (!snap) return '(no market snapshot available)';

  const lines = [];

  lines.push(`Symbol: ${snap.symbol}`);
  lines.push(
    `Primary TF: ${snap.primaryTimeframe} | Last price: ${snap.lastPrice.toFixed(
      2
    )}`
  );
  if (snap.trendSummary) lines.push(`Trend summary: ${snap.trendSummary}`);
  if (snap.volatilitySummary)
    lines.push(`Volatility: ${snap.volatilitySummary}`);

  const appendSeriesSummary = (label, series) => {
    if (!series || series.length === 0) return;
    const recent = series.slice(-10); // last 10 candles
    const closes = recent.map((c) => c.close.toFixed(1)).join(', ');
    lines.push(`${label} closes (most recent ~10): ${closes}`);
  };

  appendSeriesSummary('1m', snap.m1);
  appendSeriesSummary('5m', snap.m5);
  appendSeriesSummary('15m', snap.m15);
  appendSeriesSummary('1h', snap.h1);

  return lines.join('\n');
}

module.exports = {
  getMarketSnapshotForSession,
  formatMarketSnapshotForPrompt,
};
