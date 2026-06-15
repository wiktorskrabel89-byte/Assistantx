import type { PublicUILanguage } from "@/app/lib/ui-language";

export type EngineCard = {
  key:
    | "hardware"
    | "browser"
    | "sandbox"
    | "healing"
    | "discovery"
    | "team"
    | "adaptive"
    | "evolution"
    | "pattern"
    | "decay";
  title: string;
  desc: string;
  stat?: { value: number; suffix: string; label: string };
  steps?: string[];
  table?: { role: string; desc: string }[];
  profiles?: string[];
  terminal?: string[];
};

export type BeyondCard = {
  key: "mobile" | "operator" | "macro" | "academy" | "worlds" | "vision" | "twin";
  title: string;
  desc: string;
  terminal?: string[];
};

export type WaitlistCopy = {
  hero: {
    kicker: string;
    codename: string;
    titleMain: string;
    titleAccent: string;
    subtitle: string;
    description: string;
    scrollHint: string;
  };
  problem: {
    kicker: string;
    title: string;
    subtitle: string;
    cards: { title: string; body: string }[];
  };
  solution: {
    kicker: string;
    title: string;
    body: string;
    highlight: string;
  };
  pillars: {
    kicker: string;
    title: string;
    subtitle: string;
    items: { key: "brain" | "hands" | "muscles"; title: string; desc: string }[];
  };
  comparison: {
    kicker: string;
    title: string;
    subtitle: string;
    assistantxLabel: string;
    competitorLabel: string;
    rows: { label: string; assistantx: string; competitor: string }[];
  };
  engine: {
    kicker: string;
    title: string;
    subtitle: string;
    cards: EngineCard[];
  };
  economics: {
    kicker: string;
    title: string;
    subtitle: string;
    assistantxLabel: string;
    competitorLabel: string;
    assistantxPrice: string;
    competitorPrice: string;
    tagline: string;
    note: string;
  };
  beyond: {
    kicker: string;
    title: string;
    subtitle: string;
    cards: BeyondCard[];
  };
  network: {
    kicker: string;
    title: string;
    body: string;
    badge: string;
  };
  finalCta: {
    kicker: string;
    title: string;
    subtitle: string;
    badge: string;
    contactLabel: string;
    contactEmail: string;
  };
  form: {
    placeholder: string;
    button: string;
    buttonLoading: string;
    success: string;
    alreadyIn: string;
    error: string;
    invalidEmail: string;
    disclaimer: string;
  };
  footer: {
    rights: string;
    privacy: string;
    terms: string;
    backHome: string;
  };
};

