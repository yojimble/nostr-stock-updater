import { useQuery } from '@tanstack/react-query';

export interface BtcPrices {
  USD: number;
  EUR: number;
  GBP: number;
  CAD: number;
  CHF: number;
  AUD: number;
  JPY: number;
}

/** Fetches current BTC fiat prices from mempool.space (no API key required). */
export function useBtcPrice() {
  return useQuery<BtcPrices>({
    queryKey: ['btc-price'],
    queryFn: async ({ signal }) => {
      const res = await fetch('https://mempool.space/api/v1/prices', {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });
      if (!res.ok) throw new Error('Failed to fetch BTC price');
      return res.json();
    },
    staleTime: 60_000,
    retry: 2,
  });
}

/** Converts a fiat/sats/btc amount to whole sats. Returns null if the currency isn't supported. */
export function toSats(amount: number, currency: string, prices: BtcPrices | undefined): number | null {
  const code = currency.trim().toUpperCase();

  if (code === 'SAT' || code === 'SATS') return Math.round(amount);
  if (code === 'BTC') return Math.round(amount * 1e8);

  if (!prices) return null;
  const rate = prices[code as keyof BtcPrices];
  if (!rate) return null;

  return Math.round((amount / rate) * 1e8);
}
