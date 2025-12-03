
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { GeminiLiveClient } from '../services/GeminiLiveClient';
import { OpenAIRealtimeClient } from '../services/OpenAIRealtimeClient';
import { useRealtimeConfig } from './RealtimeConfigContext';
import { modelConfigService } from '../services/modelConfig';
import { logger } from '../services/logger';
import { handleGeminiToolCall } from '../services/geminiToolHandlers';
import { GEMINI_ROOM_TOOLS, OPENAI_ROOM_TOOLS } from '../config/roomTools';

// Room Types
export type VoiceRoomId = 'desk' | 'autopilot' | 'journal';

interface VoiceRoomContextValue {
  activeRoom: VoiceRoomId | null;
  isActive: boolean;
  provider: 'gemini' | 'openai';
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  joinRoom: (roomId: VoiceRoomId) => Promise<void>;
  leaveRoom: () => void;
  toggleMic: () => void;
  isMicActive: boolean;
}

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

export const VoiceRoomProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeRoom, setActiveRoom] = useState<VoiceRoomId | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMicActive, setIsMicActive] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'openai'>('gemini');

  // Client references
  const geminiClientRef = useRef<GeminiLiveClient | null>(null);
  const openaiClientRef = useRef<OpenAIRealtimeClient | null>(null);

  const { getVoiceProfile } = useRealtimeConfig();

  // Load provider preference
  useEffect(() => {
    const cfg = modelConfigService.getAssignment('voice');
    setActiveProvider(cfg.provider);
  }, []);

  const getSystemInstructions = (roomId: VoiceRoomId): string => {
    const base = "You are the AI Trading Squad. You speak as a cohesive team led by the Desk Coordinator. ";
    
    switch (roomId) {
      case 'desk':
        return base + "You are on the Trading Floor. You have full access to desk state, market data, and agents. Your goal is to coordinate the session. Use 'desk_roundup' to change desk status or goals.";
      case 'autopilot':
        return base + "You are in the Autopilot Engine Room. Focus heavily on risk parameters, execution logic, and trade proposals. Use 'get_autopilot_proposal' to calculate risk.";
      case 'journal':
        return base + "You are in the Coaching Room. Focus on performance review, psychology, and lessons learned. Use 'log_trade_journal' to record outcomes.";
      default:
        return base;
    }
  };

  const joinRoom = async (roomId: VoiceRoomId) => {
    if (activeRoom === roomId && connectionStatus === 'connected') return;
    
    leaveRoom();
    
    setConnectionStatus('connecting');
    setActiveRoom(roomId);

    const voiceConfig = modelConfigService.getAssignment('voice');
    setActiveProvider(voiceConfig.provider);

    try {
      if (voiceConfig.provider === 'gemini') {
        const tools = GEMINI_ROOM_TOOLS[roomId] || [];
        
        const client = new GeminiLiveClient({
          model: voiceConfig.model || 'models/gemini-2.5-flash-live',
          voiceName: getVoiceProfile('strategist').geminiPreset || 'Aoede',
          systemInstruction: getSystemInstructions(roomId),
          tools: tools,
          onSetupComplete: () => {
            setConnectionStatus('connected');
            logger.info(`Joined Voice Room: ${roomId} (Gemini)`);
          },
          onError: (err) => {
            console.error("Voice Room Error", err);
            setConnectionStatus('error');
          },
          onToolCall: async (calls) => {
             // Use shared tool handler logic
             if (geminiClientRef.current) {
                await handleGeminiToolCall({ 
                    sendToolResponse: (p) => geminiClientRef.current?.sendToolResponse(p.toolResponse.functionResponses as any) 
                }, { functionCalls: calls as any });
             }
          }
        });
        geminiClientRef.current = client;
        await client.connect();
      } else {
        // OpenAI Logic
        const wsUrl = (import.meta as any).env?.VITE_OPENAI_REALTIME_URL;
        if (!wsUrl) throw new Error("OpenAI Realtime URL not configured");

        const tools = OPENAI_ROOM_TOOLS[roomId] || [];

        const client = new OpenAIRealtimeClient({
          url: wsUrl,
          voice: getVoiceProfile('strategist').openaiVoice || 'alloy',
          instructions: getSystemInstructions(roomId),
          tools: tools,
          events: {
            onOpen: () => {
              setConnectionStatus('connected');
              logger.info(`Joined Voice Room: ${roomId} (OpenAI)`);
            },
            onError: (err) => {
              console.error("Voice Room Error", err);
              setConnectionStatus('error');
            },
            onClose: () => {
               setConnectionStatus('disconnected');
            }
          }
        });
        openaiClientRef.current = client;
        client.connect();
      }
    } catch (e) {
      console.error("Failed to join voice room", e);
      setConnectionStatus('error');
      setActiveRoom(null);
    }
  };

  const leaveRoom = () => {
    if (geminiClientRef.current) {
      geminiClientRef.current.close();
      geminiClientRef.current = null;
    }
    if (openaiClientRef.current) {
      openaiClientRef.current.close();
      openaiClientRef.current = null;
    }
    setActiveRoom(null);
    setConnectionStatus('disconnected');
    setIsMicActive(false);
  };

  const toggleMic = () => {
    // This state is consumed by the UI components (GeminiVoicePanel) to actually trigger audio API
    setIsMicActive(!isMicActive);
  };

  return (
    <VoiceRoomContext.Provider value={{
      activeRoom,
      isActive: connectionStatus === 'connected',
      provider: activeProvider,
      connectionStatus,
      joinRoom,
      leaveRoom,
      toggleMic,
      isMicActive
    }}>
      {children}
    </VoiceRoomContext.Provider>
  );
};

export const useVoiceRoom = () => {
  const ctx = useContext(VoiceRoomContext);
  if (!ctx) throw new Error("useVoiceRoom must be used within VoiceRoomProvider");
  return ctx;
};
