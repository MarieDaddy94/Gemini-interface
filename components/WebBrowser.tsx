
import React, { useState, useRef, useEffect } from 'react';
import TradingViewWidget from './TradingViewWidget';

interface WebBrowserProps {
  onUrlChange?: (url: string) => void;
}

const WebBrowser: React.FC<WebBrowserProps> = ({ onUrlChange }) => {
  // Default to internal identifier for the widget to keep the initial load fast and clean
  const [url, setUrl] = useState('https://www.tradingview.com/');
  const [activeSrc, setActiveSrc] = useState<string | null>(null); // If null, render the Widget component
  const [isLoading, setIsLoading] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

  const handleNavigate = (nextUrl: string) => {
    setUrl(nextUrl);
    if (onUrlChange) {
      onUrlChange(nextUrl);
    }
  };

  const processUrl = (raw: string) => {
    let target = raw.trim();
    if (!target) return '';
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    
    // YouTube Watch -> Embed Conversion (Better performance than proxy)
    if (target.includes('youtube.com/watch') || target.includes('youtu.be/')) {
        try {
            const urlObj = new URL(target);
            const v = urlObj.searchParams.get('v');
            if (v) {
                return `https://www.youtube.com/embed/${v}?autoplay=1`;
            } else if (target.includes('youtu.be/')) {
                const id = target.split('youtu.be/')[1].split('?')[0];
                return `https://www.youtube.com/embed/${id}?autoplay=1`;
            }
        } catch (e) {
            console.error("Failed to parse YouTube URL", e);
        }
    }
    
    return target;
  };

  const handleGo = (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalUrl = processUrl(url);
    if (!finalUrl) return;

    setIsLoading(true);
    
    // If Proxy is enabled, wrap the URL
    if (useProxy && !finalUrl.includes(API_BASE) && !finalUrl.includes('youtube.com/embed')) {
        setActiveSrc(`${API_BASE}/api/proxy?url=${encodeURIComponent(finalUrl)}`);
    } else {
        setActiveSrc(finalUrl);
    }
    
    handleNavigate(finalUrl);
  };
  
  const handleShowWidget = () => {
    setActiveSrc(null);
    setUrl('https://www.tradingview.com/');
    setIsLoading(false);
  };

  const handleRefresh = () => {
    if (activeSrc) {
        setIsLoading(true);
        const current = activeSrc;
        setActiveSrc(''); 
        setTimeout(() => {
          setActiveSrc(current);
          setIsLoading(false); 
        }, 100);
    }
  };

  const handleOpenExternal = () => {
    if (activeSrc) {
        // Unwrap proxy if present for the external link
        let target = activeSrc;
        if (target.includes('/api/proxy?url=')) {
            target = decodeURIComponent(target.split('url=')[1]);
        }
        window.open(target, '_blank', 'noopener,noreferrer');
    } else {
        window.open('https://www.tradingview.com/', '_blank', 'noopener,noreferrer');
    }
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  // Re-run navigation if proxy toggle changes while viewing a page
  useEffect(() => {
     if (activeSrc) {
        handleGo();
     }
  }, [useProxy]);

  return (
    <div className="flex flex-col w-full h-full bg-[#131722]">
      {/* Browser Toolbar */}
      <div className="h-12 bg-[#1e222d] border-b border-[#2a2e39] flex items-center px-4 gap-3 shrink-0 z-10">
        <div className="flex gap-1">
           <button 
             onClick={handleShowWidget}
             className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${!activeSrc ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'}`}
             title="Use Internal Chart Widget"
           >
             Widget
           </button>
           <button 
             className="text-gray-400 hover:text-white p-2 rounded hover:bg-[#2a2e39] transition-colors" 
             title="Refresh Page" 
             onClick={handleRefresh}
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
           </button>
        </div>
        
        <form className="flex-1 flex gap-2" onSubmit={handleGo}>
          <div className="relative w-full flex items-center group">
             <div className="absolute left-3 text-gray-500 group-focus-within:text-[#2962ff] transition-colors">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
             </div>
             <input 
               type="text"
               value={url}
               onChange={(e) => setUrl(e.target.value)}
               className="w-full bg-[#131722] text-[#d1d4dc] text-sm py-2 pl-9 pr-4 rounded-full border border-[#2a2e39] focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff] transition-all placeholder-gray-600"
               placeholder="Enter URL (e.g. youtube.com)"
             />
          </div>
          
          <button 
             type="button"
             onClick={() => setUseProxy(!useProxy)}
             className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                 useProxy 
                   ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' 
                   : 'bg-[#2a2e39] text-gray-500 border-transparent hover:text-gray-300'
             }`}
             title={useProxy ? "Proxy Enabled (Bypasses Restrictions)" : "Proxy Disabled"}
          >
             {useProxy ? 'Proxy ON' : 'Proxy OFF'}
          </button>
          
          <button 
            onClick={handleGo}
            className="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-4 py-2 rounded-full text-xs font-medium transition-colors shadow-sm"
          >
            Go
          </button>
        </form>

        <div className="w-[1px] h-6 bg-[#2a2e39] mx-1"></div>

        <button 
          onClick={handleOpenExternal}
          className="text-gray-400 hover:text-white p-2 rounded hover:bg-[#2a2e39] transition-colors"
          title="Open in New Tab"
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
            // Strict sandbox allows most browsing but blocks top-level navigation hijacks
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation allow-downloads"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        )}
      </div>
      
      {/* Footer Info Bar */}
      {activeSrc && (
        <div className="bg-[#1e222d] border-t border-[#2a2e39] flex items-center justify-between px-4 py-2 shrink-0">
           <div className="flex items-center gap-2">
             <div className="bg-blue-500/10 p-1 rounded">
               <svg className="text-blue-500" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
             </div>
             <span className="text-[10px] text-gray-400">
               If you see a blank screen, try enabling <strong>Proxy Mode</strong> in the toolbar above, or use "Open in New Tab".
             </span>
           </div>
        </div>
      )}
    </div>
  );
};

export default WebBrowser;
