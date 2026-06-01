# Specyfikacja Architektoniczna — Ekosystem AssistantX & Jarvis

Niniejszy dokument stanowi rygorystyczny opis architektury hybrydowej rozproszonego systemu asystenta AI, dzielącego się na platformę chmurową **AssistantX** oraz natywne środowisko brzegowe (Edge) o nazwie kodowej **Jarvis**. System łączy asynchroniczną orkiestrację zdarzeń, lokalne potoki inferencji uczenia maszynowego oraz zaawansowaną inżynierię kontekstu i zabezpieczeń systemowych.

---

## 1. Warstwa Chmurowa, Orkiestracja i Routing (AssistantX)

Sercem chmurowej infrastruktury platformy AssistantX jest aplikacja napisana w Next.js 16 (App Router), zintegrowana z systemem zadań asynchronicznych Inngest oraz bazą danych Supabase (PostgreSQL). Warstwa ta działa jako globalny koordynator stanów sesji, autoryzacji oraz zarządzania dostępem do modeli językowych.

### 1.1. Dynamiczny System Odporności na Awarie (Circuit Breaker)
W pliku `app/api/model-health/route.ts` oraz powiązanych modułach OpenRouter zaimplementowano architekturę odporną na awarie API zewnętrznych dostawców (Fault Tolerance). Zamiast polegać na statycznej liście modeli, system implementuje wzorzec bezpiecznika (Circuit Breaker Pattern). Gdy żądanie do OpenRouter kończy się błędem infrastrukturalnym lub przekroczeniem limitów (Rate Limiting), dany model (np. konkretny serwer hostujący Qwen lub GPT) zostaje dynamicznie dopisany do rejestru modeli uszkodzonych (`getDownModels()`). 

Wpis ten uruchamia 60-sekundowe okno chłodzenia (cooling-off window). W tym czasie endpoint `/api/model-health` wymusza na interfejsie użytkownika (`ModelSelector`) zablokowanie uszkodzonej pozycji i automatycznie przełącza ruch na alternatywnych dostawców (np. bezpośrednie połączenie z Groq API lub Google AI Studio jako fallback dla Gemini). Mechanizm ten działa w trybie wymuszonym dynamicznie (`force-dynamic`), całkowicie pomijając pamięć podręczną Next.js, co gwarantuje natychmiastową reakcję systemu na awarie sieciowe.

### 1.2. Wielowątkowość i Transport Strumieniowy
Obsługa komunikatów w czasie rzeczywistym opiera się na spersonalizowanych strukturach transportowych zdefiniowanych w `app/lib/chat-transport.ts`. Typ `ChatStreamChunk` zarządza asynchronicznym odbiorem cząstkowych odpowiedzi z modeli LLM, dzieląc je na tokeny tekstowe, warstwę rozumowania (reasoning tokens), statusy oraz powody routingu (`routeReason`). Aby zapobiec przeciążeniom wątku głównego serwera podczas jednoczesnego odpytywania wielu usług lub modeli, moduł `app/lib/concurrency.ts` implementuje algorytm ograniczonej współbieżności `runWithConcurrency`. 

Działa on w oparciu o pulę procesów robotniczych (Worker Pool Pattern), przetwarzając tablicę zadań z predefiniowanym limitem jednoczesnych egzekucji (`concurrency`). Wyniki są agregowane i mapowane w dokładnie takiej samej kolejności, w jakiej zostały przesłane, co eliminuje chaos w asynchronicznym przetwarzaniu danych. Całość autoryzacji sesji chmurowych opiera się na wyciąganiu tokenów Bearer za pomocą `sync-auth.ts`, który bezpiecznie przekazuje tożsamość użytkownika do Supabase SSR bez ryzyka wycieku sesji na poziomie middleware.

---

## 2. Architektura Desktopowa i Szyna Zdarzeń (Jarvis Desktop Core)

Natywna warstwa systemowa Jarvis opiera się na szkielecie Electron Framework. Architektura ta oddziela proces główny (Main Process) od procesów renderowania interfejsu (Renderer Processes), wdrażając rygorystyczne zasady izolacji i bezpieczeństwa.

