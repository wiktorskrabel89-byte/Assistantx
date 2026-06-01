# Comprehensive System Requirements & Specifications

Dokumentacja wymagań technicznych i niefunkcjonalnych dla systemów AssistantX i Jarvis.

---

## 🔑 ASSISTANTX: Cloud & Web Platform Specifications

### Wymagania Funkcjonalne
1. **Dynamic Temporal Injection:** Broker kontekstu w chmurze musi automatycznie generować segment `[TEMPORAL_CONTEXT]` podczas kompilowania promptów dla modeli AI. Musi wstrzykiwać zwalidowane dane o czasie (`iso`, `timezone`, `weekday`, `hour`, `period`) w celu dopasowania zachowania modelu (np. generowanie ostrzeżeń w nocy).
2. **MCP Sandbox & Scope Enforcement:** Silnik orkiestracji platformy musi rygorystycznie sprawdzać zakresy uprawnień wtyczek zdefiniowane w `manifest.ts` (`PluginPermissionScope`). Próba wykonania operacji wykraczającej poza przyznany zakres (np. zapis do pamięci bez uprawnienia `memory:write`) musi skutkować natychmiastowym przerwaniem operacji.
3. **Prompt Injection Moderation Filter:** Wszystkie przychodzące zapytania na czacie w `app/api/chat/route.ts` muszą przechodzić przez synchroniczny filtr regex (`BLOCKED_PATTERNS`). Wykrycie prób obejścia zabezpieczeń (np. *jailbreak*, *dan mode*, *disregard previous instructions*) musi skutkować natychmiastowym przerwaniem przetwarzania z kodem błędu bezpieczeństwa.

### Wymagania Niefunkcjonalne i Infrastruktura
- **Środowisko Uruchomieniowe:** Next.js 16 (wymaga środowiska Node.js `>= 22` lokalnie oraz w obrazach Docker `node:26-bookworm-slim`).
- **Architektura Bazy Danych:** Supabase PostgreSQL z obsługą rozszerzenia pgvector. Operacje aktualizacji liczników użycia pamięci podręcznej wiedzy muszą być wykonywane atomowo po stronie serwera SQL za pomocą zdefiniowanych funkcji SQL (`increment_qa_cache_usage` z flagą `security definer`). Zapobiega to powstawaniu zakleszczeń (Race Conditions) i zjawisk typu read-then-write w kodzie aplikacji Next.js.

---

## 💻 JARVIS: Native Desktop & Edge Runtime Specifications

### Wymagania Funkcjonalne
1. **Passive Edge Wake Word Processing:** Podsystem audio Jarvis Sidecar musi nieustannie przetwarzać sygnał z mikrofonu lokalnie, bez generowania ruchu sieciowego do chmury. Przesłanie danych do zewnętrznego STT może nastąpić wyłącznie po poprawnym dopasowaniu profilu akustycznego hasła przez `openwakeword`.
2. **Deterministic Agent State Machine:** W trybie deweloperskim `multi_agent_beta` proces orkiestratora musi zarządzać stanem pętli agentowej w tabeli `ai_tasks` (`agent_loop_status`). Agent deweloperski musi przechodzić sekwencyjnie przez stany: `idle` -> `architect` -> `coder` -> `tester` -> `security` -> `done`. Pętla może zostać sfinalizowana tylko wtedy, gdy plik wyników testów (`test-results/.last-run.json`) wskaże status `"passed"`.
3. **Execution Command Sanitization Barrier:** Narzędzie wykonawcze terminala w Electronie przed uruchomieniem kodu przesłanego przez LLM musi zweryfikować parametry funkcją `containsDangerousCommand`. Wykrycie niedozwolonych instrukcji systemowych (`rm -rf`, `shutdown`, `mkfs`, `format`, `dd if=`) musi natychmiast zablokować wątek wykonawczy i zapisać błąd w logu bezpieczeństwa.

### Wymagania Niefunkcjonalne i Infrastruktura
- **Izolacja Procesu Electron:** Okna renderera aplikacji Electron muszą bezwzględnie posiadać konfigurację `contextIsolation: true` oraz `nodeIntegration: false`. Funkcja `sandbox: false` może być użyta wyłącznie w procesie preload w celu ładowania relatywnych modułów uwierzytelniania, pod warunkiem pełnego odizolowania kontekstu renderera od API Node.js.
- **Python ML Dependencies:** Lokalne środowisko wykonawcze wymaga Pythona w wersji `3.12` (dla agenta serwerowego) lub `3.14-slim` (dla sidecara) wraz z zainstalowanymi i zablokowanymi w wersjach zależnościami: `fastapi`, `uvicorn`, `websockets`, `onnxruntime`, `openwakeword`, `silero-vad`, `kokoro`, `lancedb`.
- **System Memory Safety Bounds:** Lokalny moduł notatek i badań (`note.py`) musi wymuszać sztywne ograniczenie pamięci bufora: tablica `notes_storage` może przechowywać maksymalnie 20 najświeższych wpisów tekstowych. Przekroczenie tego limitu musi skutkować natychmiastowym, automatycznym usunięciem najstarszych rekordów z pamięci podręcznej komputera (`del notes_storage[:-20]`), zabezpieczając stację roboczą przed wyciekami pamięci RAM podczas długotrwałych zadań autonomicznych.
