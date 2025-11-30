import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, AnalystPersona, SessionSummary } from '../types';
import { ANALYST_AVATARS } from '../constants';
import { getAnalystInsights, getSessionSummary } from '../services/geminiService';
import { logSessionPlaybook, fetchPlaybookLogs } from '../services/sessionLogService';
import type { PlaybookLogPayload } from '../services/sessionLogService';

interface ChatOverlayProps {
  chartContext: string;
  isBrokerConnected?: boolean;
}

const SYMBOL_PRESETS = ['Auto', 'US30', 'NAS100', 'XAUUSD', 'BTCUSD'];

type ActiveTab = 'chat' | 'history';

const ChatOverlay: React.FC<ChatOverlayProps> = ({ chartContext, isBrokerConnected }) => {
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

  // Session Playbook state
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [liveSessionSummary, setLiveSessionSummary] = useState<SessionSummary | null>(null);
  const [isUpdatingSummary, setIsUpdatingSummary] = useState(false);

  // Replay state
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySourceId, setReplaySourceId] = useState<string | null>(null);
  const [replayTimestamp, setReplayTimestamp] = useState<string | null>(null);

  // Symbol focus state
  const [focusSymbol, setFocusSymbol] = useState<string>('Auto');

  // History tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [historyLogs, setHistoryLogs] = useState<PlaybookLogPayload[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
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

  // Initial session summary off the welcome messages + current context
  useEffect(() => {
    const initSummary = async () => {
      try {
        setIsUpdatingSummary(true);
        const summary = await getSessionSummary(chartContext, messages, undefined, focusSymbol);
        setSessionSummary(summary);
        setLiveSessionSummary(summary);
        setIsReplaying(false);
        setReplaySourceId(null);
        setReplayTimestamp(null);
        await logSessionPlaybook(summary, {
          focusSymbol,
          chartContext,
          history: messages
        });
      } catch (err) {
        console.error("Failed to generate initial session summary", err);
      } finally {
        setIsUpdatingSummary(false);
      }
    };
    initSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // When the symbol focus changes, recompute the Playbook for that symbol and refresh history if needed
  useEffect(() => {
    const refreshForSymbol = async () => {
      try {
        setIsUpdatingSummary(true);
        const summary = await getSessionSummary(chartContext, messages, undefined, focusSymbol);
        setSessionSummary(summary);
        setLiveSessionSummary(summary);
        setIsReplaying(false);
        setReplaySourceId(null);
        setReplayTimestamp(null);
        await logSessionPlaybook(summary, {
          focusSymbol,
          chartContext,
          history: messages
        });
      } catch (err) {
        console.error("Failed to refresh session summary for new symbol", err);
      } finally {
        setIsUpdatingSummary(false);
      }
    };

    refreshForSymbol();

    // If user is on history, reload filtered logs for the new symbol
    if (activeTab === 'history') {
      void loadHistoryLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSymbol]);

  // Load all logs (filtered by focusSymbol) for History tab
  const loadHistoryLogs = async () => {
    try {
      setIsLoadingHistory(true);
      const allLogs = await fetchPlaybookLogs();

      // Filter by focus symbol unless Auto
      const filtered =
        focusSymbol === 'Auto'
          ? allLogs
          : allLogs.filter((entry) => entry.focusSymbol === focusSymbol);

      // Sort newest first
      const sorted = filtered.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setHistoryLogs(sorted);
    } catch (err) {
      console.error('Failed to load playbook history:', err);
      setHistoryLogs([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // When switching to History tab, load logs
  useEffect(() => {
    if (activeTab === 'history') {
      void loadHistoryLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleVision = async () => {
    if (isVisionActive) {
      // Stop sharing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        (videoRef.current as HTMLVideoElement).srcObject = null;
      }
      setIsVisionActive(false);
    } else {
      // Start sharing
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            displaySurface: 'browser',
          }, 
          audio: false 
        });
        
        streamRef.current = stream;
        
        // Handle user stopping stream via browser UI
        stream.getVideoTracks()[0].onended = () => {
          setIsVisionActive(false);
          streamRef.current = null;
        };

        if (videoRef.current) {
          (videoRef.current as HTMLVideoElement).srcObject = stream;
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

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    let screenshot: string | undefined = undefined;
    if (isVisionActive) {
      screenshot = captureFrame();
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      text: inputValue,
      timestamp: new Date(),
      isUser: true,
      attachment: screenshot
    };

    const historyBefore = [...messages];

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsThinking(true);

    const historyForModel: ChatMessage[] = [...historyBefore, userMsg];

    try {
      const insights = await getAnalystInsights(
        userMsg.text,
        chartContext,
        screenshot,
        historyForModel,
        focusSymbol
      );
      
      const newMessages: ChatMessage[] = insights.map((insight, index) => ({
        id: (Date.now() + index + 1).toString(),
        sender: insight.analystName,
        text: insight.message,
        timestamp: new Date(),
        isUser: false
      }));

      const historyWithAI: ChatMessage[] = [...historyForModel, ...newMessages];

      setMessages(prev => [...prev, ...newMessages]);

      // Update the Session Playbook based on full history, then log it
      try {
        setIsUpdatingSummary(true);
        const summary = await getSessionSummary(chartContext, historyWithAI, screenshot, focusSymbol);
        setSessionSummary(summary);
        setLiveSessionSummary(summary);
        setIsReplaying(false);
        setReplaySourceId(null);
        setReplayTimestamp(null);
        await logSessionPlaybook(summary, {
          focusSymbol,
          chartContext,
          history: historyWithAI
        });
      } catch (err) {
        console.error("Failed to update session summary", err);
      } finally {
        setIsUpdatingSummary(false);
      }

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

  // Load an old playbook into replay mode
  const handleLoadFromHistory = (entry: PlaybookLogPayload) => {
    setSessionSummary(entry.sessionSummary);
    setIsReplaying(true);
    setReplaySourceId(entry.id);
    setReplayTimestamp(entry.timestamp);
  };

  // Exit replay mode and go back to the last live summary
  const handleBackToLive = () => {
    if (!liveSessionSummary) {
      setIsReplaying(false);
      setReplaySourceId(null);
      setReplayTimestamp(null);
      return;
    }
    setSessionSummary(liveSessionSummary);
    setIsReplaying(false);
    setReplaySourceId(null);
    setReplayTimestamp(null);
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
            </h2>
            <p className="text-[10px] text-gray-400 font-medium">
              {isReplaying ? 'Replay Mode • Static Playbook' : `Gemini 2.5 Flash • ${isBrokerConnected ? 'TradeLocker Active' : 'Market Watch Mode'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Small tabs indicator in header */}
          <div className="flex bg-gray-100 rounded-full p-0.5 text-[10px]">
            <button
              onClick={() => setActiveTab('chat')}
              className={
                'px-2 py-0.5 rounded-full font-semibold transition-colors ' +
                (activeTab === 'chat'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800')
              }
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={
                'px-2 py-0.5 rounded-full font-semibold transition-colors ' +
                (activeTab === 'history'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800')
              }
            >
              History
            </button>
          </div>
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

      {/* Messages + Session Playbook / History */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#f8f9fa] space-y-5 scrollbar-thin">
        {/* Session Playbook Card */}
        <div className="bg-white border border-[#d0e2ff] rounded-2xl p-3 shadow-sm sticky top-0 z-10">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff] animate-pulse"></span>
              <span className="text-[11px] font-bold tracking-wide text-[#2962ff] uppercase">
                Session Playbook
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isReplaying && (
                <button
                  onClick={handleBackToLive}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[#eef2ff] text-[#2949ff] border border-[#c3d3ff] hover:bg-[#e0e7ff] transition-colors flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/><path d="M20 19V5"/></svg>
                  <span>Back to Live</span>
                </button>
              )}
              {isUpdatingSummary && (
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span>Updating</span>
                  <span className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></span>
                </div>
              )}
            </div>
          </div>

          {/* Symbol focus selector */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500">Symbol focus:</span>
            <div className="flex items-center gap-1">
              {SYMBOL_PRESETS.map((sym) => {
                const active = focusSymbol === sym;
                return (
                  <button
                    key={sym}
                    onClick={() => setFocusSymbol(sym)}
                    className={
                      "px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors " +
                      (active
                        ? "bg-[#2962ff] text-white border-[#2962ff]"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-[#eef2ff]")
                    }
                  >
                    {sym}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Replay timestamp banner */}
          {isReplaying && replayTimestamp && (
            <div className="mb-2 px-2 py-1 rounded-lg bg-[#fff7ed] border border-[#fed7aa] flex items-center justify-between">
              <span className="text-[10px] text-[#9a3412]">
                Replaying snapshot from{" "}
                {new Date(replayTimestamp).toLocaleString([], {
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span className="text-[9px] text-[#c2410c] font-semibold">
                Frozen • Won’t auto-update
              </span>
            </div>
          )}

          {sessionSummary ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-800 font-semibold">
                {sessionSummary.headlineBias}
              </p>
              {sessionSummary.keyLevels && (
                <p className="text-[11px] text-gray-700">
                  <span className="font-semibold">Key Levels:</span> {sessionSummary.keyLevels}
                </p>
              )}

              {/* Scalp / Swing lanes */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {/* Scalp Lane */}
                <div className="bg-[#f4f6ff] border border-[#c3d3ff] rounded-xl p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#2949ff]">
                      Scalp Lane
                    </span>
                    <span className="text-[10px] text-[#2949ff] font-semibold">
                      {sessionSummary.scalpPlan.rr}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-800 mb-1">
                    <span className="font-semibold">Bias:</span> {sessionSummary.scalpPlan.bias}
                  </p>
                  <p className="text-[10px] text-gray-700 mb-1">
                    <span className="font-semibold">Entry:</span> {sessionSummary.scalpPlan.entryPlan}
                  </p>
                  <p className="text-[10px] text-gray-700 mb-1">
                    <span className="font-semibold">Invalid:</span> {sessionSummary.scalpPlan.invalidation}
                  </p>
                  <p className="text-[10px] text-gray-700">
                    <span className="font-semibold">Targets:</span> {sessionSummary.scalpPlan.targets}
                  </p>
                </div>

                {/* Swing Lane */}
                <div className="bg-[#f3fbf4] border border-[#b6e7c2] rounded-xl p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#22723a]">
                      Swing Lane
                    </span>
                    <span className="text-[10px] text-[#22723a] font-semibold">
                      {sessionSummary.swingPlan.rr}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-800 mb-1">
                    <span className="font-semibold">Bias:</span> {sessionSummary.swingPlan.bias}
                  </p>
                  <p className="text-[10px] text-gray-700 mb-1">
                    <span className="font-semibold">Entry:</span> {sessionSummary.swingPlan.entryPlan}
                  </p>
                  <p className="text-[10px] text-gray-700 mb-1">
                    <span className="font-semibold">Invalid:</span> {sessionSummary.swingPlan.invalidation}
                  </p>
                  <p className="text-[10px] text-gray-700">
                    <span className="font-semibold">Targets:</span> {sessionSummary.swingPlan.targets}
                  </p>
                </div>
              </div>

              {sessionSummary.riskNotes && (
                <p className="text-[10px] text-gray-700 mt-2">
                  <span className="font-semibold">Risk Notes:</span> {sessionSummary.riskNotes}
                </p>
              )}
            </div>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-2.5 bg-gray-200/80 rounded w-3/4" />
              <div className="h-2 bg-gray-200/80 rounded w-full" />
              <div className="h-2 bg-gray-200/80 rounded w-5/6" />
            </div>
          )}
        </div>

        {/* MAIN BODY: Chat or History */}
        {activeTab === 'chat' ? (
          <>
            {/* Chat messages */}
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
                      <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1 uppercase tracking-wider">{msg.sender}</span>
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
                          <div className="bg-black/20 text-[10px] p-1 text-center text-white/90 font-medium">Screen Capture</div>
                        </div>
                      )}
                      {msg.text}
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
                  <span className="text-xs text-gray-500">Analysing broker data</span>
                  <span className="flex space-x-1 ml-1">
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* HISTORY VIEW */}
            <div className="flex items-center justify-between mt-1 mb-2">
              <p className="text-[11px] text-gray-500">
                Viewing saved playbooks {focusSymbol !== 'Auto' ? `for ${focusSymbol}` : '(all symbols)'}
              </p>
              <button
                onClick={loadHistoryLogs}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 8"/></svg>
                <span>Refresh</span>
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="space-y-3">
                <div className="bg-white rounded-xl p-3 border border-gray-200 animate-pulse">
                  <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-2 bg-gray-200 rounded w-3/4 mb-1" />
                  <div className="h-2 bg-gray-200 rounded w-2/3" />
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-200 animate-pulse">
                  <div className="h-2.5 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-2 bg-gray-200 rounded w-4/5 mb-1" />
                  <div className="h-2 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ) : historyLogs.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-[11px] text-gray-500">
                No playbooks saved yet for this view. 
                <br />
                Start asking questions and the desk will auto-journal your sessions.
              </div>
            ) : (
              <div className="space-y-3">
                {historyLogs.map((entry) => {
                  const ts = new Date(entry.timestamp);
                  const timeStr = ts.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const dateStr = ts.toLocaleDateString([], {
                    month: 'short',
                    day: '2-digit'
                  });

                  const isActiveReplay = isReplaying && replaySourceId === entry.id;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleLoadFromHistory(entry)}
                      className={
                        "w-full text-left bg-white rounded-xl p-3 border shadow-sm transition-all " +
                        (isActiveReplay
                          ? "border-[#2962ff] ring-1 ring-[#2962ff]/40"
                          : "border-gray-200 hover:border-[#2962ff]/60 hover:shadow-md")
                      }
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold border " +
                            (isActiveReplay
                              ? "bg-[#eef2ff] text-[#2949ff] border-[#c3d3ff]"
                              : "bg-[#f9fafb] text-gray-700 border-gray-200")
                          }>
                            {entry.focusSymbol || 'Auto'}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {dateStr} • {timeStr}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          R:R S {entry.sessionSummary.scalpPlan.rr} | W {entry.sessionSummary.swingPlan.rr}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-800 font-semibold mb-1">
                        {entry.sessionSummary.headlineBias}
                      </p>
                      <p className="text-[10px] text-gray-700 mb-1">
                        <span className="font-semibold">Scalp Bias:</span>{' '}
                        {entry.sessionSummary.scalpPlan.bias}
                      </p>
                      <p className="text-[10px] text-gray-700 mb-1">
                        <span className="font-semibold">Swing Bias:</span>{' '}
                        {entry.sessionSummary.swingPlan.bias}
                      </p>
                      {entry.sessionSummary.riskNotes && (
                        <p className="text-[10px] text-gray-600">
                          <span className="font-semibold">Risk:</span>{' '}
                          {entry.sessionSummary.riskNotes}
                        </p>
                      )}
                      {isActiveReplay && (
                        <p className="mt-1 text-[10px] text-[#2962ff] font-semibold">
                          Currently loaded in desk
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
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
                if (activeTab === 'chat') {
                  handleSendMessage();
                }
              }
            }}
            placeholder={
              activeTab === 'history'
                ? "Switch to Chat to ask new questions..."
                : isVisionActive
                ? "Ask about the visible chart..."
                : "Ask the analysts about the market..."
            }
            className={
              "w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#2962ff]/50 focus:bg-white transition-all text-gray-800 placeholder-gray-400 resize-none h-12 max-h-32 " +
              (activeTab === 'history' ? 'opacity-70 cursor-not-allowed' : '')
            }
            readOnly={activeTab === 'history'}
          />
          <button 
            onClick={activeTab === 'chat' ? handleSendMessage : undefined}
            disabled={activeTab === 'history' || !inputValue.trim() || isThinking}
            className="absolute right-2 top-2 p-1.5 bg-[#2962ff] text-white rounded-xl hover:bg-[#1e53e5] disabled:opacity-50 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div className="mt-2 flex justify-between items-center px-1">
            <p className="text-[10px] text-gray-400 flex items-center gap-1">
              {isVisionActive ? (
                 <><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span> Vision Active: Analyzing Screen</>
              ) : (
                 "AI agents connected to broker feed."
              )}
            </p>
            <span className="text-[10px] text-[#2962ff] font-medium cursor-pointer hover:underline">Disclaimer</span>
        </div>
      </div>
    </div>
  );
};

export default ChatOverlay;