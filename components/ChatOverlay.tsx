import React, { useState, useRef, useEffect } from 'react';
import { 
  AgentConfig, 
  ClientMessage, 
  AiRole, 
  MarketContext,
  AiRouteRequest
} from '../types';
import { sendAiMessage } from '../services/aiService';

// Agent Definitions matching backend
const AGENTS: AgentConfig[] = [
  {
    id: 'trend-analyst',
    label: 'Trend & Zones',
    description: 'Structure, key levels, & momentum.',
    avatar: '📈',
    color: 'bg-blue-100 text-blue-800'
  },
  {
    id: 'risk-manager',
    label: 'Risk Manager',
    description: 'Sizing, drawdown, & exposure.',
    avatar: '🛡️',
    color: 'bg-red-100 text-red-800'
  },
  {
    id: 'playbook-architect',
    label: 'Playbook',
    description: 'Design & optimize trading rules.',
    avatar: '📐',
    color: 'bg-purple-100 text-purple-800'
  },
  {
    id: 'journal-analyst',
    label: 'Journal Coach',
    description: 'Psychology & performance review.',
    avatar: '🧠',
    color: 'bg-emerald-100 text-emerald-800'
  }
];

interface ChatOverlayProps {
  chartContext: string; // Legacy string context, we'll try to parse symbol from it or App
  isBrokerConnected?: boolean;
  sessionId: string; // The "effective" journal session ID
  autoFocusSymbol?: string;
  brokerSessionId?: string | null;
}

// State container for a single agent's chat history
interface AgentState {
  messages: ClientMessage[];
  isThinking: boolean;
}

const ChatOverlay: React.FC<ChatOverlayProps> = ({ 
  chartContext, 
  isBrokerConnected, 
  sessionId,
  autoFocusSymbol,
  brokerSessionId
}) => {
  // UI State
  const [isOpen, setIsOpen] = useState(true);
  const [activeAgentId, setActiveAgentId] = useState<string>('trend-analyst');
  const [inputValue, setInputValue] = useState('');
  
  // Agents State Map
  const [agentsState, setAgentsState] = useState<Record<string, AgentState>>(() => {
    const initial: Record<string, AgentState> = {};
    AGENTS.forEach(a => {
      initial[a.id] = {
        messages: [{
           id: 'init-1',
           role: 'assistant',
           content: `Hello! I am your ${a.label}. ${a.description} How can I help?`
        }],
        isThinking: false
      };
    });
    return initial;
  });

  // Vision / Screen Share State
  const [isVisionActive, setIsVisionActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [agentsState, activeAgentId, isOpen]);

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
      } catch (err: any) {
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

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const currentAgent = AGENTS.find(a => a.id === activeAgentId)!;
    const userText = inputValue;
    const userMsg: ClientMessage = {
      role: 'user',
      content: userText,
      id: Date.now().toString()
    };

    let screenshot: string | undefined = undefined;
    if (isVisionActive) {
      screenshot = captureFrame();
    }

    // Optimistic Update
    setAgentsState(prev => ({
      ...prev,
      [activeAgentId]: {
        ...prev[activeAgentId],
        messages: [...prev[activeAgentId].messages, userMsg],
        isThinking: true
      }
    }));
    setInputValue('');

    try {
      // Prepare Request
      const history = agentsState[activeAgentId].messages.concat(userMsg);
      
      const marketContext: MarketContext = {
        symbol: (autoFocusSymbol && autoFocusSymbol !== 'Auto') ? autoFocusSymbol : undefined,
        timeframe: '5m', // Default assumption or derived
        brokerSessionId: brokerSessionId || undefined,
        journalSessionId: sessionId
      };

      const req: AiRouteRequest = {
        agentId: activeAgentId,
        messages: history,
        marketContext,
        vision: screenshot ? {
          type: 'chart-screenshot',
          mimeType: 'image/jpeg',
          dataBase64: screenshot
        } : undefined
      };

      const response = await sendAiMessage(req);

      setAgentsState(prev => ({
        ...prev,
        [activeAgentId]: {
          ...prev[activeAgentId],
          messages: [...prev[activeAgentId].messages, response.message],
          isThinking: false
        }
      }));

    } catch (e) {
      console.error("Agent Error", e);
      setAgentsState(prev => ({
        ...prev,
        [activeAgentId]: {
          ...prev[activeAgentId],
          messages: [...prev[activeAgentId].messages, {
            role: 'assistant',
            content: "⚠️ I lost connection to the server. Please try again.",
            id: Date.now().toString()
          }],
          isThinking: false
        }
      }));
    }
  };

  // Render Helpers
  const activeState = agentsState[activeAgentId];
  const activeAgentConfig = AGENTS.find(a => a.id === activeAgentId)!;

  // Collapsed State
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
          AI Team Active
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-full bg-white flex flex-col border-l border-[#2a2e39] shadow-xl relative z-30 animate-fade-in-right shrink-0">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-100 flex justify-between items-center bg-white shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">AI Trading Desk</h2>
            <p className="text-[10px] text-gray-400 font-medium">
              Multi-Agent System • {isBrokerConnected ? 'Live Broker' : 'Market Watch'}
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

      {/* Agent Selector Tabs */}
      <div className="flex items-center gap-1 px-2 py-2 bg-gray-50 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        {AGENTS.map(agent => {
          const isActive = agent.id === activeAgentId;
          return (
            <button
              key={agent.id}
              onClick={() => setActiveAgentId(agent.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                isActive 
                  ? 'bg-white border-gray-200 text-gray-800 shadow-sm' 
                  : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50'
              }`}
            >
              <span>{agent.avatar}</span>
              <span>{agent.label}</span>
            </button>
          )
        })}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#f8f9fa] space-y-4 scrollbar-thin">
        {activeState.messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          // Skip tool messages in UI to keep it clean, unless you want to show them
          if (msg.role === 'tool') return null;

          return (
            <div key={idx} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm flex-shrink-0 ${isUser ? 'bg-[#131722] text-white' : 'bg-white border border-gray-100'}`}>
                {isUser ? '👤' : activeAgentConfig.avatar}
              </div>
              
              <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                 {!isUser && (
                   <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1 uppercase tracking-wider">
                     {activeAgentConfig.label}
                   </span>
                 )}
                 <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                   isUser 
                     ? 'bg-[#2962ff] text-white rounded-tr-none' 
                     : `bg-white text-gray-700 border border-gray-200 rounded-tl-none`
                 }`}>
                   {msg.content}
                 </div>
              </div>
            </div>
          );
        })}
        
        {activeState.isThinking && (
           <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center">
               <span className="animate-spin">⏳</span>
             </div>
             <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Thinking...</span>
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

      {/* Input Area */}
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
            placeholder={`Ask ${activeAgentConfig.label}...`}
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#2962ff]/50 focus:bg-white transition-all text-gray-800 placeholder-gray-400 resize-none h-12 max-h-32"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || activeState.isThinking}
            className="absolute right-2 top-2 p-1.5 bg-[#2962ff] text-white rounded-xl hover:bg-[#1e53e5] disabled:opacity-50 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div className="mt-2 px-1 flex justify-between">
           <p className="text-[10px] text-gray-400">
             {activeAgentConfig.description}
           </p>
           {isVisionActive && (
             <span className="text-[10px] text-red-500 font-medium animate-pulse">
               Screen Analysis Ready
             </span>
           )}
        </div>
      </div>
    </div>
  );
};

export default ChatOverlay;
