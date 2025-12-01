
import React, { useEffect, useRef, memo } from 'react';

declare global {
  interface Window {
    TradingView: any;
  }
}

const TradingViewWidget: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Function to initialize widget
    const initWidget = () => {
      if (window.TradingView && containerRef.current) {
         // Clear previous content if any (though usually clean on mount)
         containerRef.current.innerHTML = ''; 
         const div = document.createElement('div');
         div.id = 'tradingview_widget';
         div.className = 'w-full h-full';
         containerRef.current.appendChild(div);

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

    // Check if script is already present
    if (!document.getElementById('tradingview-widget-script')) {
      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.body.appendChild(script);
    } else {
      // Script exists, just init
      initWidget();
    }
  }, []);

  return (
    <div className="tradingview-widget-container w-full h-full relative bg-[#131722]" ref={containerRef}>
      {/* Widget will be injected here */}
    </div>
  );
};

export default memo(TradingViewWidget);
