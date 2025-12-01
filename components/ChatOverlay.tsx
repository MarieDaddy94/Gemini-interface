
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { fetchAgentInsights, fetchAgentDebrief, AgentId, AgentJournalDraft, AgentInsight, TradeMeta, ToolCall } from '../services/agentApi';
import { useJournal } from '../context/JournalContext';
import { useAgentConfig } from '../context/AgentConfigContext';
import { BrokerPosition } from '../types';

// UI Metadata for styling specific agents
const AGENT_UI_META: Record<string, { avatar: string, color: string }> = {
  quant_bot: { avatar: '🤖', color: 'bg-blue-100 text-blue-800' },
  trend_master: { avatar: '📈', color: 'bg-purple-100 text-purple-800' },
  pattern_gpt: { avatar: '🧠', color: 'bg-green-100 text-green-800' },
  journal_coach: { avatar: '🎓', color: 'bg-indigo-100 text-indigo-800' },
  // Fallbacks
  default: { avatar: '🤖', color: 'bg-gray-100 text-gray-800' }
};

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
  openPositions?: BrokerPosition[];
}

// --- Crop Modal Helper ---
interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CropModal: React.FC<{
  imageSrc: string;
  onConfirm: (croppedBase64: string) => void;
  onCancel: () => void;
}> = ({ imageSrc, onConfirm, onCancel }) => {
  const [selection, setSelection] = useState<CropRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getClientCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const coords = getClientCoordinates(e);
    const x = coords.x - rect.left;
    const y = coords.y - rect.top;
    
    setStartPos({ x, y });
    setSelection({ x, y, width: 0, height: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !startPos || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const coords = getClientCoordinates(e);
    const currentX = Math.max(0, Math.min(coords.x - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(coords.y - rect.top, rect.height));

    const width = Math.abs(currentX - startPos.x);
    const height = Math.abs(currentY - startPos.y);
    const x = Math.min(currentX, startPos.x);
    const y = Math.min(currentY, startPos.y);

    setSelection({ x, y, width, height });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    if (!selection || !imgRef.current || selection.width < 10 || selection.height < 10) {
      // If no selection or tiny selection, just verify if they want full image? 
      // For now, require selection.
      if (!selection) alert("Please select a region to capture.");
      return;
    }

    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

    canvas.width = selection.width * scaleX;
    canvas.height = selection.height * scaleY;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(
        imgRef.current,
        selection.x * scaleX,
        selection.y * scaleY,
        selection.width * scaleX,
        selection.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      // Remove data prefix for API
      onConfirm(dataUrl.split(',')[1]); 
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex items-center justify-between px-6 py-4 bg-[#1e222d] border-b border-[#2a2e39]">
        <h3 className="text-white font-medium">Select Region to Analyze</h3>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!selection || selection.width < 10}
            className="px-4 py-2 bg-[#2962ff] text-white rounded font-medium hover:bg-[#1e53e5] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Capture Region
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center overflow-hidden p-8 touch-none">
        <div 
          ref={containerRef}
          className="relative inline-block shadow-2xl border border-gray-700/50 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <img 
            ref={imgRef}
            src={imageSrc} 
            alt="Original" 
            className="max-h-[80vh] max-w-[90vw] object-contain pointer-events-none select-none"
            draggable={false}
          />
          
          {/* Dark Overlay for non-selected areas */}
          {selection && (
            <>
               <div className="absolute bg-black/60 inset-0 pointer-events-none" style={{
                 clipPath: `polygon(0% 0%, 0% 100%, ${selection.x}px 100%, ${selection.x}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y + selection.height}px, ${selection.x}px 100%, 100% 100%, 100% 0%)`
               }}></div>
               <div 
                 className="absolute border-2 border-[#2962ff] bg-transparent pointer-events-none"
                 style={{
                   left: selection.x,
                   top: selection.y,
                   width: selection.width,
                   height: selection.height,
                   boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)'
                 }}
               >
                 <div className="absolute -top-6 left-0 bg-[#2962ff] text-white text-[10px] px-1.5 py-0.5 rounded shadow">
                    {Math.round(selection.width * (imgRef.current?.naturalWidth ? imgRef.current.naturalWidth / imgRef.current.width : 1))} x {Math.round(selection.height * (imgRef.current?.naturalHeight ? imgRef.current.naturalHeight / imgRef.current.height : 1))}
                 </div>
               </div>
            </>
          )}
        </div>
      </div>
      
      <div className="bg-[#1e222d] py-2 text-center text-xs text-gray-400 border-t border-[#2a2e39]">
         Click and drag to crop the chart area you want the AI to analyze.
      </div>
    </div>
  );
};


const ChatOverlay = forwardRef<ChatOverlayHandle, ChatOverlayProps>((props, ref) => {
  const { 
    chartContext, 
    isBrokerConnected, 
    autoFocusSymbol,
    brokerSessionId,
    chartSymbol = 'US30',
    chartTimeframe = '15m',
    openPositions = []
  } = props;

  // UI State
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPositions, setShowPositions] = useState(true); // default open if connected

  // Vision / File State
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [pendingFileImage, setPendingFileImage] = useState<{ mimeType: string; data: string } | null>(null);
  
  // Region Selection State
  const [showCropModal, setShowCropModal] = useState(false);
  const [tempSnapshotForCrop, setTempSnapshotForCrop] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { addEntry, entries } = useJournal(); 
  const { agentConfigs } = useAgentConfig(); 

  // ... (processJournalDraft helper - unchanged)
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

        rr: draft.rr ?? null,
        pnl: draft.pnl ?? null,
      });
      console.log(`[ChatOverlay] Added journal draft from ${agentName}`);
  };

  useImperativeHandle(ref, () => ({
    sendSystemMessageToAgent: async ({ prompt, agentId }) => {
      // ... (unchanged system message handler)
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
          userMessage: prompt,
          chartContext: chartContext,
          screenshot: null,
          agentOverrides: agentConfigs,
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending, isOpen]);

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

  const captureFrame = (scale: number = 0.5): string | undefined => {
    if (!videoRef.current || !isVisionActive) return undefined;
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return undefined;
    
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    // Return full dataUrl so it can be used in <img> src, caller can strip prefix if needed
    return dataUrl; 
  };

  // Triggered when user wants to crop
  const handleCaptureRegion = () => {
    // Capture full resolution for cropping
    const fullFrame = captureFrame(1.0); 
    if (fullFrame) {
      setTempSnapshotForCrop(fullFrame);
      setShowCropModal(true);
    }
  };

  const handleCropConfirm = (croppedBase64: string) => {
    setPendingFileImage({ mimeType: 'image/jpeg', data: croppedBase64 });
    setShowCropModal(false);
    setTempSnapshotForCrop(null);
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setTempSnapshotForCrop(null);
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

  // ... (getCommonPayloads, handleAgentRoundtable - unchanged)
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
      // ... (implementation same as before)
      const agentMessages = messages.filter(m => m.role === 'assistant');
      if (agentMessages.length === 0) return;
      setIsSending(true);
      try {
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
          agentOverrides: agentConfigs,
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
        // Fallback: If vision active but no region captured, grab full screen (scaled)
        const frame = captureFrame(0.5);
        if (frame) {
          screenshot = frame;
        }
      }
      setPendingFileImage(null); 

      const { journalContextPayload, chartContextPayload } = getCommonPayloads();

      const insights = await fetchAgentInsights({
        agentIds: ACTIVE_AGENT_IDS,
        userMessage: userText,
        chartContext: chartContextPayload,
        journalContext: journalContextPayload,
        screenshot: screenshot ? screenshot.split(',')[1] : null, // API expects base64 without prefix
        agentOverrides: agentConfigs,
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

  // --- RENDER ---

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
    <>
      <div className="w-[400px] h-full bg-white flex flex-col border-l border-[#2a2e39] shadow-xl relative z-30 animate-fade-in-right shrink-0">
        {/* Hidden video stream element */}
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
                    <span>Vision Active</span>
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
        
        {/* Open Positions Panel (Collapsible) */}
        {isBrokerConnected && openPositions.length > 0 && (
          <div className="border-b border-gray-100 bg-slate-50 shrink-0">
             <button 
               onClick={() => setShowPositions(!showPositions)}
               className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
             >
               <div className="flex items-center gap-2">
                 <span className="flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-600 rounded-full text-[10px] font-bold">
                   {openPositions.length}
                 </span>
                 <span>Active Positions</span>
                 {openPositions.reduce((acc, p) => acc + p.pnl, 0) >= 0 
                    ? <span className="text-green-600 font-bold ml-1">+${openPositions.reduce((acc, p) => acc + p.pnl, 0).toFixed(2)}</span>
                    : <span className="text-red-500 font-bold ml-1">-${Math.abs(openPositions.reduce((acc, p) => acc + p.pnl, 0)).toFixed(2)}</span>
                 }
               </div>
               <svg 
                 xmlns="http://www.w3.org/2000/svg" 
                 width="14" 
                 height="14" 
                 viewBox="0 0 24 24" 
                 fill="none" 
                 stroke="currentColor" 
                 strokeWidth="2" 
                 strokeLinecap="round" 
                 strokeLinejoin="round"
                 className={`transition-transform duration-200 ${showPositions ? 'rotate-180' : ''}`}
               >
                 <polyline points="6 9 12 15 18 9"></polyline>
               </svg>
             </button>
             
             {showPositions && (
                <div className="max-h-40 overflow-y-auto border-t border-gray-100">
                   {openPositions.map((pos) => (
                      <div key={pos.id} className="px-4 py-2 border-b border-gray-100 last:border-0 hover:bg-white text-xs flex justify-between items-center group">
                         <div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-700">
                               <span className={`text-[10px] px-1 rounded uppercase ${pos.side === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {pos.side}
                               </span>
                               <span>{pos.symbol}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                               Size: {pos.size} • Entry: {pos.entryPrice}
                            </div>
                         </div>
                         <div className={`font-mono font-bold ${pos.pnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                         </div>
                      </div>
                   ))}
                </div>
             )}
          </div>
        )}

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
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Mini Trade Card / Ticket */}
                    {msg.tradeMeta && (
                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden w-full max-w-[280px]">
                          {/* ... trade meta UI (same as before) ... */}
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
                              {/* ... fields ... */}
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

        {/* Vision Preview Area (New) */}
        {isVisionActive && (
          <div className="px-4 pt-2 bg-white border-t border-gray-100">
            <div className="bg-gray-900 rounded-lg p-2 flex items-center gap-3 shadow-inner">
               <div className="relative w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0 border border-gray-700">
                 {/* Live Video Mirror for Preview */}
                 <video 
                   ref={(ref) => {
                     if (ref && streamRef.current) ref.srcObject = streamRef.current;
                   }} 
                   autoPlay 
                   muted 
                   className="w-full h-full object-cover opacity-80"
                 />
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-red-500/50 shadow-lg"></div>
                 </div>
               </div>
               <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Live Feed Active</div>
                  <div className="text-[10px] text-gray-500 truncate">Sharing window/screen</div>
               </div>
               <button 
                 onClick={handleCaptureRegion}
                 className="text-[10px] bg-[#2962ff] hover:bg-[#1e53e5] text-white px-2 py-1.5 rounded flex items-center gap-1 transition-colors font-medium shadow"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                 Capture Region
               </button>
            </div>
          </div>
        )}

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
                  <span>📎 Image Attached</span>
                  <button onClick={(e) => { e.stopPropagation(); setPendingFileImage(null); }} className="hover:text-blue-800">×</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* CROP MODAL OVERLAY */}
      {showCropModal && tempSnapshotForCrop && (
        <CropModal 
           imageSrc={tempSnapshotForCrop} 
           onConfirm={handleCropConfirm} 
           onCancel={handleCropCancel} 
        />
      )}
    </>
  );
});

export default ChatOverlay;
