# Jarvis multi-model routing

## Overview

Before the 2026-06 refactor, every Jarvis prompt — chat, code, vision,
deep-research — was sent to the coding model (`qwen2.5-coder:14b`). This
caused three problems:

1. Casual conversation got code-flavoured responses and overlong code-block
   wrapping.
2. Simple coding tasks paid the latency of a large model, while complex
   multi-file work hit the same model with no escalation path.
3. Vision and reasoning intents were silently downgraded to the coder model
   with no image support and no chain-of-thought capacity.

The router now has six lanes; the right one is chosen per request from a
combination of keyword signals, image presence, and complexity heuristics.

## Lanes

| Slot         | Purpose                                  | Local default (standard tier) | Cloud fallback           |
| ------------ | ---------------------------------------- | ----------------------------- | ------------------------ |
| `chat`       | Casual conversation, quick replies       | `gemma3:4b`                   | `llama-3.3-70b-versatile`|
| `code`       | Standard coding tasks                    | `qwen2.5-coder:7b`            | `qwen-2.5-coder-32b`     |
| `code_heavy` | Complex/multi-file coding                | `qwen2.5-coder:14b`           | `openai/gpt-4o`          |
| `reasoning`  | Deep research, multi-step thinking       | `deepseek-r1:8b`              | `deepseek/deepseek-r1`   |
| `vision`     | Image / screen input                     | `moondream2:1.4b`             | `gemini-2.0-flash`       |
| `router`     | Fast intent helper (not user-facing)     | `qwen2.5:1.5b`                | n/a                      |

Each hardware tier (`eco` / `standard` / `pro`) declares its own dispatch
table in `runtime-config.js` → `HARDWARE_PROFILE_MODELS`. The user's
wizard-selected LLM and vision models override the `chat` and `vision`
slots respectively.

When the preferred model isn't installed locally, the policy walks down
`SLOT_FALLBACK_CHAIN` (`code_heavy → code → chat`, `reasoning → code_heavy
→ code → chat`) instead of failing the request. Vision intentionally has
**no text fallback**: if no local vision model exists we route to a cloud
vision model rather than letting a text model hallucinate about an unseen
image.

## Selection criteria

The analyzer (`analyzer.js → analyzeRequest`) classifies each request
along several axes:

- **Intent** — the strongest of `code`, `vision`, `tool`, `memory`,
  `reasoning`, `chat` (fallback). Keyword patterns live in
  `INTENT_PATTERNS`.
- **Image attachment** — anything with `images: [...]` boosts vision by
  +2 even when keywords are inconclusive ("what's wrong here?" plus a
  screenshot is a vision request).
- **Secondary intent** — when an image is attached we re-classify the
  prompt with vision keywords excluded to detect the underlying ask
  ("write the TypeScript class shown in this screenshot" → vision
  primary, code secondary).
- **Complexity / coding depth / context size** — derived from prompt
  length and code-architecture keywords.
- **Heavy-coding** — `HEAVY_CODE_HINTS` (architecture, race conditions,
  memory leaks, whole-codebase refactors).
- **Priority** — voice + urgent prompts get higher priority for the
  internal scheduler.

The policy (`policy.js → decideRoute`) then walks an escalation ladder:

- `chat` + escalation triggers → `reasoning`
- `code` + escalation OR heavy-coding → `code_heavy`

Escalation triggers: confidence < 0.55, retry > 0, context_size huge,
codingDepth `architecture`, complexity hard, or priority ≥ 85.

## Vision → LLM relay

When the primary intent is `vision` but the secondary intent is `code`,
`chat`, or `reasoning`, the route includes a `relay` block. The router
(`index.js`) executes a two-stage call:

1. **Stage 1 — describe.** The vision model is asked to describe the
   image precisely: layout, visible text, UI elements, code, anything
   unusual. The user's original prompt is included so the description
   stays focused.
2. **Stage 2 — answer.** The secondary model (chat or coder) receives
   the original prompt with the vision description appended as
   grounded context. The image bytes are NOT forwarded — the text model
   answers from the description.

This gives screenshot-driven code work an actual code model and
screenshot-driven conversation an actual conversational model, without
needing one mega-model that can do both.

## How to add a new lane

1. Add the slot to every tier's `dispatch` table in
   `runtime-config.js → HARDWARE_PROFILE_MODELS`.
2. Add the slot to `DEFAULT_DISPATCH` in `policy.js`.
3. Add a fallback chain entry in `SLOT_FALLBACK_CHAIN`.
4. If the lane carries a new user-facing intent, add an entry to
   `INTENT_PATTERNS` (analyzer.js) and `INTENT_TO_SLOT` (policy.js).
5. Add cloud fallbacks to the `matrix` in `policy.js → resolveCloudModel`.
6. Cover the new lane in `__tests__/jarvis/ai-router-policy.test.js`.
