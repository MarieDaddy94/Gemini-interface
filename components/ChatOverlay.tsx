import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, AnalystPersona } from '../types';
import { ANALYST_AVATARS } from '../constants';
import { getAnalystInsights, getCoachFeedback, getSessionSummary } from '../services/geminiService';
import { queryJournalByTagAndSymbol } from '../services/journalService';
import { logSessionPlaybook } from '../services/playbookService';

interface ChatOverlayProps {
  chartContext: string;
  isBrokerConnected?: boolean;
  sessionId: string;
  autoFocusSymbol?: string;
}

const ChatOverlay: React.FC<ChatOverlayProps> = ({ 
  chartContext, 
  isBrokerConnected, 
  sessionId,
  autoFocusSymbol 
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: AnalystPersona.QUANT_BOT,
      text: 'Analyzing real-time market data. Volatility on BTC/USD is increasing.',
      timestamp: new Date(),
      isUser: false
    },
    {
      id: 'welcome-2',
      sender: AnalystPersona.TREND_MASTER,
      text: 'I am detecting a potential breakout pattern forming on the hourly timeframe.',
      timestamp: new Date(),
      isUser: false
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSavingPlaybook, setIsSavingPlaybook] = useState(false);
  
  // Vision / Screen Share State
  const [isVisionActive, setIsVisionActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleVision = async () => {
    if (isVisionActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsVisionActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            displaySurface: 'browser',
          }, 
          audio: false 
        });
        
        streamRef.current = stream;
        
        stream.getVideoTracks()[0].onended = () => {
          setIsVisionActive(false);
          streamRef.current = null;
        };

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsVisionActive(true);
      } catch (err: any) {
        console.error("Error starting screen capture:", err);
        
        let errorMessage = "Could not start screen sharing.";
        if (err.message && err.message.includes("permissions policy")) {
          errorMessage = "Screen sharing is blocked by the browser environment's permission policy.";
        } else if (err.name === 'NotAllowedError') {
          errorMessage = "Screen sharing permission was denied.";
        }

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender: "System",
          text: `⚠️ ${errorMessage} Please verify permissions.`,
          timestamp: new Date(),
          isUser: false
        }]);

        setIsVisionActive(false);
      }
    }
  };

  const captureFrame = (): string | undefined => {
    if (!videoRef.current || !isVisionActive) return undefined;
    
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) return undefined;

    const scale = 0.5;
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
  };

  // -----------------------
  // Coach command handler
  // -----------------------
  const handleCoachCommand = async (commandText: string) => {
    const parts = commandText.trim().split(/\s+/);
    const tag = parts[1];
    const symbol = parts[2];

    if (!tag) {
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now().toString()}-coach-usage`,
          sender: "System",
          text: 'Usage: /coach <TagName> [Symbol]. Example: /coach LondonOpen US30',
          timestamp: new Date(),
          isUser: false
        }
      ]);
      return;
    }

    setIsThinking(true);

    try {
      const result = await queryJournalByTagAndSymbol(sessionId, tag, symbol);

      if (!result.tagSummary) {
        setMessages(prev => [
          ...prev,
          {
            id: `${Date.now().toString()}-coach-none`,
            sender: AnalystPersona.QUANT_BOT,
            text: `I don't see any journal entries tagged "${tag}". Start logging trades with that tag first, then I'll coach you on it.`,
            timestamp: new Date(),
            isUser: false
          }
        ]);
        return;
      }

      const coachContext = {
        tag,
        symbol: symbol || null,
        tagSummary: result.tagSummary,
        perSymbol: result.perSymbol,
        totalEntries: result.entries.length,
        sampleEntries: result.entries.slice(0, 30).map(e => ({
          focusSymbol: e.focusSymbol,
          bias: e.bias,
          entryType: e.entryType,
          outcome: e.outcome,
          confidence: e.confidence,
          tags: e.tags,
          finalPnl: e.finalPnl ?? null
        }))
      };

      const coachText = await getCoachFeedback(coachContext);

      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now().toString()}-coach`,
          sender: "CoachBot",
          text: coachText,
          timestamp: new Date(),
          isUser: false
        }
      ]);
    } catch (err) {
      console.error('Coach command failed', err);
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now().toString()}-coach-error`,
          sender: AnalystPersona.QUANT_BOT,
          text: 'Journal coach had an issue reading your stats. Try again after logging a few trades.',
          timestamp: new Date(),
          isUser: false
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // -----------------------
  // Save Playbook handler
  // -----------------------
  const handleSavePlaybook = async () => {
    if (isSavingPlaybook) return;

    setIsSavingPlaybook(true);
    try {
      const summary = await getSessionSummary(
        chartContext,
        messages.map((m) => ({
          sender: typeof m.sender === 'string' ? m.sender : String(m.sender),
          text: m.text,
          isUser: m.isUser
        }))
      );

      const focusSymbol =
        autoFocusSymbol && autoFocusSymbol !== 'Auto'
          ? autoFocusSymbol
          : 'Unknown';

      await logSessionPlaybook(summary, {
        focusSymbol,
        chartContext,
        history: messages
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now().toString()}-playbook-saved`,
          sender: "System",
          text: '✅ Session playbook saved. You can review it later in the Analysis tab.',
          timestamp: new Date(),
          isUser: false
        }
      ]);
    } catch (err) {
      console.error('Save playbook failed', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now().toString()}-playbook-error`,
          sender: "System",
          text: '⚠️ Could not save playbook. Check your backend and try again.',
          timestamp: new Date(),
          isUser: false
        }
      ]);
    } finally {
      setIsSavingPlaybook(false);
    }
  };

  // -----------------------
  // Send message handler
  // -----------------------
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    let screenshot: string | undefined = undefined;
    if (isVisionActive) {
      screenshot = captureFrame();
    }

    const userText = inputValue;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      text: userText,
      timestamp: new Date(),
      isUser: true,
      attachment: screenshot
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    const trimmed = userText.trim();

    if (trimmed.toLowerCase().startsWith('/coach')) {
      await handleCoachCommand(trimmed);
      return;
    }

    setIsThinking(true);

    try {
      const insights = await getAnalystInsights(userMsg.text, chartContext, screenshot);
      
      const newMessages = insights.map((insight, index) => ({
        id: (Date.now() + index + 1).toString(),
        sender: insight.analystName,
        text: insight.message,
        timestamp: new Date(),
        isUser: false
      }));

      setMessages(prev => [...prev, ...newMessages]);
    } catch (e) {
      console.error("Failed to get insights", e);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: AnalystPersona.QUANT_BOT,
        text: "Connection to analysis engine disrupted. Please try again.",
        timestamp: new Date(),
        isUser: false
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Collapsed State
  if (!isOpen) {
    return (
      <div className="w-12 h-full bg-[#1e222d] border-l border-[#2a2e39] flex flex-col items-center py-4 gap-4 z-30 shrink-0">
        <button 
          onClick={() => setIsOpen(true)}
          className="w-8 h-8 rounded-lg bg-[#2962ff] text-white flex items-center justify-center hover:bg-[#1e53e5] transition-colors"
          title="Open Analyst Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        {isVisionActive && (
           <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Vision Active"></div>
        )}
        {isBrokerConnected && (
           <div className="w-2 h-2 bg-green-500 rounded-full" title="Broker Connected"></div>
        )}
        <div className="flex-1 w-[1px] bg-[#2a2e39]/50"></div>
        <div className="writing-vertical-rl text-xs font-bold text-gray-400 tracking-wider uppercase rotate-180">
          AI Analysts Active
        </div>
      </div>
    );
  }

  // Expanded Sidebar State
  return (
    <div className="w-[380px] h-full bg-white flex flex-col border-l border-[#2a2e39] shadow-xl relative z-30 animate-fade-in-right shrink-0">
      {/* Hidden Video Element for Stream */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-100 flex justify-between items-center bg-white shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div>
            <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              AI Analysts' Corner
              {isBrokerConnected && (
                <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold border border-green-200">LIVE FEED</span>
              )}
              {autoFocusSymbol && autoFocusSymbol !== 'Auto' && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200">
                  FOCUS: {autoFocusSymbol}
                </span>
              )}
            </h2>
            <p className="text-[10px] text-gray-400 font-medium">
              Gemini 2.5 Flash • {isBrokerConnected ? 'TradeLocker Active' : 'Market Watch Mode'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleSavePlaybook}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
              isSavingPlaybook
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
            title="Save Session Playbook"
          >
            {isSavingPlaybook ? (
              <>
                <span className="w-2 h-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span>Saving</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11l3 3v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Save</span>
              </>
            )}
          </button>
          <button 
            onClick={toggleVision}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors border ${
              isVisionActive 
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
            title={isVisionActive ? "Stop Watching Screen" : "Watch Screen (Select Tab)"}
          >
             {isVisionActive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span>Watching</span>
                </>
             ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  <span>Vision</span>
                </>
             )}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#f8f9fa] space-y-5 scrollbar-thin">
        {messages.map((msg) => {
          const isUser = msg.isUser;
          let avatar = ANALYST_AVATARS[AnalystPersona.USER];
          let borderColor = 'border-gray-200';
          
          if (!isUser) {
             if (msg.sender === AnalystPersona.QUANT_BOT) {
                 avatar = ANALYST_AVATARS[AnalystPersona.QUANT_BOT];
                 borderColor = 'border-blue-200';
             } else if (msg.sender === AnalystPersona.TREND_MASTER) {
                 avatar = ANALYST_AVATARS[AnalystPersona.TREND_MASTER];
                 borderColor = 'border-purple-200';
             } else if (msg.sender === "System") {
                 avatar = "⚠️";
                 borderColor = 'border-red-200 bg-red-50';
             } else if (msg.sender === "CoachBot") {
                 avatar = "🎓";
                 borderColor = 'border-indigo-200 bg-indigo-50';
             } else {
                 avatar = ANALYST_AVATARS[AnalystPersona.PATTERN_GPT];
                 borderColor = 'border-green-200';
             }
          }

          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm flex-shrink-0 ${isUser ? 'bg-[#131722] text-white' : 'bg-white border border-gray-100'}`}>
                {avatar}
              </div>
              
              <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                 {!isUser && (
                   <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1 uppercase tracking-wider">
                     {msg.sender}
                   </span>
                 )}
                 <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                   isUser 
                     ? 'bg-[#2962ff] text-white rounded-tr-none' 
                     : `bg-white text-gray-700 border ${borderColor} rounded-tl-none`
                 }`}>
                   {msg.attachment && (
                     <div className="mb-2 rounded overflow-hidden border border-white/20">
                       <img 
                          src={`data:image/jpeg;base64,${msg.attachment}`} 
                          alt="Chart Screenshot" 
                          className="w-full h-auto max-h-32 object-cover opacity-90 hover:opacity-100 transition-opacity"
                       />
                       <div className="bg-black/20 text-[10px] p-1 text-center text-white/90 font-medium">
                         Screen Capture
                       </div>
                     </div>
                   )}
                   <div className="whitespace-pre-wrap">{msg.text}</div>
                 </div>
                 <span className="text-[9px] text-gray-300 mt-1 mx-1">
                   {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </span>
              </div>
            </div>
          );
        })}
        {isThinking && (
          <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center">
               <span className="animate-spin">⏳</span>
             </div>
             <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex items-center gap-1">
                <span className="text-xs text-gray-500">
                  Analysing broker / journal data
                </span>
                <span className="flex space-x-1 ml-1">
                  <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100 shrink-0">
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              isVisionActive
                ? "Ask about the visible chart... (or /coach LondonOpen US30)"
                : "Ask the analysts... (or /coach LondonOpen US30)"
            }
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#2962ff]/50 focus:bg-white transition-all text-gray-800 placeholder-gray-400 resize-none h-12 max-h-32"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isThinking}
            className="absolute right-2 top-2 p-1.5 bg-[#2962ff] text-white rounded-xl hover:bg-[#1e53e5] disabled:opacity-50 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div className="mt-2 flex justify-between items-center px-1">
            <p className="text-[10px] text-gray-400 flex items-center gap-1">
              {isVisionActive ? (
                 <>
                   <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                   Vision Active: Analyzing Screen
                 </>
              ) : (
                 <>
                   <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                   Tip: use <span className="font-mono text-[9px] bg-gray-100 px-1 rounded border border-gray-200">/coach LondonOpen US30</span> to get coaching from your journal stats.
                 </>
              )}
            </p>
            <span className="text-[10px] text-[#2962ff] font-medium cursor-pointer hover:underline">
              Disclaimer
            </span>
        </div>
      </div>
    </div>
  );
};

export default ChatOverlay;