### 2.1. Architektura Izolacji i Bezpieczeństwa Preload
Zgodnie z plikiem `jarvis/desktop/electron/main/window-security.js`, preferencje okien (`buildSecureWebPreferences`) konfigurują środowisko wykonawcze z ustawieniami `nodeIntegration: false` oraz `contextIsolation: true`. Taka konfiguracja uniemożliwia potencjalnym atakom typu XSS z poziomu kodu UI na uzyskanie dostępu do niskopoziomowych funkcji Node.js lub systemu operacyjnego. Co ciekawe, w architekturze zdecydowano się na wyłączenie natywnej piaskownicy Electrona (`sandbox: false`). 

Decyzja ta była podyktowana koniecznością zachowania mechanizmu `preloadRequire` w skrypcie pośredniczącym `preload.js`. Pozwala to procesowi preload na poprawne importowanie relatywnych modułów aplikacji (such as systemy autoryzacji `./auth` czy zarządzania sesją) bezpośrednio z dysku lokalnego. Bezpieczeństwo jest w 100% utrzymywane przez mostek profesjonalnej separacji kontekstu (`contextIsolation`), który wystawia dla warstwy UI ściśle zdefiniowane, bezpieczne API za pośrednictwem pliku `jarvis/desktop/electron/preload/capabilities.js` (obiekt `jarvisApiV2`).

### 2.2. Sterowana Zdarzeniami Szyna Komunikacyjna (Internal Event Bus)
Komunikacja między wewnętrznymi modułami Electrona (takimi jak telemetry, menedżer procesów, moduły audio) została całkowicie uniezależniona od bezpośrednich wywołań funkcji na rzecz wzorca publikuj-subskrybuj (Publish-Subscribe Pattern). W pliku `jarvis/desktop/electron/core/events/event-bus.js` zaimplementowano szynę zdarzeń opartą na natywnej klasie Node.js `EventEmitter`. 

Szyna ta posiada podniesiony limit jednoczesnych słuchaczy (`setMaxListeners(100)`), co zapobiega wyciekom pamięci podczas intensywnej pracy agentów. Każde opublikowane zdarzenie (`publish`) pakuje dane w ustandaryzowany obiekt zawierający nazwę zdarzenia, payload, sygnaturę czasową ISO oraz kluczowe identyfikatory kontekstowe (`correlationId`, `sessionId`, `taskId`). Pozwala to na pełną asynchroniczność – menedżer strumieni AI może informować system o odebraniu nowego tokenu, a moduł logowania strukturalnego (`logger.js`) i metryk (`metrics.js`) automatycznie przechwytuje te zdarzenia z szyny i zapisuje je w osi czasu wykonania (`timeline.js`).

---

## 3. Zaawansowana Inżynieria Kontekstu i Wielopoziomowa Pamięć

System kognitywny (poznawczy) Jarvis oraz AssistantX opiera się na zaawansowanym zarządzaniu oknem kontekstowym modeli LLM. Ponieważ przesyłanie całej bazy kodu i historii rozmów przy każdym zapytaniu jest niemożliwe i nieekonomiczne, w katalogu `jarvis/desktop/electron/memory/context/` zaimplementowano wieloetapowy potok przetwarzania i redukcji danych.

### 3.1. Estymacja i Kompresja Kontekstu (Context Budgeting)
Pierwszym etapem potoku jest estymacja zużycia tokenów realizowana przez moduł `token-estimator.js`. Funkcja `estimateTokens` implementuje algorytm heurystyczny, wyliczając surowy sufit tokenów na podstawie długości znakowej tekstu podzielonej przez 4 (Character-to-Token Ceiling: ⌈length / 4⌉). Gdy dane zostaną oszacowane, trafiają do kompresora kontekstu `context-compressor.js`. 

Funkcja `compressChunks` wykonuje bezstratną redukcję objętości tekstu: usuwa wielokrotne białe znaki, entery oraz taby, zamieniając je na pojedyncze spacje, po czym weryfikuje unikalność fragmentów za pomocą zestawu kluczy `Set()`. Jeśli dany fragment kodu przekracza twardy limit architektoniczny `maxChars = 1200`, zostaje on bezpiecznie przycięty i oznaczony markerem wielokropka (…), chroniący okno kontekstowe przed przepełnieniem.

### 3.2. Polityka Okna Przesuwnego i Wyszukiwanie Hybrydowe (Semantic Recall)
Zarządzanie priorytetami wiedzy realizowane jest przez politykę okna przesuwnego (`sliding-window-policy.js`). Algorytm dzieli przychodzące fragmenty pamięci na dwie kategorie: fragmenty "lepkie" (`stickyKinds`: `active-task`, `recent-critical`, `repo-local`) oraz fragmenty zwykłe (historia czatu). Pętla algorytmu gwarantuje, że informacje oznaczone jako krytyczne dla bieżącego zadania programistycznego nigdy nie wypadną z pamięci roboczej, a całe zestawienie jest obcinane do bezpiecznej granicy `maxChunks = 20`. 

