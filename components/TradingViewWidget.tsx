import React, { useEffect, useRef, memo } from 'react';

declare global {
  interface Window {
    TradingView: any;
  }
}

const TradingViewWidget: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if script is already present to avoid duplicates
    if (document.getElementById('tradingview-widget-script')) return;

    const script = document.createElement('script');
    script.id = 'tradingview-widget-script';
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (window.TradingView) {
        new window.TradingView.widget({
          autosize: true,
          symbol: "BINANCE:BTCUSDT",
          interval: "60",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: "tradingview_widget",
          hide_side_toolbar: false,
          studies: [
            "MASimple@tv-basicstudies",
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies"
          ]
        });
      }
    };

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }
  }, []);

  return (
    <div className="tradingview-widget-container w-full h-full relative bg-[#131722]" ref={containerRef}>
      <div id="tradingview_widget" className="w-full h-full" />
    </div>
  );
};

export default memo(TradingViewWidget);