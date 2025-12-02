
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseVoiceInputOptions {
  lang?: string;
  continuous?: boolean;
}

export interface VoiceState {
  isSupported: boolean;
  isRecording: boolean;
  transcript: string;
  error: string | null;
}

export interface UseVoiceInputResult extends VoiceState {
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useVoiceInput(
  options: UseVoiceInputOptions = {},
): UseVoiceInputResult {
  const { lang = 'en-US', continuous = false } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event);
      setError(event.error || 'Speech recognition error');
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      setTranscript(prev => {
        if (continuous) {
          return (prev + ' ' + finalTranscript).trim();
        }
        return finalTranscript.trim();
      });
    };

    recognitionRef.current = recognition;
    setIsSupported(true);

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [lang, continuous]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      setTranscript('');
      recognitionRef.current.start();
    } catch (err) {
      console.error(err);
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error(err);
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isRecording,
    transcript,
    error,
    start,
    stop,
    reset,
  };
}
