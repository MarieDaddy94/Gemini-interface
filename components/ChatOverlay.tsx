
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { fetchAgentInsights, fetchAgentDebrief, AgentId, AgentJournalDraft, AgentInsight, TradeMeta, ToolCall } from '../services/agentApi';
import { useJournal } from '../context/JournalContext';
import { useAgentConfig } from '../context/AgentConfigContext';

// UI Metadata for styling specific agents
const AGENT_UI_META: Record<string, { avatar: string, color: string }> = {
  quant_bot: { avatar: '🤖', color: 'bg-blue-100 text-blue-800' },
  trend_master: { avatar: '📈', color: 'bg-purple-100 text-purple-800' },
  pattern_gpt: { avatar: '🧠', color: 'bg-green-100 text-green-800' },
  journal_coach: { avatar: '🎓', color: 'bg-indigo-100 text-indigo-800' },
  // Fallbacks
  default: { avatar: '🤖', color: 'bg-gray-100 text-gray-800' }
};

// Added journal_coach to active agents so it participates in analysis and drafts entries
const ACTIVE_AGENT_IDS: AgentId[] = ["quant_bot", "trend_master", "pattern_gpt", "journal_coach"];

export interface ChatOverlayHandle {
  sendSystemMessageToAgent: (params: { prompt: string; agentId: string }) => Promise<void>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  author?: string; // "You", "QuantBot", etc.
  agentId?: string; // for color mapping
  text: string;
  isError?: boolean;
  tradeMeta?: TradeMeta;
  toolCalls?: ToolCall[];
}

interface ChatOverlayProps {
  chartContext: string;
  isBrokerConnected?: boolean;
  sessionId: string;
  autoFocusSymbol?: string;
  brokerSessionId?: string | null;
  chartSymbol?: string;
  chartTimeframe?: string;
}

