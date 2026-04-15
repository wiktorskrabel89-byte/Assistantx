"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SPEECH_RECOGNITION_LOCALES } from "../lib/chat-state";
import type { BrowserWindow, SpeechRecognitionLike } from "../lib/chat-types";

type UseSpeechInputArgs = {
  languageLock: string;
  message: string;
  onMessageChange: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
};

export function useSpeechInput({
  languageLock,
  message,
  onMessageChange,
  inputRef,
}: UseSpeechInputArgs) {
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const getSpeechRecognitionConstructor = useCallback(() => {
    if (typeof window === "undefined") return null;
    const browserWindow = window as BrowserWindow;
    return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
  }, []);

  const stopSpeechInput = useCallback(() => {
    speechRecognitionRef.current?.stop();
  }, []);

  const toggleSpeechInput = useCallback(() => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechError("Speech-to-text is only available in supported browsers like Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    const baseMessage = message.trimEnd();

    setSpeechError(null);
    setListening(true);

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = SPEECH_RECOGNITION_LOCALES[languageLock] ?? SPEECH_RECOGNITION_LOCALES.auto;
    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) finalTranscript += `${transcript} `;
        else interimTranscript += `${transcript} `;
      }

      const combinedTranscript = `${finalTranscript}${interimTranscript}`.trim();
      if (!combinedTranscript) return;

      onMessageChange(baseMessage ? `${baseMessage} ${combinedTranscript}`.trim() : combinedTranscript);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "not-allowed") {
        setSpeechError("Microphone access was denied.");
        return;
      }
      if (event.error === "no-speech") {
        setSpeechError("No speech was detected.");
        return;
      }
      setSpeechError("Speech recognition failed.");
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setListening(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
  }, [getSpeechRecognitionConstructor, inputRef, languageLock, message, onMessageChange]);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
    };
  }, []);

  return {
    listening,
    speechError,
    setSpeechError,
    stopSpeechInput,
    toggleSpeechInput,
  };
}