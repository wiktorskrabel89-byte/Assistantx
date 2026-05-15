# Assistantx Final AI + Voice Architecture Plan

## Goal

Build a fast, modular, realtime Jarvis-style assistant with:
- low-latency voice interaction
- desktop automation
- intelligent AI routing
- scalable cloud reasoning
- lightweight local runtime
- future-ready architecture

## Core AI architecture

### Fast conversational AI layer
- Provider: Groq
- Model: Alibaba Cloud Qwen 32B
- Responsibilities:
  - realtime conversations
  - voice assistant interactions
  - desktop commands
  - tool calling
  - memory interactions
  - lightweight coding
  - assistant personality
  - UI chat
  - fast responses

### Deep reasoning layer
- Provider: OpenRouter
- Model class: GPT 120B-class reasoning model
- Responsibilities:
  - deep reasoning
  - long coding sessions
  - architecture planning
  - autonomous workflows
  - research synthesis
  - advanced debugging
  - multi-agent orchestration

## Intelligent routing system

### Routing strategy
- Simple/realtime tasks → Qwen 32B via Groq
- Complex reasoning tasks → GPT 120B via OpenRouter

### Escalation pipeline
User request → task analyzer → complexity scoring → route to Qwen 32B or GPT 120B.

### Routing conditions
- Route to Qwen:
  - normal chat
  - voice interaction
  - app launching
  - desktop commands
  - memory retrieval
  - quick coding
  - automation execution
  - UI interactions
- Route to GPT 120B:
  - difficult reasoning
  - workflow planning
  - advanced coding
  - debugging
  - long-context tasks
  - autonomous agent tasks

## Voice stack

### Wake word detection (local)
- Model: OpenWakeWord
- Detection phrases:
  - "Hey Assistant"
  - "Jarvis"
- Why local:
  - instant activation
  - offline capability
  - low CPU usage
  - avoids continuous cloud streaming

### Voice activity detection (local)
- Model: Silero VAD
- Responsibilities:
  - speech start detection
  - speech end detection
- Why local:
  - lower bandwidth usage
  - cleaner audio chunks
  - reduced API usage
  - faster responsiveness

### Speech-to-text (remote)
- Provider: Groq
- Model: Whisper Large v3
- Responsibilities:
  - voice commands
  - realtime transcription
  - assistant conversations
  - dictation
  - automation control

### Text-to-speech (remote)
- Provider: Groq
- Engine: Groq speech/TTS API stack
- Responsibilities:
  - assistant replies
  - confirmations
  - automation feedback
  - realtime speech output

## Realtime audio pipeline

Microphone → OpenWakeWord → Silero VAD → Groq Whisper STT → Qwen 32B (Groq) → optional escalation to GPT 120B (OpenRouter) → Groq TTS → speaker output.

## Streaming architecture requirement

Do not use buffered full-turn processing.

Use continuous streaming with:
- partial STT
- realtime reasoning
- immediate response start

## Runtime architecture

Recommended runtime layers:
- Electron app (UI/system layer)
- Node realtime gateway (orchestration/routing/session/provider abstraction)
- Python AI sidecar (local audio + wake/VAD + helpers)

### Electron responsibilities
- overlays
- tray
- desktop automation
- app launching
- notifications
- settings
- realtime UI

### Node gateway responsibilities
- WebSockets
- IPC routing
- session management
- AI routing
- provider abstraction
- streaming coordination
- failover handling

### Python sidecar responsibilities
- wake word
- VAD
- audio preprocessing
- audio streaming
- local NLP utilities
- embeddings
- automation helpers

## Local vs remote processing

| Component | Local | Remote |
| --- | --- | --- |
| Wake word | yes | no |
| VAD | yes | no |
| Desktop automation | yes | no |
| Audio preprocessing | yes | no |
| Whisper STT | no | Groq |
| Qwen 32B | no | Groq |
| GPT 120B | no | OpenRouter |
| TTS | no | Groq |

## Performance targets

| Feature | Target |
| --- | --- |
| Wake word detection | <100ms |
| Speech detection | <50ms |
| Partial STT | <300ms |
| Assistant response start | <500ms |
| TTS playback start | <200ms |

## Privacy strategy

Local:
- wake word
- VAD
- automation
- audio preprocessing

Remote:
- STT
- AI reasoning
- TTS

## Packaging strategy

Bundle locally:
- wake word models
- VAD models
- audio runtime

Use remote APIs for:
- Groq
- OpenRouter

No heavy local AI models are required initially.

## Rollout guardrails

- Active implementation phase remains critical + near-term stabilization only.
- Product expansion remains future/experimental and non-blocking.
- Telemetry remains local-only by default; remote diagnostics must stay explicit opt-in.
