
import { useMarketDataContext } from '../context/MarketDataContext';

export function useMarketDataFeed() {
  const { marketData, isConnected } = useMarketDataContext();
  return { marketData, isConnected };
}
