
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { MarketTick } from '../types';

interface NativeChartProps {
  symbol: string;
  data: Record<string, MarketTick>;
}

const NativeChart: React.FC<NativeChartProps> = ({ symbol, data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [lastTickTime, setLastTickTime] = useState<number>(0);

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    // Candlesticks
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    });

    // Volume
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay on main chart
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Indicators (Bollinger Bands)
    const bbUpper = chart.addLineSeries({ color: 'rgba(41, 98, 255, 0.5)', lineWidth: 1 });
    const bbLower = chart.addLineSeries({ color: 'rgba(41, 98, 255, 0.5)', lineWidth: 1 });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    bbUpperRef.current = bbUpper;
    bbLowerRef.current = bbLower;

    // Seed Data Generation (Mock History)
    const now = Math.floor(Date.now() / 1000);
    const initialCandles = [];
    const initialVol = [];
    let price = 34500;
    
    // Generate 200 bars of history
    for (let i = 200; i > 0; i--) {
       const time = now - (i * 60);
       const volatility = 20;
       const open = price;
       const close = open + (Math.random() - 0.5) * volatility;
       const high = Math.max(open, close) + Math.random() * 5;
       const low = Math.min(open, close) - Math.random() * 5;
       price = close;

       initialCandles.push({ time, open, high, low, close });
       initialVol.push({ time, value: Math.random() * 100, color: close > open ? '#089981' : '#f23645' });
    }

    candleSeries.setData(initialCandles);
    volumeSeries.setData(initialVol);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update Chart on Tick
  useEffect(() => {
    const tick = data[symbol];
    if (!tick || !chartRef.current || !candleSeriesRef.current) return;

    // Debounce checks
    const now = Math.floor(Date.now() / 1000);
    // Simple logic: If more than 60s passed, new bar. Else update current bar.
    // Since tick.timestamp is high freq, we simulate 1-minute candles.
    
    const candleSeries = candleSeriesRef.current;
    
    // We are simulating live updates to the *current* candle for demo smoothness
    // In a real app, we'd aggregate ticks into bars.
    // Here we just append a new bar every few seconds to simulate movement for the "Vision" agent to see.
    
    // Only add a new bar if 2 seconds have passed (fast forward demo)
    if (now - lastTickTime > 2) {
       const lastBar = candleSeries.dataByIndex(candleSeries.data().length - 1) as any;
       if (lastBar) {
          const newTime = (lastBar.time as number) + 60;
          const open = lastBar.close;
          const close = tick.price;
          const high = Math.max(open, close);
          const low = Math.min(open, close);
          
          candleSeries.update({
             time: newTime as any,
             open, high, low, close
          });
          
          if (tick.indicators?.bb) {
             bbUpperRef.current?.update({ time: newTime as any, value: tick.indicators.bb.upper });
             bbLowerRef.current?.update({ time: newTime as any, value: tick.indicators.bb.lower });
          }
       }
       setLastTickTime(now);
    } else {
       // Update existing bar (realtime feel)
       const lastBar = candleSeries.dataByIndex(candleSeries.data().length - 1) as any;
       if (lastBar) {
         candleSeries.update({
             ...lastBar,
             close: tick.price,
             high: Math.max(lastBar.high, tick.price),
             low: Math.min(lastBar.low, tick.price)
         });
       }
    }

  }, [data, symbol, lastTickTime]);

  return (
    <div className="w-full h-full relative group">
       <div ref={chartContainerRef} className="w-full h-full" />
       
       {/* Symbol Watermark */}
       <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h1 className="text-4xl font-black text-[#2a2e39]/50 select-none tracking-tighter">{symbol}</h1>
          <div className="flex items-center gap-2 mt-1">
             <span className="bg-[#2962ff] text-white text-[10px] px-1.5 py-0.5 rounded font-bold">LIVE</span>
             <span className="text-[10px] text-gray-500 font-mono">1M • LIGHTWEIGHT CHARTS</span>
          </div>
       </div>

       {/* Indicators Legend */}
       <div className="absolute top-4 right-16 z-10 bg-[#1e222d]/80 backdrop-blur px-3 py-2 rounded border border-[#2a2e39] text-[10px] space-y-1">
          <div className="flex items-center gap-2 text-blue-400">
             <div className="w-2 h-0.5 bg-blue-400"></div>
             <span>BB (20, 2)</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <span>Volume</span>
          </div>
       </div>
    </div>
  );
};

export default NativeChart;
