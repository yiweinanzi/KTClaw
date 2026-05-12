import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseSpeechRecognitionOptions {
  /** Language tag, default 'zh-CN' */
  lang?: string;
  /** Called with partial/interim transcript during speech */
  onInterim?: (transcript: string) => void;
  /** Called with final transcript when utterance completes or stop() is called */
  onResult?: (transcript: string) => void;
  /** Called on recognition error, permission denial, or nomatch */
  onError?: (error: string) => void;
}

export interface UseSpeechRecognitionReturn {
  /** Whether recognition is currently active */
  isListening: boolean;
  /** Whether browser supports SpeechRecognition API */
  isSupported: boolean;
  /** Request mic permission and start listening */
  start: () => void;
  /** Stop listening and finalize */
  stop: () => void;
}

export function useSpeechRecognition({
  lang = 'zh-CN',
  onInterim,
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isManualStopRef = useRef(false);

  // Check SpeechRecognition API support on mount
  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionCtor);
  }, []);

  const cleanup = useCallback(() => {
    // Abort recognition if active
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    // Stop microphone stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, []);

  const stop = useCallback(() => {
    isManualStopRef.current = true;
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      onError?.('not-supported');
      return;
    }

    // Request microphone permission first (triggers Electron main process permission gate)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (err: any) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        onError?.('permission-denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        onError?.('no-microphone');
      } else {
        onError?.(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    isManualStopRef.current = false;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        onResult?.(final);
      } else if (interim) {
        onInterim?.(interim);
      }
    };

    recognition.onerror = (event: any) => {
      // 'end' event will fire after 'error' — cleanup handles it
      // Do NOT call stop() here to avoid double-cleanup race
      onError?.(event.error);
    };

    recognition.onnomatch = () => {
      onError?.('nomatch');
    };

    recognition.onend = () => {
      // If recognition ended on its own (not manual stop) and no error was reported,
      // treat any accumulated interim as final? No — Chromium fires onresult with isFinal=true
      // before onend, so onResult is already called.
      cleanup();
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [lang, onInterim, onResult, onError, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { isListening, isSupported, start, stop };
}
