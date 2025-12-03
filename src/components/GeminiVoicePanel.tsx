
import React, { useEffect, useRef, useState } from "react";
import { useVoiceRoom } from "../context/VoiceRoomContext";
import { voiceBus } from "../services/voiceBus";

const GEMINI_TARGET_SAMPLE_RATE = 16000;

const GeminiVoicePanel: React.FC = () => {
  const { geminiClient, isMicActive, toggleMic } = useVoiceRoom();
  const [log, setLog] = useState<string[]>([]);
  const [userInput, setUserInput] = useState("");

  // Mic state management
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pushLog = (line: string) => {
    setLog((prev) => [...prev, line].slice(-300));
  };

  // Subscribe to client events
  useEffect(() => {
    if (!geminiClient) {
        if (log[log.length-1] !== "⚠️ No active voice session.") {
            pushLog("⚠️ No active voice session.");
        }
        return;
    }

    pushLog("✅ Monitoring active voice session...");

    const cleanupText = geminiClient.on('text', ({ text, isFinal }) => {
        pushLog(`AI: ${text}${isFinal ? " (final)" : ""}`);
    });
    
    const cleanupError = geminiClient.on('error', (err) => {
        pushLog(`⚠️ Error: ${String((err as any)?.message ?? err)}`);
    });

    const cleanupTool = geminiClient.on('toolCall', (calls: any[]) => {
        calls.forEach(c => pushLog(`🛠 ToolCall → ${c.name}`));
    });

    return () => {
        cleanupText();
        cleanupError();
        cleanupTool();
    };
  }, [geminiClient]);

  // Handle Mic Toggle
  useEffect(() => {
      if (isMicActive) startMic();
      else stopMic();
      
      return () => stopMic(); // Cleanup on unmount/change
  }, [isMicActive]);

  const handleSend = () => {
    const text = userInput.trim();
    if (!text || !geminiClient) return;
    
    // Stop AI speech to listen to user
    voiceBus.stop();
    
    pushLog(`You: ${text}`);
    geminiClient.sendUserText(text, true);
    setUserInput("");
  };

  const startMic = async () => {
    if (!geminiClient || !geminiClient.isConnected) return;

    try {
      voiceBus.stop(); // Stop AI audio

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const audioCtx = new AudioContext({ sampleRate: GEMINI_TARGET_SAMPLE_RATE });
      await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!geminiClient || !geminiClient.isConnected) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          let s = input[i];
          if (s > 1) s = 1; else if (s < -1) s = -1;
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        geminiClient.sendRealtimeAudio(pcm16);
      };

      audioCtxRef.current = audioCtx;
      processorRef.current = processor;
      streamRef.current = stream;
      pushLog("🎙️ Mic streaming started");
    } catch (err) {
      console.error("Mic start error", err);
      pushLog(`⚠️ Mic error: ${String((err as any)?.message ?? err)}`);
      toggleMic(); // reset toggle UI
    }
  };

  const stopMic = () => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (isMicActive) pushLog("⏹️ Mic streaming stopped");
  };

  return (
    <div className="flex flex-col h-full bg-[#161a25] text-xs p-4 rounded border border-[#2a2e39]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
        <div className="flex flex-col">
            <span className="font-bold text-sm text-gray-200">Gemini Live Visualizer</span>
            <span className="text-[10px] text-gray-500">Shared Session Monitor</span>
        </div>
        <div>
            <button
                className={
                    "px-2 py-1 rounded text-[10px] " +
                    (isMicActive ? "bg-red-600/80 animate-pulse text-white" : "bg-emerald-600/80 text-white")
                }
                onClick={toggleMic}
                disabled={!geminiClient}
            >
                {isMicActive ? "Stop Mic" : "Start Mic"}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0a0c10] border border-gray-800 rounded p-2 space-y-1 font-mono text-gray-300 min-h-[150px]">
        {log.map((line, idx) => (
          <div key={idx} className="break-words">{line}</div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 bg-[#0a0c10] border border-gray-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#2962ff]"
          placeholder="Type message to room..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={!geminiClient}
        />
        <button
          className="px-3 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-xs font-bold disabled:opacity-50"
          onClick={handleSend}
          disabled={!geminiClient}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default GeminiVoicePanel;
