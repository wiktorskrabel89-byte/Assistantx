import type { PublicUILanguage } from "@/app/lib/ui-language";

export type FaqItem = { question: string; answer: string };

const EN: FaqItem[] = [
  {
    question: "What exactly is AssistantX?",
    answer:
      "AssistantX (codename: Jarvis) is a personal AI assistant that sits on your machine — not a chatbot in a browser tab. It listens to voice, reads context off your screen, controls your desktop, remembers what you tell it, and gets better the more you use it. Think of a real assistant that happens to live in software.",
  },
  {
    question: "Does it actually run offline?",
    answer:
      "Yes. AssistantX is local-first: the assistant, its memory, and its skills run on your machine using local models (Ollama and similar). No internet, no problem — your data doesn't leave your computer, and the assistant keeps working. When a task truly benefits from a cloud model, it can escalate to one, but only with your consent.",
  },
  {
    question: "Which AI models does it use?",
    answer:
      "By default it uses local open-source models. When a task needs more horsepower, you can enable escalation to cloud providers (OpenAI, Anthropic, Google, OpenRouter). Every task is automatically routed to the best-fit model for the job, and you can pin favorites or force local-only if you prefer strict privacy.",
  },
  {
    question: "Does it really learn from its mistakes?",
    answer:
      "Yes — this is one of the core ideas. Every failure and success is analyzed, classified, and turned into a lesson. Skills version like software: they improve with use, can be rolled back if a new lesson misfires, and every learned change is inspectable. There's also anti-poisoning validation so the assistant can't be tricked into learning something harmful.",
  },
  {
    question: "How does memory work?",
    answer:
      "AssistantX has layered memory — conversation memory for the current thread, and long-term memory for facts, preferences, projects, and decisions across sessions. Every memory is inspectable, editable, and deletable. Nothing is a black box: you can open the audit trail and see exactly what the assistant remembers and why.",
  },
  {
    question: "Can it really control my computer?",
    answer:
      "Yes. AssistantX operates the desktop natively — launching apps, clicking, typing, moving files, coordinating workflows across your tools. Every real-world action passes through a permission gate you control, so nothing happens behind your back. You can also disable desktop control entirely and use AssistantX purely as a voice-chat assistant.",
  },
  {
    question: "Is my data private?",
    answer:
      "By design. Local-first architecture means your workspace, memory, files, and prompts stay on your machine unless you explicitly send them to a cloud model. Your private content is never used to train foundation models. Data in transit is encrypted, storage is authenticated, and you can wipe your workspace or account at any time — details in the Privacy Policy.",
  },
  {
    question: "How is this different from ChatGPT, Claude, or Gemini?",
    answer:
      "Those are AI models. AssistantX is the assistant around them: persistent memory, real desktop actions, offline operation via local models, learning from experience, voice-first interaction, and multi-agent reasoning for complex tasks. You can use those models through AssistantX — but AssistantX brings the parts they don't: memory, autonomy, execution, and continuity.",
  },
  {
    question: "What's multi-agent intelligence?",
    answer:
      "For big tasks, AssistantX can spin up specialist sub-agents that work in parallel — a researcher, a coder, a reviewer — coordinated by a trust-scored orchestration layer with adversarial verification of results. Instead of one model guessing alone, several agents cross-check each other. Arriving in v2.0.",
  },
  {
    question: "What platforms does it run on?",
    answer:
      "Desktop app for Windows, macOS, and Linux (packaged with Electron). A web workspace runs in any modern browser. A native mobile app is on the roadmap.",
  },
  {
    question: "When will it launch and is it free?",
    answer:
      "We're onboarding waitlist members in waves — join the waitlist above to get an early invite. A generous free tier will always exist for everyday use. Paid plans unlock heavier cloud-model usage, premium model access, and priority queues. Pricing is always shown inside the app before you commit.",
  },
  {
    question: "How do I get in touch?",
    answer:
      "Use the Contact page (also linked in the footer) — pick a topic and your mail app will open with the right subject pre-filled. We aim to reply within 1–2 business days. You can also join the Discord community for real-time discussion.",
  },
];

