# Wizja Projektu i Comprehensive Architecture Segmentation

Projekt realizuje wizję zintegrowanego ekosystemu sztucznej inteligencji, w którym chmura obliczeniowa stanowi warstwę dystrybucji wiedzy i synchronizacji, natomiast lokalne stacje robocze użytkownika stają się bezpiecznymi środowiskami wykonawczymi zdolnymi do głębokiej automatyzacji zadań systemowych.

---

## 🌐 ASSISTANTX: Global Distribution & Cloud Layer

**AssistantX** to wielomodelowa platforma deweloperska oraz hub synchronizacyjny odpowiedzialny za bezpieczeństwo i interfejsy użytkownika dostępne z dowolnego urządzenia.

### 🔬 Szczegółowa Struktura Komponentów AssistantX:
* **The Web Workspace (`app/`):** Portal Next.js udostępniający modułową przestrzeń deweloperską. Zawiera zaawansowany edytor kodu z podglądem Markdown (`ComposerMarkdownPreview.tsx`), system bezpiecznego ładowania bloków kodu (`LazyCodeBlock.tsx`) oraz dedykowane karty funkcjonalne:
  - `ProjectsTab.tsx`: Zarządzanie strukturą plików projektowych w chmurze.
  - `LearningTab.tsx`: Interaktywna przestrzeń edukacyjna zasilana przez modele językowe.
  - `MarketplaceTab.tsx`: Brama do lokalnego repozytorium rozszerzeń MCP.
* **The MCP Marketplace (`app/marketplace/`):** Scentralizowana platforma oparta na protokole Model Context Protocol (MCP). Umożliwia integrację asystenta z zewnętrznymi interfejsami API (GitHub, Google Workspace, Slack, bazy danych PostgreSQL). Wdraża system weryfikacji bezpieczeństwa kodu oparty na poziomach zaufania: `MarketplaceTrustLevel` (`community`, `verified`, `official`).
* **AssistantX Clinical (Rozszerzenie Chrome):** Specjalistyczny dodatek przeglądarki zdefiniowany w oparciu o specyfikację Manifest V3 (`chrome-extension/manifest.json`). Za pomocą skryptu tła (`background.js`) i panelu bocznego (`sidepanel.html`) wstrzykuje odizolowaną instancję asystenta (`?tab=clinical`) z dostępem do mikrofonu, dedykowaną dla niezależnych praktyków medycznych wymagających całkowitej poufności przetwarzanych danych pacjentów.

---

## 🤖 JARVIS: Native Desktop & Local Edge Execution Layer

**Jarvis** to system operujący bezpośrednio na sprzęcie użytkownika (Edge Runtime). Jego celem jest analiza kontekstu lokalnego, synteza i rozpoznawanie mowy w trybie offline oraz autonomiczne programowanie i sterowanie aplikacjami systemowymi.

### 🔬 Szczegółowa Struktura Komponentów Jarvis:
* **Electron Core (`jarvis/desktop/electron/`):** Główny kontroler aplikacji natywnej. Wdraża architekturę zorientowaną na zdarzenia (EDA) sterowaną przez wewnętrzną szynę `event-bus.js`. Za pomocą bezpiecznego mostu pośredniczącego (`preload/capabilities.js`) udostępnia interfejs `jarvisApiV2` do bezpiecznej komunikacji z systemem operacyjnym.
* **The AI-Agent Sidecar (`ai-agent/`):** Asynchroniczny demon Pythona operujący na protokole WebSockets. Odpowiada za wykonywanie niskopoziomowych zadań uczenia maszynowego (audio, NLP, pamięć wektorowa) bezpośrednio na procesorze (CPU) komputera, eliminując opóźnienia sieciowe oraz chroniąc prywatność danych.
* **Jarvis Server Node (`jarvis/server/`):** Środowisko demonów Linux zarządzane przez systemd (`jarvis-server.service`). Uruchamia skonteneryzowane piaskownice deweloperskie użytkownika (`jarvis_workspace`) sprzężone z lokalną instancją wyszukiwarki SearXNG, umożliwiając autonomicznym agentom bezpieczne testowanie napisanego kodu w pełnej izolacji od systemu hosta.
* **Jarvis Android Client (`jarvis/android/`):** Mobilna aplikacja React Native z natywnym kodem Kotlin (`MainActivity.kt`, `MainApplication.kt`). Służy do monitorowania parametrów stacji roboczej oraz zdalnego budzenia komputerów i przesyłania poleceń poprzez interfejsy mobilne.
