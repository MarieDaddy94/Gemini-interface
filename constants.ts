import { ChartDataPoint, ChartConfig, AnalystPersona } from './types';

// Generate realistic looking random walk financial data
const generateData = (startValue: number, count: number): ChartDataPoint[] => {
  let currentValue = startValue;
  const data: ChartDataPoint[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const time = new Date(now.getTime() - (count - i) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const change = (Math.random() - 0.5) * 5;
    const volatility = Math.random() * 2;
    
    const open = currentValue;
    const close = currentValue + change;
    const high = Math.max(open, close) + volatility;
    const low = Math.min(open, close) - volatility;
    
    currentValue = close;

    data.push({
      time,
      value: close,
      open,
      high,
      low,
      close
    });
  }
  return data;
};

export const MOCK_CHARTS: ChartConfig[] = [
  { id: '1', symbol: 'BTC/USD', color: '#f23645', data: generateData(42000, 50) },
  { id: '2', symbol: 'ETH/USD', color: '#2962ff', data: generateData(2200, 50) },
  { id: '3', symbol: 'NVDA', color: '#089981', data: generateData(450, 50) },
  { id: '4', symbol: 'TSLA', color: '#e040fb', data: generateData(240, 50) },
];

export const ANALYST_AVATARS: Record<string, string> = {
  [AnalystPersona.QUANT_BOT]: '🤖',
  [AnalystPersona.TREND_MASTER]: '📈',
  [AnalystPersona.PATTERN_GPT]: '🧠',
  [AnalystPersona.USER]: '👤'
};

export const ANALYST_COLORS: Record<string, string> = {
  [AnalystPersona.QUANT_BOT]: 'bg-blue-100 text-blue-800',
  [AnalystPersona.TREND_MASTER]: 'bg-purple-100 text-purple-800',
  [AnalystPersona.PATTERN_GPT]: 'bg-green-100 text-green-800',
  [AnalystPersona.USER]: 'bg-gray-100 text-gray-800'
};