Wyszukiwanie tych danych realizuje potok `semantic-recall.js`, który łączy tradycyjne wyszukiwanie tekstowe z wektorowym (baza LanceDB). Unikalną cechą architektury jest moduł `repo-aware.js`. Analizuje on powiązania architektoniczne kodu źródłowego: jeśli algorytm wektorowy odnajdzie plik spełniający kryteria zapytania, `repo-aware.js` przeszukuje jego relatywne ścieżki (`relatedPaths`) i automatycznie wstrzykuje do kontekstu pliki powiązane (np. plik konfiguracyjny lub typy powiązane z danym komponentem), mnożąc ich wagę wejściową przez współczynnik 0.6 (`retrievalScore * 0.6`). Następnie moduł `reranker.js` dokonuje ostatecznego sortowania, faworyzując pliki deweloperskie w zadaniach oznaczonych jako `taskType === 'coding'`.

---

## 4. Przetwarzanie Brzegowe Audio (Sidecar) i Hooki Systemowe

Warstwa wykonawcza Jarvis implementuje niezależny demon audio (`ai-agent/requirements.txt`) zoptymalizowany pod kątem pracy w trybie offline bez obciążania układu graficznego (GPU), przenosząc całą inferencję na wątki procesora (Local CPU Inference).

### 4.1. Kaskadowy Potok Detekcji Głosu i Hasła Wywoławczego (Voice Pipeline)
Aby zapobiec nieustannemu obciążeniu procesora przez algorytmy rozpoznawania mowy, potok audio w demonie Pythona działa w sposób kaskadowy (Cascade Gate Pattern). Pierwszą barierę stanowi Voice Activity Detection (VAD) oparty na bibliotekach `silero-vad` oraz `webrtcvad`. Algorytmy te analizują bufor karty dźwiękowej (`sounddevice` + `numpy`) z niskim opóźnieniem, sprawdzając, czy w otoczeniu komputera występuje ludzka mowa. 

Dopiero po przekroczeniu progu ufności VAD, strumień audio jest przekazywany do modułu `openwakeword`. Algorytm ten analizuje cechy akustyczne w poszukiwaniu frazy aktywującej "Jarvis". Po jej wykryciu, system uruchamia lokalny silnik Speech-to-Text (STT) oparty na modelu Parakeet, wykonywany w wysoce wydajnym środowisku `onnxruntime`. Po wygenerowaniu tekstu i przetworzeniu intencji przez orkiestrator, odpowiedź zwrotna jest syntetyzowana na mowę całkowicie offline przy użyciu lekkiego i naturalnego modelu Kokoro (`kokoro >= 0.9.4`).

### 4.2. Niskopoziomowy Intercept Zasilania i Bezpieczeństwo Wykonania (Power Guard)
Wyjątkowym elementem architektury sterowania sprzętem jest moduł `jarvis-power-guard`, napisany w języku Rust (`jarvis/power-guard/Cargo.toml`). Działa on wyłącznie w systemach Windows, komunikując się bezpośrednio z podsystemem Win32 (`windows-sys`). Moduł ten rejestruje hook systemowy monitorujący intencje zamknięcia systemu operacyjnego przez użytkownika lub zewnętrzne procesy (`Win32_UI_WindowsAndMessaging`). 

W momencie wykrycia sygnału zamknięcia, Power Guard przechwytuje to żądanie (Signal Interception) i zamiast pozwolić na całkowite odcięcie zasilania komputera, wymusza przejście systemu w stan głębokiej hibernacji za pomocą komendy `shutdown /h`. Ta decyzja architektoniczna jest kluczowa dla działania zdalnego budzenia maszyn (Wake-on-LAN): komputer w stanie hibernacji zapisuje stan pamięci na dysku, ale utrzymuje zasilanie pomocnicze na karcie sieciowej. Dzięki temu moduł pairingowy AssistantX (`app/api/wake/route.ts`) może wybudzić komputer użytkownika z dowolnego miejsca na świecie za pomocą pakietów magicznych przesyłanych przez metody `udp_path_probe`, `ipv6_magic_packet` lub `lan_broadcast`, zapewniając nieprzerwaną dostępność lokalnego agenta.
