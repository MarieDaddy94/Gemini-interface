import { BrokerPosition } from './types';

export type FocusSymbol = 'Auto' | 'US30' | 'NAS100' | 'XAUUSD' | 'BTCUSD';

interface SymbolProfile {
  focus: FocusSymbol;
  brokerMatchers: (symbol: string) => boolean;
}

const profiles: SymbolProfile[] = [
  {
    focus: 'US30',
    brokerMatchers: (s) => /US30|DJ30|DJI/i.test(s)
  },
  {
    focus: 'NAS100',
    brokerMatchers: (s) => /NAS100|NAS100m|NQ100|NQ/i.test(s)
  },
  {
    focus: 'XAUUSD',
    brokerMatchers: (s) => /XAUUSD|XAU\/USD|GOLD/i.test(s)
  },
  {
    focus: 'BTCUSD',
    brokerMatchers: (s) => /BTCUSD|BTC\/USD|BTCUSDT/i.test(s)
  }
];

/**
 * Look at all open positions and infer which "focus symbol"
 * matters most, based on size and absolute PnL.
 */
export function detectFocusSymbolFromPositions(
  positions: BrokerPosition[] | null | undefined
): FocusSymbol {
  if (!positions || positions.length === 0) return 'Auto';

  const scored: { focus: FocusSymbol; score: number }[] = profiles.map(
    (profile) => ({
      focus: profile.focus,
      score: 0
    })
  );

  for (const pos of positions) {
    const sym = pos.symbol || '';
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if (p.brokerMatchers(sym)) {
        // Weight by lot size * |PnL| so bigger & hotter trades dominate
        const weight = Math.abs(pos.size) * (Math.abs(pos.pnl) + 1);
        scored[i].score += weight;
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score <= 0) return 'Auto';
  return best.focus;
}