const PL: FaqItem[] = [
  {
    question: "Czym dokładnie jest AssistantX?",
    answer:
      "AssistantX (roboczo: Jarvis) to osobisty asystent AI, który żyje na Twoim urządzeniu — nie chatbot w karcie przeglądarki. Słucha głosu, czyta kontekst z ekranu, obsługuje Twój pulpit, pamięta co mu powiesz i staje się lepszy, im częściej go używasz. Prawdziwy asystent w formie oprogramowania.",
  },
  {
    question: "Czy naprawdę działa offline?",
    answer:
      "Tak. AssistantX działa lokalnie: sam asystent, jego pamięć i umiejętności działają na Twoim urządzeniu, korzystając z lokalnych modeli (Ollama i podobne). Bez internetu też działa — Twoje dane nie opuszczają komputera. Gdy zadanie naprawdę skorzysta z modelu chmurowego, asystent może eskalować — ale tylko za Twoją zgodą.",
  },
  {
    question: "Z jakich modeli AI korzysta?",
    answer:
      "Domyślnie korzysta z lokalnych modeli open-source. Gdy potrzeba więcej mocy, możesz włączyć eskalację do dostawców chmurowych (OpenAI, Anthropic, Google, OpenRouter). Każde zadanie jest kierowane do najlepszego modelu, a Ty możesz przypiąć ulubione lub wymusić tylko lokalne dla ścisłej prywatności.",
  },
  {
    question: "Czy naprawdę uczy się na błędach?",
    answer:
      "Tak — to jedna z kluczowych idei. Każda porażka i sukces są analizowane, klasyfikowane i zamieniane w lekcję. Umiejętności są wersjonowane jak oprogramowanie: poprawiają się z użyciem, można je cofnąć, a każda nauczona zmiana jest sprawdzalna. Jest też walidacja anty-zatruwania, więc asystenta nie da się nauczyć czegoś szkodliwego.",
  },
  {
    question: "Jak działa pamięć?",
    answer:
      "AssistantX ma pamięć warstwową — pamięć rozmowy dla bieżącego wątku i pamięć długoterminową dla faktów, preferencji, projektów i decyzji między sesjami. Każdy zapis pamięci można sprawdzić, edytować i usunąć. Żadnej czarnej skrzynki: możesz otworzyć ślad audytu i zobaczyć, co i dlaczego asystent zapamiętał.",
  },
  {
    question: "Czy naprawdę może sterować moim komputerem?",
    answer:
      "Tak. AssistantX obsługuje pulpit natywnie — uruchamia aplikacje, klika, pisze, przenosi pliki, koordynuje przepływy między narzędziami. Każda realna akcja przechodzi przez bramę uprawnień, którą kontrolujesz — nic nie dzieje się za Twoimi plecami. Możesz też całkowicie wyłączyć sterowanie pulpitem i używać AssistantX tylko jako asystenta głosowego.",
  },
  {
    question: "Czy moje dane są prywatne?",
    answer:
      "Z założenia tak. Architektura local-first oznacza, że Twój obszar roboczy, pamięć, pliki i prompty pozostają na Twoim urządzeniu, chyba że jawnie wyślesz je do modelu chmurowego. Twoje prywatne treści nigdy nie są wykorzystywane do trenowania modeli. Dane w tranzycie są szyfrowane, dostęp jest uwierzytelniany, a obszar roboczy lub konto możesz usunąć w każdej chwili — szczegóły w Polityce prywatności.",
  },
  {
    question: "Czym różni się od ChatGPT, Claude'a albo Gemini?",
    answer:
      "To są modele AI. AssistantX to asystent zbudowany wokół nich: trwała pamięć, prawdziwe akcje na pulpicie, praca offline dzięki lokalnym modelom, uczenie się z doświadczenia, interfejs głosowy i wielu współpracujących agentów przy złożonych zadaniach. Możesz używać tych modeli przez AssistantX — ale AssistantX daje to, czego one same nie mają: pamięć, autonomię, wykonanie i ciągłość.",
  },
  {
    question: "Czym jest inteligencja wieloagentowa?",
    answer:
      "Przy dużych zadaniach AssistantX potrafi uruchomić wyspecjalizowanych sub-agentów pracujących równolegle — badacz, programista, recenzent — koordynowanych przez warstwę orkiestracji z oceną zaufania i adwersarialną weryfikacją wyników. Zamiast jednego zgadującego modelu, kilku agentów sprawdza się nawzajem. Pojawi się w wersji 2.0.",
  },
  {
    question: "Na jakich platformach działa?",
    answer:
      "Aplikacja desktopowa na Windows, macOS i Linux (spakowana w Electronie). Wersja webowa działa w każdej nowoczesnej przeglądarce. Natywna aplikacja mobilna jest w planach.",
  },
  {
    question: "Kiedy premiera i czy jest darmowy?",
    answer:
      "Zapraszamy z listy oczekujących falami — dołącz do listy, aby dostać wczesne zaproszenie. Hojna wersja darmowa zawsze będzie dostępna do codziennego użytku. Płatne plany odblokują większe użycie modeli chmurowych, premium i priorytetowe kolejki. Ceny są zawsze pokazane w aplikacji, zanim się zdecydujesz.",
  },
  {
    question: "Jak się z Wami skontaktować?",
    answer:
      "Skorzystaj ze strony Kontakt (link jest też w stopce) — wybierz temat, a Twoja aplikacja pocztowa otworzy się z odpowiednim tematem. Odpowiadamy zwykle w 1–2 dni robocze. Możesz też dołączyć do naszej społeczności na Discordzie.",
  },
];

export function getFaqItems(lang: PublicUILanguage): FaqItem[] {
  return lang === "pl" ? PL : EN;
}

// Backwards-compatible export for callers that don't yet pass a language.
export const FAQ_ITEMS: FaqItem[] = EN;