const ChatOverlay = forwardRef<ChatOverlayHandle, ChatOverlayProps>((props, ref) => {
  const { 
    chartContext, 
    isBrokerConnected, 
    autoFocusSymbol,
    brokerSessionId, // used for future extensions or specific broker logic
    chartSymbol = 'US30',
    chartTimeframe = '15m'
  } = props;

  // UI State
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Vision / File State
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [pendingFileImage, setPendingFileImage] = useState<{ mimeType: string; data: string } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { addEntry, entries } = useJournal(); 
  const { agentConfigs } = useAgentConfig(); // <--- Get agent configuration

  // Handle journal drafts from AI response
  const processJournalDraft = (draft: AgentJournalDraft, agentId: string, agentName: string) => {
      const effectiveAgentId = (draft.agentId || agentId);
      addEntry({
        id: `ai-${effectiveAgentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        source: 'ai',
        
        playbook: draft.title, 
        note: draft.summary,
        sentiment: draft.sentiment,
        tags: draft.tags,
        
        agentId: effectiveAgentId,
        agentName: draft.agentName || agentName,
        
        outcome: (draft.outcome as any) || 'Open',
        symbol: draft.symbol || chartSymbol,
        direction: draft.direction,
        
        entryPrice: undefined,
        stopPrice: undefined,
        targetPrice: undefined,
        size: undefined,

        // NEW FIELDS
        rr: draft.rr ?? null,
        pnl: draft.pnl ?? null,
      });
      console.log(`[ChatOverlay] Added journal draft from ${agentName}`);
  };

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    sendSystemMessageToAgent: async ({ prompt, agentId }) => {
      // Create a user message to show what's happening
      // For large system prompts (like playbook reviews), we show a summarized text
      const displayPrompt = prompt.includes('"entries":') ? "Please review my recent journal entries and identify lessons." : prompt;
      
      const userMsg: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: 'user',
        author: 'System',
        text: displayPrompt
      };
      
      setMessages(prev => [...prev, userMsg]);
      setIsSending(true);

      try {
        const insights = await fetchAgentInsights({
          agentIds: [agentId as AgentId],
          userMessage: prompt, // Send full prompt to LLM
          chartContext: chartContext,
          screenshot: null,
          agentOverrides: agentConfigs, // <--- Pass overrides
          accountId: brokerSessionId
        });

        setMessages(prev => {
          const next = [...prev];
          insights.forEach(insight => {
             if (insight.text || (insight.toolCalls && insight.toolCalls.length > 0)) {
                next.push({
                   id: `msg-${insight.agentId}-${Date.now()}`,
                   role: 'assistant',
                   author: insight.agentName,
                   agentId: insight.agentId as string,
                   text: insight.text || '',
                   tradeMeta: insight.tradeMeta || undefined,
                   toolCalls: insight.toolCalls
                });
             }
             if (insight.error) {
                next.push({
                   id: `err-${insight.agentId}-${Date.now()}`,
                   role: 'assistant',
                   author: insight.agentName,
                   agentId: insight.agentId as string,
                   text: `⚠️ ${insight.error}`,
                   isError: true
                });
             }
          });
          return next;
        });

        // Handle journal drafts if any
        insights.forEach(i => {
          if (i.journalDraft) {
             processJournalDraft(i.journalDraft, i.agentId as string, i.agentName);
          }
        });

      } catch (e: any) {
        console.error("System Agent Error", e);
        setMessages(prev => [...prev, {
          id: `sys-err-${Date.now()}`,
          role: 'assistant',
          author: 'System',
          text: `Error processing request: ${e.message}`,
          isError: true
        }]);
      } finally {
        setIsSending(false);
      }
    }
  }));

  // Auto-scroll
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending, isOpen]);

  // Cleanup vision on unmount
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
          video: { displaySurface: 'browser' }, 
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
      } catch (err) {
        console.error("Error starting screen capture:", err);
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

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const commaIndex = result.indexOf(",");
        const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
        setPendingFileImage({ mimeType: file.type, data: base64 });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getCommonPayloads = () => {
    const journalContextPayload = entries.slice(0, 10).map((e) => ({
      id: e.id,
      symbol: e.symbol,
      outcome: e.outcome,
      playbook: e.playbook,
      note: e.note,
      agentId: e.agentId,
      agentName: e.agentName,
      timestamp: e.timestamp,
    }));

    const chartContextPayload = {
      summary: chartContext,
      symbol: chartSymbol,
      timeframe: chartTimeframe
    };

    return { journalContextPayload, chartContextPayload };
  };

  const handleAgentRoundtable = async () => {
    const agentMessages = messages.filter(m => m.role === 'assistant');
    if (agentMessages.length === 0) return;
  
    setIsSending(true);
  
    try {
      // Build previousInsights from chat history
      const previousInsightsPayload = agentMessages.map(m => ({
        agentId: m.agentId || 'unknown',
        agentName: m.author || 'Agent',
        message: m.text,
        tradeMeta: m.tradeMeta,
      }));
  
      const { journalContextPayload, chartContextPayload } = getCommonPayloads();
  
      const insights = await fetchAgentDebrief({
        previousInsights: previousInsightsPayload,
        chartContext: chartContextPayload,
        journalContext: journalContextPayload,
        agentOverrides: agentConfigs, // <--- Pass overrides
        accountId: brokerSessionId
      });
  
      setMessages(prev => {
        const next = [...prev];
        insights.forEach(insight => {
           if (insight.text || (insight.toolCalls && insight.toolCalls.length > 0)) {
              next.push({
                 id: `debrief-${insight.agentId}-${Date.now()}`,
                 role: 'assistant',
                 author: insight.agentName,
                 agentId: insight.agentId as string,
                 text: insight.text || '',
                 tradeMeta: insight.tradeMeta || undefined,
                 toolCalls: insight.toolCalls
              });
           }
           if (insight.error) {
              next.push({
                 id: `err-debrief-${insight.agentId}-${Date.now()}`,
                 role: 'assistant',
                 author: insight.agentName,
                 agentId: insight.agentId as string,
                 text: `⚠️ ${insight.error}`,
                 isError: true
              });
           }
        });
        return next;
      });
  
      insights.forEach(i => {
        if (i.journalDraft) {
           processJournalDraft(i.journalDraft, i.agentId as string, i.agentName);
        }
      });
  
    } catch (e: any) {
      console.error("Roundtable Error", e);
      setMessages(prev => [...prev, {
        id: `sys-err-debrief-${Date.now()}`,
        role: 'assistant',
        author: 'System',
        text: `Error calling Roundtable: ${e.message}`,
        isError: true
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !pendingFileImage && !isVisionActive) return;
    if (isSending) return;

    const userText = inputValue;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      author: 'You',
      text: userText
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsSending(true);

    try {
      let screenshot: string | null = null;
      if (pendingFileImage) {
        screenshot = `data:${pendingFileImage.mimeType};base64,${pendingFileImage.data}`;
      } else if (isVisionActive) {
        const frame = captureFrame();
        if (frame) {
          screenshot = `data:image/jpeg;base64,${frame}`;
        }
      }
      setPendingFileImage(null); 

      const { journalContextPayload, chartContextPayload } = getCommonPayloads();

      const insights = await fetchAgentInsights({
        agentIds: ACTIVE_AGENT_IDS,
        userMessage: userText,
        chartContext: chartContextPayload,
        journalContext: journalContextPayload,
        screenshot,
        agentOverrides: agentConfigs, // <--- Pass overrides
        accountId: brokerSessionId
      });

      setMessages(prev => {
        const next = [...prev];
        insights.forEach(insight => {
          if (insight.error) {
            next.push({
              id: `err-${insight.agentId}-${Date.now()}`,
              role: 'assistant',
              author: insight.agentName,
              agentId: insight.agentId as string,
              text: `⚠️ ${insight.error}`,
              isError: true
            });
          } else if (insight.text || (insight.toolCalls && insight.toolCalls.length > 0)) {
             next.push({
              id: `msg-${insight.agentId}-${Date.now()}`,
              role: 'assistant',
              author: insight.agentName,
              agentId: insight.agentId as string,
              text: insight.text || '',
              tradeMeta: insight.tradeMeta || undefined,
              toolCalls: insight.toolCalls
            });
          }
        });
        return next;
      });

      insights.forEach(i => {
        if (i.journalDraft) {
          processJournalDraft(i.journalDraft, i.agentId as string, i.agentName);
        }
      });

    } catch (e: any) {
      console.error("Agent Error", e);
      setMessages(prev => [...prev, {
        id: `sys-err-${Date.now()}`,
        role: 'assistant',
        author: 'System',
        text: `Error connecting to AI team: ${e.message}`,
        isError: true
      }]);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="w-12 h-full bg-[#1e222d] border-l border-[#2a2e39] flex flex-col items-center py-4 gap-4 z-30 shrink-0">
        <button 
          onClick={() => setIsOpen(true)}
          className="w-8 h-8 rounded-lg bg-[#2962ff] text-white flex items-center justify-center hover:bg-[#1e53e5] transition-colors"
          title="Open AI Team"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        {isVisionActive && (
           <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Vision Active"></div>
        )}
        <div className="flex-1 w-[1px] bg-[#2a2e39]/50"></div>
        <div className="writing-vertical-rl text-xs font-bold text-gray-400 tracking-wider uppercase rotate-180">
          AI Squad
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-full bg-white flex flex-col border-l border-[#2a2e39] shadow-xl relative z-30 animate-fade-in-right shrink-0">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-100 flex justify-between items-center bg-white shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">AI Trading Squad</h2>
            <p className="text-[10px] text-gray-400 font-medium">
              QuantBot · TrendMaster · Pattern_GPT · Coach
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleVision}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors border ${
              isVisionActive 
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
            title={isVisionActive ? "Stop Watching Screen" : "Watch Screen"}
          >
             {isVisionActive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span>Vision</span>
                </>
             ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  <span>Vision</span>
                </>
             )}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
          </button>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#f8f9fa] space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="text-center mt-10 p-4">
             <div className="text-3xl mb-3">🤖 📈 🧠 🎓</div>
             <p className="text-gray-500 text-sm font-medium">Ask your AI Team</p>
             <p className="text-gray-400 text-xs mt-1">
               QuantBot, TrendMaster, Pattern_GPT, and Coach are ready to analyze charts and suggest trades.
             </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          // Style config for agent
          const uiMeta = (msg.agentId && AGENT_UI_META[msg.agentId]) 
            ? AGENT_UI_META[msg.agentId] 
            : AGENT_UI_META.default;

          return (
            <div key={idx} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm flex-shrink-0 ${isUser ? 'bg-[#131722] text-white' : 'bg-white border border-gray-100'}`}>
                {isUser ? '👤' : uiMeta.avatar}
              </div>
              
              <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                 {!isUser && msg.author && (
                   <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1 uppercase tracking-wider">
                     {msg.author}
                   </span>
                 )}
                 <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                   isUser 
                     ? 'bg-[#2962ff] text-white rounded-tr-none' 
                     : `bg-white text-gray-700 border border-gray-200 rounded-tl-none ${msg.isError ? 'border-red-200 bg-red-50 text-red-700' : ''}`
                 }`}>
                   {msg.text}

                   {/* Render Tool Calls */}
                   {msg.toolCalls && msg.toolCalls.length > 0 && (
                     <div className="mt-3 space-y-2">
                       {msg.toolCalls.map((tc, tcIdx) => (
                         <div key={tcIdx} className="text-xs bg-gray-50 border border-gray-200 rounded p-2">
                           <div className="flex items-center gap-1.5 mb-1">
                             <span className="text-xs">🛠️</span>
                             <span className="font-semibold text-gray-600 font-mono text-[10px]">{tc.toolName}</span>
                           </div>
                           <div className="text-[10px] text-gray-500 font-mono break-all pl-5">
                             args: {JSON.stringify(tc.args)}
                           </div>
                           {/* Optionally show results? Usually too verbose */}
                         </div>
                       ))}
                     </div>
                   )}
                   
                   {/* Mini Trade Card / Ticket */}
                   {msg.tradeMeta && (
                      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden w-full max-w-[280px]">
                        <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                           <div className="font-bold text-slate-700 flex items-center gap-2">
                             <span>{msg.tradeMeta.symbol || 'SYMBOL'}</span>
                             {msg.tradeMeta.direction && (
                               <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${msg.tradeMeta.direction === 'long' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {msg.tradeMeta.direction}
                               </span>
                             )}
                           </div>
                           <div className="text-[10px] font-mono text-slate-500">{msg.tradeMeta.timeframe || 'TF'}</div>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                            <div className="flex justify-between items-baseline">
                              <span className="text-slate-500 text-[10px] uppercase tracking-wider">Entry</span>
                              <span className="font-mono font-medium text-slate-800">Market</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                              <span className="text-slate-500 text-[10px] uppercase tracking-wider">Conf</span>
                              <span className="font-mono font-medium text-slate-800">{msg.tradeMeta.confidence || '?'}%</span>
                            </div>
                            <div className="flex justify-between items-baseline col-span-2 border-t border-slate-200 pt-2 mt-1">
                               <span className="text-slate-500 text-[10px] uppercase tracking-wider">Stop Loss</span>
                               <span className="font-mono font-bold text-red-600">{msg.tradeMeta.stopLoss || '—'}</span>
                            </div>
                            <div className="flex justify-between items-baseline col-span-2">
                               <span className="text-slate-500 text-[10px] uppercase tracking-wider">Target 1</span>
                               <span className="font-mono font-bold text-green-600">{msg.tradeMeta.takeProfit1 || '—'}</span>
                            </div>
                             {msg.tradeMeta.takeProfit2 && (
                              <div className="flex justify-between items-baseline col-span-2">
                                 <span className="text-slate-500 text-[10px] uppercase tracking-wider">Target 2</span>
                                 <span className="font-mono font-bold text-green-600">{msg.tradeMeta.takeProfit2}</span>
                              </div>
                            )}
                            {msg.tradeMeta.rr && (
                               <div className="flex justify-between items-baseline col-span-2 border-t border-slate-200 pt-2 mt-1">
                                  <span className="text-slate-500 text-[10px] uppercase tracking-wider">Risk:Reward</span>
                                  <span className="font-mono font-medium text-slate-800">{msg.tradeMeta.rr}R</span>
                               </div>
                            )}
                        </div>
                      </div>
                   )}
                 </div>
              </div>
            </div>
          );
        })}
        
        {isSending && (
           <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center">
               <span className="animate-spin">⏳</span>
             </div>
             <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Agents thinking...</span>
                <span className="flex space-x-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></span>
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
            placeholder={`Ask the team...`}
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 pr-12 text-sm focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff] transition-all text-gray-800 placeholder-gray-400 resize-none h-12 max-h-32 pl-10" 
          />
          {/* Attachment Button */}
          <button 
             onClick={handleFileClick}
             className="absolute left-2 top-3 text-gray-400 hover:text-[#2962ff] p-1 transition-colors"
             title="Attach Screenshot"
          >
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>

          <button 
            onClick={handleSendMessage}
            disabled={(!inputValue.trim() && !pendingFileImage && !isVisionActive) || isSending}
            className="absolute right-2 top-2 p-1.5 bg-[#2962ff] text-white rounded-xl hover:bg-[#1e53e5] disabled:opacity-50 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div className="mt-2 px-1 flex justify-between items-center">
           <div className="flex items-center gap-2">
             <button
               type="button"
               onClick={handleAgentRoundtable}
               disabled={isSending}
               className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors disabled:opacity-50"
             >
               Agent Round 2
             </button>
             <p className="text-[10px] text-gray-400">
               {isBrokerConnected ? 'Broker Connected' : 'Simulated Environment'}
             </p>
             {pendingFileImage && (
               <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] border border-blue-100">
                 <span>📎 Screenshot Attached</span>
                 <button onClick={(e) => { e.stopPropagation(); setPendingFileImage(null); }} className="hover:text-blue-800">×</button>
               </div>
             )}
           </div>
           
           {isVisionActive && (
             <span className="text-[10px] text-red-500 font-medium animate-pulse">
               Screen Analysis Ready
             </span>
           )}
        </div>
      </div>
    </div>
  );
});

export default ChatOverlay;
