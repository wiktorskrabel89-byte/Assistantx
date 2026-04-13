"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE_LANGUAGE_OPTIONS } from "@/lib/ai-config";

type Status = "connecting" | "ready" | "user_speaking" | "agent_speaking" | "error";
type TranscriptEntry = { role: "user" | "agent"; text: string };

function buildInstructions(language: string) {
  const selected = VOICE_LANGUAGE_OPTIONS.find((option) => option.code === language) ?? VOICE_LANGUAGE_OPTIONS[0];
  const languageInstruction = selected.code === "auto"
    ? "Detect the user's language after they speak and always answer only in that same language for the whole conversation."
    : `${selected.instruction} Do not switch to any other language unless the user explicitly asks you to.`;

  return `You are a helpful voice assistant. Wait for the user to speak first. Do not greet or say anything until the user speaks. ${languageInstruction} Be concise, natural, and friendly.`;
}

function buildSessionUpdate(language: string) {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: "google-ai-studio/gemini-2.5-flash",
      instructions: buildInstructions(language),
      output_modalities: ["audio", "text"],
      audio: {
        input: {
          transcription: { model: "assemblyai/u3-rt-pro" },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { model: "inworld-tts-1.5-max", voice: "Abby" },
      },
    },
  };
}

export function VoiceModal({
  onClose,
  dark,
  language,
  onLanguageChange,
}: {
  onClose: () => void;
  dark: boolean;
  language: string;
  onLanguageChange: (language: string) => void;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(buildSessionUpdate(language)));
    }
  }, [language]);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let micStream: MediaStream | null = null;
    let processor: ScriptProcessorNode | null = null;
    const playbackQueue: Float32Array<ArrayBuffer>[] = [];
    let isPlaying = false;
    let currentSource: AudioBufferSourceNode | null = null;
    let agentBuf = "";

    const stopPlayback = () => {
      playbackQueue.length = 0;
      try { currentSource?.stop(); } catch { /* already stopped */ }
      currentSource = null;
      isPlaying = false;
    };

    const playNextChunk = () => {
      if (!audioCtx || playbackQueue.length === 0) {
        isPlaying = false;
        return;
      }
      isPlaying = true;
      const samples = playbackQueue.shift()!;
      const buffer = audioCtx.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      currentSource = src;
      src.onended = playNextChunk;
      src.start();
    };

    const enqueueAudio = (base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length) as Float32Array<ArrayBuffer>;
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
      playbackQueue.push(float32);
      if (!isPlaying) playNextChunk();
    };

    const startMic = async (ws: WebSocket) => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        audioCtx = new AudioContext({ sampleRate: 24000 });
        const source = audioCtx.createMediaStreamSource(micStream);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        const sampleRatio = audioCtx.sampleRate / 24000;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const outLen = Math.floor(input.length / sampleRatio);
          const pcm16 = new Int16Array(outLen);
          for (let i = 0; i < outLen; i++) {
            const s = input[Math.floor(i * sampleRatio)];
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
          }
          const bytes = new Uint8Array(pcm16.buffer);
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(bin) }));
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(`Mic error: ${msg}`);
        setStatus("error");
      }
    };

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/realtime`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case "session.created":
          ws.send(JSON.stringify(buildSessionUpdate(language)));
          break;

        case "session.updated":
          setStatus("ready");
          startMic(ws);
          break;

        case "input_audio_buffer.speech_started":
          setStatus("user_speaking");
          stopPlayback();
          ws.send(JSON.stringify({ type: "response.cancel" }));
          agentBuf = "";
          setTranscript((prev) => [...prev, { role: "user", text: "…" }]);
          break;

        case "conversation.item.input_audio_transcription.delta":
          if (typeof msg.delta === "string") {
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "user") {
                const current = last.text === "…" ? msg.delta : last.text + msg.delta;
                return [...prev.slice(0, -1), { role: "user", text: current as string }];
              }
              return [...prev, { role: "user", text: msg.delta as string }];
            });
          }
          break;

        case "conversation.item.input_audio_transcription.completed":
          if (typeof msg.transcript === "string") {
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "user") {
                return [...prev.slice(0, -1), { role: "user", text: msg.transcript as string }];
              }
              return [...prev, { role: "user", text: msg.transcript as string }];
            });
          }
          break;

        case "response.output_audio.delta":
          setStatus("agent_speaking");
          if (typeof msg.delta === "string") enqueueAudio(msg.delta);
          break;

        case "response.output_audio_transcript.delta":
          if (typeof msg.delta === "string") {
            agentBuf += msg.delta;
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "agent") return [...prev.slice(0, -1), { role: "agent", text: agentBuf }];
              return [...prev, { role: "agent", text: agentBuf }];
            });
          }
          break;

        case "response.done":
          setStatus("ready");
          agentBuf = "";
          break;

        case "error": {
          const errObj = msg.error as { message?: string } | undefined;
          const errMsg = errObj?.message || (typeof msg.message === "string" ? msg.message : "Inworld error");
          setErrorMsg(errMsg);
          setStatus("error");
          break;
        }

        default:
          break;
      }
    };

    ws.onerror = () => {
      setErrorMsg(
        window.location.hostname.endsWith("vercel.app")
          ? "Voice mode doesn't work on Vercel (serverless). Deploy to Northflank/Render or run locally."
          : "WebSocket connection failed. Make sure the server is running."
      );
      setStatus("error");
    };

    return () => {
      ws.close();
      wsRef.current = null;
      processor?.disconnect();
      audioCtx?.close();
      micStream?.getTracks().forEach((track) => track.stop());
      stopPlayback();
    };
  }, [language]);

  const statusLabel: Record<Status, string> = {
    connecting: "Connecting…",
    ready: "Listening — speak naturally",
    user_speaking: "You're speaking…",
    agent_speaking: "Agent speaking…",
    error: errorMsg,
  };

  const dotColor: Record<Status, string> = {
    connecting: "bg-gray-400 animate-pulse",
    ready: "bg-green-400",
    user_speaking: "bg-blue-400 animate-pulse",
    agent_speaking: "bg-purple-400 animate-pulse",
    error: "bg-red-400",
  };

  const textColor: Record<Status, string> = {
    connecting: "text-gray-400",
    ready: "text-green-400",
    user_speaking: "text-blue-400",
    agent_speaking: "text-purple-400",
    error: "text-red-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className={`relative w-full max-w-xl mx-4 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl ${dark ? "bg-gray-900 border border-gray-700" : "bg-white border border-gray-200"}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Voice Mode</h2>
            <p className="text-xs text-gray-500 mt-1">Realtime speech with language-aware replies.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-400 text-xl leading-none transition-colors">✕</button>
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Voice language</span>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-sm ${dark ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`}
          >
            {VOICE_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className={`flex items-center gap-2 text-sm font-medium ${textColor[status]}`}>
          <span className={`w-2.5 h-2.5 rounded-full inline-block flex-shrink-0 ${dotColor[status]}`} />
          <span className="truncate">{statusLabel[status]}</span>
        </div>

        <div className={`min-h-[240px] max-h-80 overflow-y-auto rounded-xl p-3 flex flex-col gap-2 ${dark ? "bg-gray-800" : "bg-gray-50"}`}>
          {transcript.length === 0 && (
            <p className="text-center text-gray-400 text-sm mt-12">Conversation will appear here…</p>
          )}
          {transcript.map((item, index) => (
            <div
              key={index}
              className={`text-sm px-3 py-2 rounded-xl max-w-[85%] ${
                item.role === "user"
                  ? "bg-blue-500 text-white self-end rounded-tr-sm"
                  : `self-start rounded-tl-sm ${dark ? "bg-gray-700 text-gray-100" : "bg-white border text-gray-800"}`
              }`}
            >
              {item.text}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        <p className="text-xs text-gray-500 text-center">
          Choose a fixed language or leave auto-detect on. The assistant will keep using that language for the whole voice conversation.
        </p>
      </div>
    </div>
  );
}