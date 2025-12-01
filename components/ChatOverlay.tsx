
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { fetchAgentInsights, fetchAgentDebrief, AgentId, AgentJournalDraft, AgentInsight, TradeMeta, ToolCall } from '../services/agentApi';
import { useJournal } from '../context/JournalContext';
import { useAgentConfig } from '../context/AgentConfigContext';
import { BrokerPosition } from '../types';
import { executeTrade } from '../services/tradeLockerService';

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

  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPositions, setShowPositions] = useState(true);

  // Vision State
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [pendingFileImage, setPendingFileImage] = useState<{ mimeType: string; data: string } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { addEntry, entries } = useJournal(); 
  const { agentConfigs } = useAgentConfig(); 

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
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !pendingFileImage && !isVisionActive) return;
    setIsSending(true);
    const userText = inputValue;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: userText, author: 'You' }]);
    setInputValue('');

    try {
       let screenshot: string | null = null;
       if (isVisionActive) {
          const f = captureFrame(0.5);
          if (f) screenshot = f.split(',')[1];
       }

       const insights = await fetchAgentInsights({
        agentIds: ACTIVE_AGENT_IDS,
        userMessage: userText,
        chartContext: { summary: chartContext },
        screenshot: screenshot,
        agentOverrides: agentConfigs,
        accountId: brokerSessionId
      });

      setMessages(prev => {
        const next = [...prev];
        insights.forEach(i => {
           if(i.text) next.push({ 
             id: `a-${Date.now()}-${i.agentId}`, 
             role: 'assistant', 
             author: i.agentName, 
             agentId: i.agentId as string, 
             text: i.text 
           });
        });
        return next;
      });
    } catch (e) {
       console.error(e);
    } finally {
       setIsSending(false);
    }
  };

  if (!isOpen) {
     return <button onClick={() => setIsOpen(true)} className="fixed right-0 top-1/2 bg-blue-600 text-white p-2 rounded-l z-50">Open AI</button>
  }

  return (
    <div className="w-[400px] h-full bg-white flex flex-col border-l border-[#2a2e39] shadow-xl relative z-30 shrink-0">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-100 flex justify-between items-center bg-white shadow-sm shrink-0">
        <h2 className="font-bold text-gray-800 text-sm">AI Trading Squad</h2>
        <div className="flex items-center gap-2">
          {/* Vision Toggle */}
          <button 
            onClick={toggleVision}
            className={`px-2 py-1 rounded border text-xs flex items-center gap-1 ${isVisionActive ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 border-gray-200'}`}
          >
             {isVisionActive ? 'Stop Vision' : 'Start Vision'}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-gray-400">×</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa]">
         {messages.map(m => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
               <span className="text-[10px] text-gray-500 mb-1">{m.author}</span>
               <div className={`p-3 rounded-lg text-sm max-w-[90%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
                  {m.text}
               </div>
            </div>
         ))}
         <div ref={messagesEndRef}></div>
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100 flex gap-2">
         <input 
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="Ask the squad..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
         />
         <button onClick={handleSendMessage} disabled={isSending} className="bg-blue-600 text-white px-4 rounded text-sm font-bold">
            {isSending ? '...' : 'Send'}
         </button>
      </div>
    </div>
  );
});

export default ChatOverlay;
