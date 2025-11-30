import React, { useState, useRef } from 'react';
import TradingViewWidget from './TradingViewWidget';

const WebBrowser: React.FC = () => {
  // Default to internal identifier for the widget to keep the initial load fast and clean
  const [url, setUrl] = useState('https://www.tradingview.com/chart/');
  const [activeSrc, setActiveSrc] = useState<string | null>(null); // If null, render the Widget component
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleGo = (e?: React.FormEvent) => {
    e?.preventDefault();
    let target = url.trim();
    if (!target) return;
    
    // Auto-prepend https if missing
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    
    setIsLoading(true);

    // Check if user wants to go back to "home" (TradingView Widget)
    if (target.includes('tradingview.com/chart') && !target.includes('?')) {
        // Simple heuristic to revert to widget for better performance/UX on default URL
        setActiveSrc(null);
        setIsLoading(false);
    } else {
        setActiveSrc(target);
    }
    setUrl(target);
  };
  
  const handleHome = () => {
    setActiveSrc(null);
    setUrl('https://www.tradingview.com/chart/');
    setIsLoading(false);
  };

  const handleRefresh = () => {
    if (activeSrc) {
        setIsLoading(true);
        // Force iframe reload
        const current = activeSrc;
        setActiveSrc(''); 
        setTimeout(() => setActiveSrc(current), 50);
    }
  };

  const handleOpenExternal = () => {
    if (activeSrc) {
      window.open(activeSrc, '_blank', 'noopener,noreferrer');
    } else {
      window.open('https://www.tradingview.com/chart/', '_blank', 'noopener,noreferrer');
    }
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#131722]">
      {/* Browser Toolbar */}
      <div className="h-12 bg-[#1e222d] border-b border-[#2a2e39] flex items-center px-4 gap-3 shrink-0 z-10">
        <div className="flex gap-1">
           <button 
             className="text-gray-400 hover:text-white p-2 rounded hover:bg-[#2a2e39] transition-colors" 
             title="Home (Default Chart)" 
             onClick={handleHome}
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
           </button>
           <button 
             className="text-gray-400 hover:text-white p-2 rounded hover:bg-[#2a2e39] transition-colors" 
             title="Refresh Page" 
             onClick={handleRefresh}
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
           </button>
        </div>
        
        <form className="flex-1 flex" onSubmit={handleGo}>
          <div className="relative w-full flex items-center group">
             <div className="absolute left-3 text-gray-500 group-focus-within:text-[#2962ff] transition-colors">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
             </div>
             <input 
               type="text"
               value={url}
               onChange={(e) => setUrl(e.target.value)}
               className="w-full bg-[#131722] text-[#d1d4dc] text-sm py-2 pl-9 pr-4 rounded-full border border-[#2a2e39] focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff] transition-all placeholder-gray-600"
               placeholder="Enter website URL (e.g. https://wikipedia.org)"
             />
          </div>
        </form>

        <button 
          onClick={handleGo}
          className="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-4 py-2 rounded-full text-xs font-medium transition-colors shadow-sm"
        >
          Go
        </button>

        <div className="w-[1px] h-6 bg-[#2a2e39] mx-1"></div>

        <button 
          onClick={handleOpenExternal}
          className="text-gray-400 hover:text-white p-2 rounded hover:bg-[#2a2e39] transition-colors"
          title="Open in New Tab (Fix for blocked sites)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>

      {/* Browser Content Area */}
      <div className="flex-1 relative bg-[#000000] overflow-hidden">
        {isLoading && activeSrc && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="bg-[#1e222d] px-4 py-2 rounded-lg shadow-lg border border-[#2a2e39] flex items-center gap-2">
               <span className="w-4 h-4 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin"></span>
               <span className="text-xs text-gray-300">Loading...</span>
            </div>
          </div>
        )}

        {!activeSrc ? (
          /* Render the Internal Widget Component */
          <TradingViewWidget />
        ) : (
          /* Render External Iframe */
          <iframe 
            ref={iframeRef}
            src={activeSrc}
            className="w-full h-full border-0 bg-white"
            title="Web Browser"
            onLoad={handleIframeLoad}
            // Strict sandbox with necessary permissions
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation allow-top-navigation-by-user-activation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        )}
      </div>
      
      {/* Footer Info Bar */}
      {activeSrc && (
        <div className="bg-[#1e222d] border-t border-[#2a2e39] flex items-center justify-between px-4 py-2 shrink-0">
           <div className="flex items-center gap-2">
             <div className="bg-yellow-500/10 p-1 rounded">
               <svg className="text-yellow-500" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
             </div>
             <span className="text-[10px] text-gray-400">
               If the screen is white or says "Refused to connect", the website blocks embedding.
             </span>
           </div>
           <button 
             onClick={handleOpenExternal}
             className="text-[10px] bg-[#2a2e39] hover:bg-[#363a45] text-white px-2 py-1 rounded transition-colors"
           >
           </button>
        </div>
      )}
    </div>
  );
};

export default WebBrowser;