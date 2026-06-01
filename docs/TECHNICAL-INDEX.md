# CLAUDE.md — AssistantX & Jarvis Technical Index

## 🛠️ Operational Reference Commands

### Module A: AssistantX (Cloud Native Platform)
- **Local Hot-Reload Server:** `npm run dev:next` (Inicjalizuje środowisko deweloperskie Next.js 16)
- **Production Compilation:** `npm run build` (Generuje zoptymalizowane statyczne assety oraz standalone server build)
- **Strict Code Auditing:** `npm run lint` (Uruchamia statyczną analizę kodu za pomocą ESLint)

### Module B: Jarvis Desktop & Natywne Podsystemy
- **End-to-End Test Matrix:** `npx playwright test` (Uruchamia testy automatyzacji interfejsu; konfiguracja: `playwright.config.ts`, testy: `e2e/`)
- **Unit & Integration Suite:** `npm test` (Wykonuje testy logiki biznesowej za pomocą Jest na podstawie kryteriów z `jest.config.ts`)
- **Rust Power Guard Compilation:** `cd jarvis/power-guard && cargo build --release` (Generuje niskopoziomowy plik wykonywalny dla Windows)

### Module C: Containerization & Infrastructure Deployment
- **Monolith Frontend Image:** `docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=$URL --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$KEY -t assistantx-frontend .`
- **FastAPI Core AI Service:** `cd "ai agent" && docker build -t assistantx-python-backend .`
- **Jarvis Server Sidecar:** `cd jarvis/server/agent && docker build -t jarvis-linux-runtime .`

---

## 🏗️ Technology Stack Ledger

### ASSISTANTX
- **Core Engine:** Next.js 16 (App Router Core), React 19, TypeScript.
- **Styling Architecture:** Tailwind CSS v4 połączony z architekturą tokenów `@tailwindcss/postcss`.
- **UI Components:** Radix UI primitives zbudowane w oparciu o specyfikację `shadcn` (`components.json`).
- **Data Persistence:** Supabase SSR (Baza danych, mechanizmy uwierzytelniania, polityki RLS).

### JARVIS
- **Shell Application:** Electron Framework (Node.js & JavaScript Integration).
- **Audio & ML Pipeline:** Python 3.12/3.14 (`openwakeword`, `silero-vad`, `onnxruntime`, `kokoro`).
- **Natywny Interfejs OS:** Rust Core (`windows-sys` do bezpośredniej manipulacji przerwaniami zasilania Win32).
- **Lokalny Silnik Wektorowy:** LanceDB połączony z biblioteką `sentence-transformers` do reprezentacji wektorowych bazy kodu.

---

## 📜 Uncompromising Development Guardrails

1. **Next.js 16 Breaking API Pattern:** Bezwzględnie weryfikuj zasoby w `node_modules/next/dist/docs/` przed implementacją funkcji routingu. Next.js 16 wprowadza głębokie zmiany w architekturze Server Components, uniemożliwiające stosowanie starszych wzorców middleware i pobierania danych.
2. **FastAPI Legacy Bridge Freeze:** Plik `src/backend/runtime/legacy/fastapi-bridge.ts` posiada flagę `frozen: true`. Jakiekolwiek modyfikacje deweloperskie w tym pliku are zabronione. Nowe zachowania autonomiczne muszą być implementowane wyłącznie w ekosystemie Node/TypeScript (`src/agents/runtime/`).
3. **Container Secret Isolation:** Klucze publiczne Supabase (`NEXT_PUBLIC_*`) są osadzane w kodzie klienta podczas kompilacji (Dockerfile `ARG`). Wrażliwe dane dostępowe, takie jak `OPENROUTER_API_KEY`, `GROQ_API_KEY` oraz `STRIPE_SECRET_KEY`, kategorycznie nie mogą być przekazywane w procesie budowania obrazu. Muszą być wstrzykiwane w runtime kontenera za pomocą flagi `docker run -e` lub systemów zarządzania sekretami orkiestratora.
4. **Desktop Automation OS Safety:** Każda operacja zapisu na plikach deweloperskich generowana przez sztuczną inteligencję (np. `runCoder`) przed uruchomieniem kodu w systemie operacyjnym musi przejść przez dwuetapową walidację: analizę wzorców destrukcyjnych w `command-sanitizer.js` oraz weryfikację struktury nagłówków w `patch-validator.js`.
