import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts';
import { ChartConfig, ChartDataPoint } from '../types';
import { JournalEntry } from '../context/JournalContext';

interface TradingChartProps {
  config: ChartConfig;
  entries?: JournalEntry[];
  onDataPointClick?: (point: ChartDataPoint) => void;
}

const TradingChart: React.FC<TradingChartProps> = ({ config, entries = [], onDataPointClick }) => {
  const [selectedPoint, setSelectedPoint] = useState<ChartDataPoint | null>(null);

  const isPositive = config.data[config.data.length - 1].value >= config.data[0].value;
  const strokeColor = isPositive ? '#089981' : '#f23645';
  const fillColor = isPositive ? 'url(#colorPositive)' : 'url(#colorNegative)';

  // Map entries to chart data points by time (fuzzy match for demo purposes)
  const entriesByTime = useMemo(() => {
     const map = new Map<string, JournalEntry[]>();
     entries.forEach(e => {
        // Normalize ISO timestamp to HH:MM format used in Mock Data
        // In a real app, strict timestamp matching would be used
        const t = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (!map.has(t)) map.set(t, []);
        map.get(t)?.push(e);
     });
     return map;
  }, [entries]);

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
       const point = data.activePayload[0].payload as ChartDataPoint;
       setSelectedPoint(point);
       if (onDataPointClick) onDataPointClick(point);
    } else {
       // Optional: deselect on background click
       // setSelectedPoint(null);
    }
  };

  const matchedEntries = selectedPoint ? (entriesByTime.get(selectedPoint.time) || []) : [];

  return (
    <div className="w-full h-full flex flex-col bg-[#131722] border border-[#2a2e39] rounded-sm relative overflow-hidden group select-none">
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
      <div className="flex-1 w-full min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={config.data} 
            onClick={handleChartClick}
            margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#089981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#089981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f23645" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f23645" stopOpacity={0}/>
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
              cursor={{ stroke: '#2962ff', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke={strokeColor} 
              fillOpacity={1} 
              fill={fillColor} 
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
            />
            
            {/* Visual Markers for Journal Entries */}
            {entries.length > 0 && config.data.map((pt, idx) => {
               // Only render if we have a match
               const hasEntry = entriesByTime.has(pt.time);
               if (hasEntry) {
                 return (
                   <ReferenceDot 
                     key={`entry-${idx}`} 
                     x={pt.time} 
                     y={pt.value} 
                     r={5} 
                     fill="#2962ff" 
                     stroke="#fff" 
                     strokeWidth={2}
                   />
                 );
               }
               return null;
            })}
          </AreaChart>
        </ResponsiveContainer>
        
        {/* Data Point Inspector Overlay */}
        {selectedPoint && (
          <div className="absolute top-4 left-4 z-20 bg-[#1e222d]/95 backdrop-blur-sm border border-[#2a2e39] shadow-xl rounded-lg p-3 w-72 animate-fade-in text-xs ring-1 ring-white/10">
              <div className="flex justify-between items-start mb-3 border-b border-[#2a2e39] pb-2">
                 <div>
                   <span className="text-gray-400 block text-[10px] uppercase tracking-wider">Cursor Inspector</span>
                   <div className="flex items-baseline gap-2 mt-0.5">
                     <span className="text-white font-bold text-lg">{selectedPoint.time}</span>
                     <span className={`font-mono ${isPositive ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                       {selectedPoint.value.toFixed(2)}
                     </span>
                   </div>
                 </div>
                 <button 
                   onClick={(e) => { e.stopPropagation(); setSelectedPoint(null); }} 
                   className="text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded p-1 transition-colors"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
              </div>
              
              <div className="grid grid-cols-4 gap-2 mb-3 text-[10px] bg-[#131722] p-2 rounded border border-[#2a2e39]">
                 <div className="flex flex-col"><span className="text-gray-500">Open</span> <span className="text-gray-200 font-mono">{selectedPoint.open.toFixed(2)}</span></div>
                 <div className="flex flex-col"><span className="text-gray-500">High</span> <span className="text-gray-200 font-mono">{selectedPoint.high.toFixed(2)}</span></div>
                 <div className="flex flex-col"><span className="text-gray-500">Low</span> <span className="text-gray-200 font-mono">{selectedPoint.low.toFixed(2)}</span></div>
                 <div className="flex flex-col"><span className="text-gray-500">Close</span> <span className="text-gray-200 font-mono">{selectedPoint.close.toFixed(2)}</span></div>
              </div>

              {matchedEntries.length > 0 ? (
                 <div className="mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold text-[#2962ff] uppercase tracking-wide flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        Journal Entries ({matchedEntries.length})
                      </div>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                       {matchedEntries.map(e => (
                          <div key={e.id} className="bg-[#131722] p-2 rounded border border-[#2a2e39] hover:border-[#2962ff]/50 transition-colors group/entry cursor-pointer">
                             <div className="flex justify-between items-start mb-1">
                               <div className="flex items-center gap-1.5">
                                 <span className="font-semibold text-gray-200 text-[11px]">{e.playbook || 'Note'}</span>
                                 {e.source === 'ai' && <span className="text-[8px] bg-purple-500/20 text-purple-300 px-1 rounded border border-purple-500/30">AI</span>}
                               </div>
                               <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${e.direction === 'long' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : e.direction === 'short' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-gray-700/50 text-gray-400 border border-gray-600'}`}>
                                 {e.direction?.toUpperCase() || e.outcome || 'OPEN'}
                               </span>
                             </div>
                             <div className="text-[10px] text-gray-400 leading-snug line-clamp-2 group-hover/entry:line-clamp-none transition-all">
                                {e.note || e.postTradeNotes}
                             </div>
                             {e.agentName && (
                               <div className="mt-1.5 flex justify-end">
                                 <span className="text-[9px] text-gray-500 flex items-center gap-1">
                                   via {e.agentName}
                                 </span>
                               </div>
                             )}
                          </div>
                       ))}
                    </div>
                 </div>
              ) : (
                 <div className="mt-3 pt-2 border-t border-[#2a2e39] text-[10px] text-gray-500 italic text-center py-1">
                    No journal entries logged at this timestamp.
                 </div>
              )}
          </div>
        )}
      </div>
      
      {/* Watermark/Logo placeholder effect */}
      <div className="absolute bottom-4 left-4 pointer-events-none opacity-5 z-0">
        <span className="text-4xl font-black text-white">TradingView</span>
      </div>
    </div>
  );
};

export default TradingChart;