
import React from 'react';
import { useVoiceRoom, VoiceRoomId } from '../context/VoiceRoomContext';
import { useRealtimeConfig } from '../context/RealtimeConfigContext';

const VoiceRoomBar: React.FC = () => {
  const { activeRoom, joinRoom, leaveRoom, connectionStatus, provider } = useVoiceRoom();
  const { theme } = useRealtimeConfig();

  const handleRoomClick = (room: VoiceRoomId) => {
    if (activeRoom === room) {
      leaveRoom();
    } else {
      joinRoom(room);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#161a25] border-b border-gray-800">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
            {connectionStatus === 'connected' ? `Live: ${activeRoom?.toUpperCase()}` : 'Voice Offline'}
          </span>
        </div>
        
        <div className="h-4 w-[1px] bg-gray-700" />

        <div className="flex gap-1">
          {(['desk', 'autopilot', 'journal'] as VoiceRoomId[]).map(room => (
            <button
              key={room}
              onClick={() => handleRoomClick(room)}
              className={`px-3 py-1 text-[10px] uppercase font-bold rounded transition-all ${
                activeRoom === room 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
              }`}
            >
              {room}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded">
           <span className="uppercase font-semibold text-gray-400">Model:</span>
           <span className="text-blue-400">{provider === 'gemini' ? 'Gemini 2.5 Live' : 'OpenAI Realtime'}</span>
        </div>
        <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded">
           <span className="uppercase font-semibold text-gray-400">Theme:</span>
           <span className="text-purple-400 capitalize">{theme}</span>
        </div>
      </div>
    </div>
  );
};

export default VoiceRoomBar;
