import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartConfig } from '../types';

interface TradingChartProps {
  config: ChartConfig;
}

const TradingChart: React.FC<TradingChartProps> = ({ config }) => {
  const isPositive = config.data[config.data.length - 1].value >= config.data[0].value;
  const strokeColor = isPositive ? '#089981' : '#f23645';
  const fillColor = isPositive ? '#089981' : '#f23645';

  return (
    <div className="w-full h-full flex flex-col bg-[#131722] border border-[#2a2e39] rounded-sm relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#131722] z-10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wide text-white">{config.symbol}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${isPositive ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'}`}>
            {isPositive ? '+' : ''}{((config.data[config.data.length - 1].value - config.data[0].value) / config.data[0].value * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex gap-2">
          <span className="text-[#5d606b] text-xs cursor-pointer hover:text-white">1H</span>
          <span className="text-[#5d606b] text-xs cursor-pointer hover:text-white">4H</span>
          <span className="text-white text-xs font-medium cursor-pointer">1D</span>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={config.data}>
            <defs>
              <linearGradient id={`color-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={fillColor} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={fillColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false} />
            <XAxis 
              dataKey="time" 
              hide={true} 
            />
            <YAxis 
              domain={['auto', 'auto']} 
              orientation="right" 
              tick={{fill: '#5d606b', fontSize: 11}} 
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', color: '#d1d4dc' }}
              itemStyle={{ color: '#d1d4dc' }}
              labelStyle={{ color: '#787b86' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke={strokeColor} 
              fillOpacity={1} 
              fill={`url(#color-${config.id})`} 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Watermark/Logo placeholder effect */}
      <div className="absolute bottom-4 left-4 pointer-events-none opacity-10">
        <span className="text-4xl font-black text-white">TradingView</span>
      </div>
    </div>
  );
};

export default TradingChart;