export const WAITLIST_COPY: Record<PublicUILanguage, WaitlistCopy> = {
  en: {
    hero: {
      kicker: "MANIFEST V1.0",
      codename: "CODENAME: JARVIS",
      titleMain: "ASSISTANT",
      titleAccent: "X",
      subtitle: "The intelligent desktop layer that acts — not just talks.",
      description:
        "AssistantX opens terminals, writes and tests code in an isolated sandbox, controls your apps, and heals itself when something breaks. Local-first, private by design — from 25 PLN/month.",
      scrollHint: "Scroll to see the full manifest",
    },
    problem: {
      kicker: "THE PROBLEM",
      title: "ChatGPT only talks.",
      subtitle: "Every AI chatbot ends the same way — with you, copy-pasting.",
      cards: [
        {
          title: "The Theorist vs. the Engineer",
          body:
            "Ask an AI to fix a bug and it hands you a wall of text. You still have to open the file, paste the code, run it, and fix the next error yourself. It's an advisor — never an operator.",
        },
        {
          title: "The Privacy Drain",
          body:
            "Every prompt, file, and screenshot you share goes straight to someone else's servers. Your code, your business data, your life — uploaded by default.",
        },
      ],
    },
    solution: {
      kicker: "THE SOLUTION",
      title: "AssistantX: the assistant that ACTS.",
      body:
        "AssistantX is a local-first AI desktop layer. It doesn't just answer — it opens the terminal, writes the code, runs the tests, clicks the buttons, and fixes its own mistakes. You describe the outcome. AssistantX gets it done.",
      highlight: "From idea to shipped code — without leaving your desktop.",
    },
    pillars: {
      kicker: "THE FOUNDATION",
      title: "Three pillars. One assistant.",
      subtitle: "Brain, hands, and muscle — working together on your machine.",
      items: [
        {
          key: "brain",
          title: "Brain — Chat",
          desc:
            "Multi-model reasoning that understands your intent, plans the steps, and keeps context across your whole project.",
        },
        {
          key: "hands",
          title: "Hands — Workspace",
          desc:
            "A real terminal, file system, and browser. AssistantX edits files, runs commands, and clicks through apps like you do.",
        },
        {
          key: "muscles",
          title: "Muscle — GPU",
          desc:
            "Your hardware powers local models for instant, private inference — no waiting on someone else's queue.",
        },
      ],
    },
    comparison: {
      kicker: "ACTION VS. TALK",
      title: "Your data stays yours.",
      subtitle: "Side by side, the difference isn't subtle.",
      assistantxLabel: "AssistantX",
      competitorLabel: "Cloud Chatbots",
      rows: [
        {
          label: "Executes tasks, not just suggestions",
          assistantx: "Acts on your machine",
          competitor: "Suggests, you do the rest",
        },
        {
          label: "Where it runs",
          assistantx: "100% on your hardware",
          competitor: "Their cloud servers",
        },
        {
          label: "Your files & code",
          assistantx: "Never leave your machine",
          competitor: "Uploaded by default",
        },
        {
          label: "When something breaks",
          assistantx: "Self-heals and retries",
          competitor: "You debug it manually",
        },
        {
          label: "Pricing",
          assistantx: "Flat 25 PLN/month",
          competitor: "Usage caps & overages",
        },
      ],
    },
    engine: {
      kicker: "THE COGNITIVE ENGINE",
      title: "What's running under the hood",
      subtitle: "Ten systems working together, all on your machine.",
      cards: [
        {
          key: "hardware",
          title: "Hardware Intelligence",
          desc:
            "AssistantX scans your CPU, GPU, and RAM, then picks the fastest model configuration your machine can run.",
          stat: { value: 98, suffix: "%", label: "hardware capability score" },
        },
        {
          key: "browser",
          title: "Browser Hands",
          desc:
            "Powered by Playwright, AssistantX clicks, types, scrolls, and fills forms across any website — exactly like a human would.",
        },
        {
          key: "sandbox",
          title: "Docker Sandbox",
          desc:
            "Every piece of generated code runs first inside an isolated container — your real system is never at risk.",
        },
        {
          key: "healing",
          title: "Self-Healing Loop",
          desc: "Write, run, fail, fix, repeat — automatically, until the task succeeds.",
          steps: ["Detect the error", "Diagnose the root cause", "Patch and retest"],
        },
        {
          key: "discovery",
          title: "Discovery Agent",
          desc:
            "Continuously maps your installed apps, files, and workflows to find new ways AssistantX can help.",
          stat: { value: 96, suffix: "%", label: "discovery precision" },
        },
        {
          key: "team",
          title: "Agent Team",
          desc: "Four specialised agents collaborate on every task.",
          table: [
            { role: "Orchestrator", desc: "Plans the work and assigns it" },
            { role: "Coding", desc: "Writes and edits code" },
            { role: "Reviewer", desc: "Checks quality and safety" },
            { role: "Research", desc: "Gathers context and docs" },
          ],
        },
        {
          key: "adaptive",
          title: "Adaptive AI",
          desc: "AssistantX tunes its behaviour to fit how you work — across nine distinct profiles.",
          profiles: [
            "Developer",
            "Gamer",
            "Creator",
            "Student",
            "Researcher",
            "Sysadmin",
            "Business",
            "Writer",
            "Beginner",
          ],
        },
        {
          key: "evolution",
          title: "Autonomous Evolution",
          desc:
            "AssistantX rewrites and improves its own workflows over time, learning from what worked and what didn't.",
        },
        {
          key: "pattern",
          title: "Pattern Discovery Engine",
          desc: "Spots recurring habits in your workflow and turns them into one-click automations.",
          terminal: [
            '[METADATA] pattern_detected: workflow="morning_report" confidence=0.94',
            "[ACTION] suggest_automation: \"Generate daily report from yesterday's commits\"",
            "[STATUS] awaiting_approval...",
          ],
        },
        {
          key: "decay",
          title: "Knowledge Decay System",
          desc:
            "Outdated information automatically loses priority over time, so AssistantX always favours your latest context.",
        },
      ],
    },
    economics: {
      kicker: "ECONOMICS",
      title: "3x cheaper. 10x more.",
      subtitle: "Local-first means no expensive cloud bill to pass on to you.",
      assistantxLabel: "AssistantX",
      competitorLabel: "Typical cloud AI subscription",
      assistantxPrice: "25 PLN",
      competitorPrice: "~90 PLN",
      tagline: "One flat price. Unlimited local usage.",
      note: "/month, no usage caps",
    },
    beyond: {
      kicker: "BEYOND THE DESK",
      title: "Your assistant, everywhere.",
      subtitle: "AssistantX doesn't stop at your screen.",
      cards: [
        {
          key: "mobile",
          title: "Mobile Companion",
          desc: "Check progress, approve actions, and chat with AssistantX from your phone — anywhere.",
        },
        {
          key: "operator",
          title: "System Operator",
          desc: "AssistantX drives Chrome, VS Code, Discord, and OBS directly — switching apps and windows like you would.",
        },
        {
          key: "macro",
          title: "Macro Automation",
          desc: "Record a routine once. AssistantX replays it perfectly, every time.",
          terminal: [
            '$ assistantx run macro "weekly-report"',
            "> Opening spreadsheet... done",
            "> Pulling latest data... done",
            "> Generating charts... done",
            "> Sending to team channel... done",
            "✓ Macro completed in 12.4s",
          ],
        },
        {
          key: "academy",
          title: "AssistantX Academy",
          desc:
            "Built-in, bite-sized lessons that teach you what AssistantX just did — so you learn as it works.",
        },
        {
          key: "worlds",
          title: "Interactive Worlds",
          desc:
            "Hands-on simulations for AI fundamentals, networking, and hardware — learn by doing, guided by your assistant.",
        },
        {
          key: "vision",
          title: "Computer Vision",
          desc:
            "AssistantX sees your screen — reading dashboards, diagrams, and UI states to act on what's actually there.",
        },
        {
          key: "twin",
          title: "Digital Twin",
          desc:
            "AssistantX builds a living model of your setup — apps, files, and habits — to anticipate what you'll need next.",
        },
      ],
    },
    network: {
      kicker: "GLOBAL NETWORK · OPT-IN",
      title: "Smarter together — if you choose to.",
      body:
        "Opt in, and your AssistantX can anonymously share what it learns with the wider network — making every assistant a little sharper, while your data stays yours. Opt out any time; nothing leaves your machine by default.",
      badge: "Anonymous · Opt-in · Off by default",
    },
    finalCta: {
      kicker: "JOIN THE BETA",
      title: "An advertisement for the future.",
      subtitle:
        "Be first in line when AssistantX opens its private beta. No spam — just one email when it's your turn.",
      badge: "[ CORE SYSTEM STABLE — 2026 ]",
      contactLabel: "Questions? Reach us at",
      contactEmail: "assistantx.pl@gmail.com",
    },
    form: {
      placeholder: "you@example.com",
      button: "Join the waitlist",
      buttonLoading: "Joining...",
      success: "You're on the list! We'll email you when your invite is ready.",
      alreadyIn: "You're already on the list — sit tight.",
      error: "Something went wrong. Please try again.",
      invalidEmail: "Please enter a valid email address.",
      disclaimer: "No spam. Unsubscribe anytime.",
    },
    footer: {
      rights: "All rights reserved.",
      privacy: "Privacy",
      terms: "Terms",
      backHome: "Back to AssistantX",
    },
  },
  pl: {
    hero: {
      kicker: "MANIFEST V1.0",
      codename: "KRYPTONIM: JARVIS",
      titleMain: "ASSISTANT",
      titleAccent: "X",
      subtitle: "Inteligentna warstwa pulpitu, która działa — nie tylko rozmawia.",
      description:
        "AssistantX otwiera terminale, pisze i testuje kod w izolowanym sandboxie, kontroluje Twoje aplikacje i samo się naprawia, gdy coś pójdzie nie tak. Lokalnie, prywatnie i już od 25 PLN/miesiąc.",
      scrollHint: "Przewiń, aby zobaczyć cały manifest",
    },
    problem: {
      kicker: "PROBLEM",
      title: "ChatGPT tylko rozmawia.",
      subtitle: "Każdy chatbot AI kończy się tak samo — Ty kopiujesz i wklejasz.",
      cards: [
        {
          title: "Teoretyk kontra Inżynier",
          body:
            "Poproś AI o naprawienie buga i dostaniesz stertę tekstu. Wciąż musisz sam otworzyć plik, wkleić kod, odpalić go i naprawić kolejny błąd. To doradca — nigdy operator.",
        },
        {
          title: "Wyciek prywatności",
          body:
            "Każdy prompt, plik i screenshot, który wysyłasz, trafia na serwery kogoś innego. Twój kod, dane Twojej firmy, Twoje życie — domyślnie wgrane do chmury.",
        },
      ],
    },
    solution: {
      kicker: "ROZWIĄZANIE",
      title: "AssistantX: asystent, który DZIAŁA.",
      body:
        "AssistantX to lokalna warstwa AI na Twoim pulpicie. Nie tylko odpowiada — otwiera terminal, pisze kod, odpala testy, klika w przyciski i naprawia własne błędy. Ty opisujesz cel. AssistantX go realizuje.",
      highlight: "Od pomysłu do wdrożonego kodu — bez wychodzenia z pulpitu.",
    },
    pillars: {
      kicker: "FUNDAMENT",
      title: "Trzy fundamenty. Jeden asystent.",
      subtitle: "Mózg, ręce i moc — działające razem na Twoim komputerze.",
      items: [
        {
          key: "brain",
          title: "Mózg — Czat",
          desc:
            "Wielomodelowe rozumowanie, które rozumie Twój cel, planuje kroki i pamięta kontekst całego projektu.",
        },
        {
          key: "hands",
          title: "Ręce — Workspace",
          desc:
            "Prawdziwy terminal, system plików i przeglądarka. AssistantX edytuje pliki, odpala komendy i klika w aplikacje tak jak Ty.",
        },
        {
          key: "muscles",
          title: "Moc — GPU",
          desc:
            "Twój sprzęt zasila lokalne modele do natychmiastowego, prywatnego wnioskowania — bez czekania w czyjejś kolejce.",
        },
      ],
    },
    comparison: {
      kicker: "DZIAŁANIE VS. ROZMOWA",
      title: "Twoje dane zostają Twoje.",
      subtitle: "Postawione naprzeciw siebie, różnica nie jest subtelna.",
      assistantxLabel: "AssistantX",
      competitorLabel: "Chatboty w chmurze",
      rows: [
        {
          label: "Wykonuje zadania, nie tylko podsuwa sugestie",
          assistantx: "Działa na Twoim komputerze",
          competitor: "Sugeruje, resztę robisz sam",
        },
        {
          label: "Gdzie działa",
          assistantx: "100% na Twoim sprzęcie",
          competitor: "Na ich serwerach w chmurze",
        },
        {
          label: "Twoje pliki i kod",
          assistantx: "Nigdy nie opuszczają komputera",
          competitor: "Domyślnie wgrywane do chmury",
        },
        {
          label: "Gdy coś się zepsuje",
          assistantx: "Samo się naprawia i próbuje ponownie",
          competitor: "Sam debugujesz problem",
        },
        {
          label: "Cennik",
          assistantx: "Stałe 25 PLN/miesiąc",
          competitor: "Limity i dopłaty za użycie",
        },
      ],
    },
    engine: {
      kicker: "SILNIK KOGNITYWNY",
      title: "Co działa pod maską",
      subtitle: "Dziesięć systemów współpracujących razem, wszystkie na Twoim komputerze.",
      cards: [
        {
          key: "hardware",
          title: "Inteligencja sprzętowa",
          desc:
            "AssistantX skanuje Twój CPU, GPU i RAM, a następnie wybiera najszybszą konfigurację modelu, jaką Twój sprzęt może obsłużyć.",
          stat: { value: 98, suffix: "%", label: "wynik możliwości sprzętu" },
        },
        {
          key: "browser",
          title: "Ręce w przeglądarce",
          desc:
            "Dzięki Playwright AssistantX klika, pisze, przewija i wypełnia formularze na każdej stronie — zupełnie jak człowiek.",
        },
        {
          key: "sandbox",
          title: "Sandbox Docker",
          desc:
            "Każdy wygenerowany kod działa najpierw w izolowanym kontenerze — Twój system nigdy nie jest zagrożony.",
        },
        {
          key: "healing",
          title: "Pętla samonaprawy",
          desc: "Pisz, odpalaj, błąd, naprawa, powtórz — automatycznie, aż zadanie się powiedzie.",
          steps: ["Wykryj błąd", "Zdiagnozuj przyczynę", "Napraw i przetestuj ponownie"],
        },
        {
          key: "discovery",
          title: "Agent odkrywczy",
          desc:
            "Nieustannie mapuje Twoje aplikacje, pliki i przepływy pracy, by znaleźć nowe sposoby, w jakie AssistantX może pomóc.",
          stat: { value: 96, suffix: "%", label: "precyzja odkrywania" },
        },
        {
          key: "team",
          title: "Zespół agentów",
          desc: "Cztery wyspecjalizowane agenty współpracują przy każdym zadaniu.",
          table: [
            { role: "Orchestrator", desc: "Planuje pracę i ją przydziela" },
            { role: "Coding", desc: "Pisze i edytuje kod" },
            { role: "Reviewer", desc: "Sprawdza jakość i bezpieczeństwo" },
            { role: "Research", desc: "Zbiera kontekst i dokumentację" },
          ],
        },
        {
          key: "adaptive",
          title: "Adaptacyjne AI",
          desc: "AssistantX dopasowuje swoje działanie do Twojego stylu pracy — w dziewięciu profilach.",
          profiles: [
            "Developer",
            "Gracz",
            "Twórca",
            "Student",
            "Badacz",
            "Sysadmin",
            "Biznes",
            "Pisarz",
            "Początkujący",
          ],
        },
        {
          key: "evolution",
          title: "Autonomiczna ewolucja",
          desc:
            "AssistantX z czasem przepisuje i ulepsza własne przepływy pracy, ucząc się na podstawie tego, co zadziałało, a co nie.",
        },
        {
          key: "pattern",
          title: "Silnik odkrywania wzorców",
          desc: "Wychwytuje powtarzające się zwyczaje w Twojej pracy i zamienia je w automatyzacje jednym kliknięciem.",
          terminal: [
            '[METADATA] pattern_detected: workflow="morning_report" confidence=0.94',
            "[ACTION] suggest_automation: \"Generate daily report from yesterday's commits\"",
            "[STATUS] awaiting_approval...",
          ],
        },
        {
          key: "decay",
          title: "System wygaszania wiedzy",
          desc:
            "Nieaktualne informacje z czasem automatycznie tracą priorytet, dzięki czemu AssistantX zawsze stawia na najnowszy kontekst.",
        },
      ],
    },
    economics: {
      kicker: "EKONOMIA",
      title: "3x taniej. 10x więcej.",
      subtitle: "Lokalne przetwarzanie oznacza brak drogich rachunków za chmurę, które trzeba na Ciebie przerzucić.",
      assistantxLabel: "AssistantX",
      competitorLabel: "Typowy abonament AI w chmurze",
      assistantxPrice: "25 PLN",
      competitorPrice: "~90 PLN",
      tagline: "Jedna stała cena. Nielimitowane lokalne użycie.",
      note: "/miesiąc, bez limitów użycia",
    },
    beyond: {
      kicker: "POZA BIURKIEM",
      title: "Twój asystent, wszędzie.",
      subtitle: "AssistantX nie kończy się na Twoim ekranie.",
      cards: [
        {
          key: "mobile",
          title: "Aplikacja mobilna",
          desc: "Sprawdzaj postępy, zatwierdzaj akcje i rozmawiaj z AssistantX z telefonu — gdziekolwiek jesteś.",
        },
        {
          key: "operator",
          title: "Operator systemu",
          desc:
            "AssistantX bezpośrednio obsługuje Chrome, VS Code, Discord i OBS — przełączając aplikacje i okna tak jak Ty.",
        },
        {
          key: "macro",
          title: "Automatyzacja makr",
          desc: "Nagraj rutynę raz. AssistantX odtworzy ją idealnie, każdy raz.",
          terminal: [
            '$ assistantx run macro "weekly-report"',
            "> Opening spreadsheet... done",
            "> Pulling latest data... done",
            "> Generating charts... done",
            "> Sending to team channel... done",
            "✓ Macro completed in 12.4s",
          ],
        },
        {
          key: "academy",
          title: "AssistantX Academy",
          desc:
            "Wbudowane, krótkie lekcje, które uczą Cię tego, co właśnie zrobił AssistantX — ucz się w trakcie pracy.",
        },
        {
          key: "worlds",
          title: "Interaktywne światy",
          desc:
            "Praktyczne symulacje podstaw AI, sieci i sprzętu — ucz się przez działanie, prowadzony przez asystenta.",
        },
        {
          key: "vision",
          title: "Wizja komputerowa",
          desc:
            "AssistantX widzi Twój ekran — czyta dashboardy, diagramy i stan interfejsu, by działać na tym, co faktycznie widzi.",
        },
        {
          key: "twin",
          title: "Cyfrowy bliźniak",
          desc:
            "AssistantX tworzy żywy model Twojego środowiska — aplikacji, plików i nawyków — by przewidzieć, czego będziesz potrzebować.",
        },
      ],
    },
    network: {
      kicker: "GLOBALNA SIEĆ · OPCJONALNIE",
      title: "Razem mądrzejsi — jeśli chcesz.",
      body:
        "Jeśli się zgodzisz, Twój AssistantX może anonimowo dzielić się tym, czego się nauczył, z całą siecią — dzięki temu każdy asystent staje się trochę lepszy, a Twoje dane wciąż należą do Ciebie. Możesz wyłączyć to w każdej chwili; domyślnie nic nie opuszcza Twojego komputera.",
      badge: "Anonimowo · Opcjonalnie · Domyślnie wyłączone",
    },
    finalCta: {
      kicker: "DOŁĄCZ DO BETY",
      title: "Reklama przyszłości.",
      subtitle:
        "Bądź pierwszy w kolejce, gdy AssistantX otworzy prywatną betę. Bez spamu — tylko jeden e-mail, gdy nadejdzie Twoja kolej.",
      badge: "[ CORE SYSTEM STABLE — 2026 ]",
      contactLabel: "Pytania? Napisz do nas:",
      contactEmail: "assistantx.pl@gmail.com",
    },
    form: {
      placeholder: "twoj@email.pl",
      button: "Zapisz się na listę",
      buttonLoading: "Zapisywanie...",
      success: "Jesteś na liście! Napiszemy, gdy Twoje zaproszenie będzie gotowe.",
      alreadyIn: "Jesteś już na liście — czekaj spokojnie.",
      error: "Coś poszło nie tak. Spróbuj ponownie.",
      invalidEmail: "Podaj prawidłowy adres e-mail.",
      disclaimer: "Bez spamu. Możesz się wypisać w każdej chwili.",
    },
    footer: {
      rights: "Wszelkie prawa zastrzeżone.",
      privacy: "Prywatność",
      terms: "Regulamin",
      backHome: "Wróć do AssistantX",
    },
  },
};
