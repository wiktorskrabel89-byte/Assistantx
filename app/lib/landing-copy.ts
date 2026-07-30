import type { PublicUILanguage } from "@/app/lib/ui-language";

// ─────────────────────────────────────────────────────────────
// Landing-page copy (PL/EN).
//
// One place to change every visible string on the public landing page —
// don't add strings inline in components.  The keys mirror the section
// structure so translators can work top-to-bottom.
//
// Product-name rules (from the brief):
//   • Product name is ALWAYS "AssistantX" — never "Jarvis", never a
//     compound "AssistantX-Jarvis".
//   • The phrase "operating system" is FORBIDDEN in marketing copy in
//     BOTH languages. If you catch yourself typing "system operacyjny" or
//     "operating system", pick a different framing (e.g. "operator",
//     "intelligence layer", "warstwa inteligencji", "kolejna generacja AI").
// ─────────────────────────────────────────────────────────────

export type FeatureCopy = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  bullets: string[];
  gradient: string;
  glow: string;
  icon: string;
  comingSoon?: boolean;
};

export type ComparisonRow = { feature: string; why: string };

export type LandingCopy = {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    joinCta: string;
    langToggleAria: string;
  };
  hero: {
    logoAlt: string;
    // Small pill above the H1 — cheap-to-read social proof / status signal.
    statusPill: string;
    // H1 was "The AI Operating System." — deliberately replaced.
    // The rewrite keeps the "big idea" energy but drops the banned phrase.
    headlineLead: string;   // top line (softer)
    headlineAccent: string; // gradient accent line (the punchline)
    subtitle: string;
    ctaJoin: string;
    ctaHint: string; // one-liner under the CTA button
    scrollHint: string;
  };
  features: {
    eyebrow: string;
    // H2 was "Not a chatbot. An operating system." — rewritten.
    headlineLead: string;
    headlineAccent: string;
    comingSoonLabel: string;
    items: FeatureCopy[];
    learnMore: string;
  };
  comparison: {
    // Section intro was "AssistantX-Jarvis is not another AI chatbot.
    // It is an AI Operating System." — rewritten.
    headlineLead: string;
    headlineAccent: string;
    subtitle: string;
    columnFeature: string;
    columnUs: string;
    columnThem: string;
    rows: ComparisonRow[];
  };
  waitlist: {
    eyebrow: string;
    headlineLead: string;
    headlineAccent: string;
    subtitle: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    submitIdle: string;
    submitLoading: string;
    successTitleFirst: string;
    successBodyFirst: string;
    successTitleAlready: string;
    successBodyAlready: string;
    pendingTitle: string;
    pendingBody: string;
    errorGeneric: string;
    errorRateLimited: string;
    // NOTE: two distinct disclosures, both must stay per brief:
    //   1) "name mechanic" — explains WHY we ask for a name
    //   2) "gdpr" — legal basis for processing name+email
    // Do not merge them into a single blob.
    disclosureName: string;
    disclosureGdprPrefix: string; // "By clicking Join Us you agree…"
    disclosureGdprLink: string;   // "Privacy Policy"
    disclosureGdprSuffix: string; // "for details."
    counterSuffix: string;        // "people waiting"
  };
  community: {
    headlineLead: string;
    headlineAccent: string;
    cards: {
      discord: { label: string; desc: string };
      docs: { label: string; desc: string };
      roadmap: { label: string; desc: string };
    };
  };
  footer: {
    tagline: string;
    copyright: string;
  };
};

// ─────────────────────────────────────────────────────────────
// English copy (source of truth — PL mirrors this structure).
// ─────────────────────────────────────────────────────────────
const EN: LandingCopy = {
  meta: {
    title: "AssistantX",
    // Meta description already says "AI workspace" — leave that class of
    // wording alone; we just avoid regressing to "operating system".
    description:
      "AssistantX is the AI that actually does the work — writes code, browses, controls your desktop, remembers you.",
  },
  nav: {
    joinCta: "Join Us",
    langToggleAria: "Switch language",
  },
  hero: {
    logoAlt: "AssistantX logo",
    statusPill: "Waitlist open · early access",
    headlineLead: "The AI that",
    headlineAccent: "actually does the work.",
    subtitle:
      "AssistantX writes code, browses, controls your desktop, and remembers what matters — with your permission, in the open.",
    ctaJoin: "Join the waitlist",
    ctaHint: "It takes 15 seconds. No credit card.",
    scrollHint: "Scroll",
  },
  features: {
    eyebrow: "What it does",
    headlineLead: "Not a chatbot.",
    headlineAccent: "An operator.",
    comingSoonLabel: "Coming soon",
    learnMore: "Learn more",
    items: [
      {
        id: "coding",
        title: "Writes code",
        subtitle: "Multi-file editing with a plan and verification",
        body:
          "A full coding operator: plans the change, edits across files, runs the code, and verifies the output before telling you it's done. Not autocomplete — an engineer.",
        bullets: [
          "Multi-file edits with an explicit plan",
          "Syntax + output verification on every change",
          "Live preview and rollback",
        ],
        gradient: "from-indigo-500 to-violet-500",
        glow: "rgba(99,102,241,0.35)",
        icon:
          "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
      },
      {
        id: "reasoning",
        title: "Thinks before acting",
        subtitle: "Multi-step reasoning with confidence scoring",
        body:
          "Before executing anything, AssistantX scores its own confidence, runs a reality check against known facts, and escalates to deeper reasoning when a task is ambiguous. Low confidence means it asks — instead of guessing.",
        bullets: [
          "Confidence scoring on every decision",
          "Reality Check blocks unrealistic plans",
          "Devil's Advocate challenges risky choices",
        ],
        gradient: "from-blue-500 to-cyan-500",
        glow: "rgba(59,130,246,0.35)",
        icon:
          "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
      },
      {
        id: "research",
        title: "Browses the internet",
        subtitle: "Real-time research and web intelligence",
        body:
          "Real-time web research with source tracking: AssistantX searches, reads and synthesizes multiple pages in the background, then reports back with just the essentials — cited.",
        bullets: [
          "Background research — no popup windows",
          "Multi-source synthesis with citations",
          "Verifiable answers you can double-check",
        ],
        gradient: "from-rose-500 to-pink-500",
        glow: "rgba(244,63,94,0.35)",
        icon:
          "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
      },
      {
        id: "browser",
        title: "Uses your apps",
        subtitle: "Deep integration with every tool you use",
        body:
          "AssistantX plugs into the tools you already use — calendars, mail, editors, browsers — and coordinates them in a single conversation instead of making you jump between windows.",
        bullets: [
          "Deep integrations, not shallow shortcuts",
          "Cross-app workflows in one command",
          "Extensible connector system",
        ],
        gradient: "from-amber-500 to-orange-500",
        glow: "rgba(245,158,11,0.35)",
        icon:
          "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
      },
      {
        id: "desktop",
        title: "Controls your computer",
        subtitle: "Native desktop automation and app control",
        body:
          "From launching apps to orchestrating whole workflows, AssistantX operates your desktop natively — clicking, typing and moving files with your permission, never behind your back.",
        bullets: [
          "Native app launching and control",
          "Permission-gated automation",
          "Works across your entire desktop",
        ],
        gradient: "from-emerald-500 to-teal-500",
        glow: "rgba(16,185,129,0.35)",
        icon:
          "M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25",
      },
      {
        id: "memory",
        title: "Has memory",
        subtitle: "Persistent context across all conversations",
        body:
          "AssistantX remembers context across conversations: your preferences, projects and past decisions — all recallable, inspectable and editable. Never a black box.",
        bullets: [
          "Conversation + long-term memory layers",
          "Decision memory with a full audit trail",
          "You can inspect and delete anything",
        ],
        gradient: "from-purple-500 to-indigo-500",
        glow: "rgba(147,51,234,0.35)",
        icon:
          "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
      },
      {
        id: "multiagent",
        title: "Multi-agent intelligence",
        subtitle: "Specialist agents working in parallel",
        body:
          "For big tasks, AssistantX spins up specialist agents that work in parallel — researcher, coder, reviewer — coordinated by a trust-scored orchestration layer. Arriving in v2.0.",
        bullets: [
          "Parallel specialist agents",
          "Trust-scored autonomy per agent",
          "Adversarial verification of results",
        ],
        gradient: "from-red-500 to-orange-500",
        glow: "rgba(239,68,68,0.35)",
        icon:
          "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
      },
      {
        id: "image",
        title: "Creates images",
        subtitle: "Generate and edit visuals through conversation",
        body:
          "Generate and edit visuals through conversation — from quick concept art to polished brand assets, automatically routed to the best available image model.",
        bullets: [
          "Text-to-image generation",
          "Editing and variations",
          "Smart model routing for best quality",
        ],
        gradient: "from-fuchsia-500 to-pink-500",
        glow: "rgba(217,70,239,0.35)",
        icon:
          "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z",
      },
      // Voice is intentionally kept in the list but flagged coming-soon —
      // the wake-word pipeline isn't reliably shipping yet.
      {
        id: "voice",
        title: "Talks with you",
        subtitle: "Voice-first interaction, on-device",
        body:
          "Say a wake word, ask a question, get an answer — with speaker verification and on-device noise handling.",
        bullets: [
          "Wake-word activation",
          "Speaker verification",
          "Fast local transcription",
        ],
        gradient: "from-violet-500 to-fuchsia-500",
        glow: "rgba(168,85,247,0.35)",
        icon:
          "M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z",
        comingSoon: true,
      },
    ],
  },
  comparison: {
    headlineLead: "Beyond chatbots.",
    headlineAccent: "AssistantX gets things done.",
    subtitle:
      "AssistantX is not another AI chatbot — it's an AI that takes action, learns, and delivers.",
    columnFeature: "Feature",
    columnUs: "AssistantX",
    columnThem: "AI Chatbots",
    rows: [
      { feature: "Understands context",       why: "AssistantX keeps project, memory and screen context. Chatbots start from zero with every message." },
      { feature: "Controls your computer",    why: "Chatbots can only talk about it. AssistantX actually clicks, types, launches and automates." },
      { feature: "Remembers everything",      why: "Persistent layered memory — versus a context window that forgets as soon as it fills up." },
      { feature: "Multi-agent reasoning",     why: "Parallel specialist agents cross-check each other's work instead of one model guessing alone." },
      { feature: "Voice-first interface",     why: "An always-listening wake word with speaker verification — not a push-to-talk gimmick." },
      { feature: "Learns from mistakes",      why: "Failures become versioned lessons that change future behavior. Chatbots repeat the same errors." },
      { feature: "Executes real actions",     why: "Files, apps, code, web — real side effects, protected by permission gates you control." },
      { feature: "Works offline",             why: "Local models keep working with no internet — and your data stays on your machine." },
    ],
  },
  waitlist: {
    eyebrow: "Be first in line",
    headlineLead: "Get early access",
    headlineAccent: "before everyone else.",
    subtitle: "Join the waitlist and be among the first to try AssistantX.",
    namePlaceholder: "Your name",
    emailPlaceholder: "your@email.com",
    submitIdle: "Join Us",
    submitLoading: "Joining…",
    successTitleFirst: "You're on the list! 🎉",
    successBodyFirst: "We'll notify you when AssistantX is ready.",
    successTitleAlready: "You're already on the list",
    successBodyAlready: "This email is already registered — no need to sign up twice.",
    pendingTitle: "Check your email 📬",
    pendingBody: "We sent you a confirmation link. Click it to lock in your spot — check spam if you don't see it.",
    errorGeneric: "Something went wrong — please try again.",
    errorRateLimited: "Too many signups from your network — please try again in a little while.",
    disclosureName:
      "When you join, your first name (e.g. “Anna K.”) is announced in our Discord community. Your email is never shown anywhere.",
    // Legal note — reviewed placeholder, not final legal wording.
    disclosureGdprPrefix: "By clicking “Join Us” you agree to Acrux.pl Sp. z o.o. processing your name and email address to notify you about the AssistantX launch. See our ",
    disclosureGdprLink: "Privacy Policy",
    disclosureGdprSuffix: " for details.",
    counterSuffix: "people waiting",
  },
  community: {
    headlineLead: "Join the community.",
    headlineAccent: "",
    cards: {
      discord:  { label: "Discord",       desc: "Chat with builders" },
      docs:     { label: "Documentation", desc: "Learn how it works" },
      roadmap:  { label: "Roadmap",       desc: "See what's next" },
    },
  },
  footer: {
    tagline: "AssistantX",
    copyright: "© {year} Acrux.pl Sp. z o.o. All rights reserved.",
  },
};

// ─────────────────────────────────────────────────────────────
// Polish copy.  Mirrors EN structure key-for-key; do not add or drop keys
// here without doing the same in EN — TypeScript will complain if you do.
// ─────────────────────────────────────────────────────────────
const PL: LandingCopy = {
  meta: {
    title: "AssistantX",
    description:
      "AssistantX to sztuczna inteligencja, która naprawdę wykonuje pracę — pisze kod, przegląda sieć, steruje pulpitem i pamięta Twoje preferencje.",
  },
  nav: {
    joinCta: "Dołącz do nas",
    langToggleAria: "Zmień język",
  },
  hero: {
    logoAlt: "Logo AssistantX",
    statusPill: "Waitlist otwarta · wczesny dostęp",
    headlineLead: "Sztuczna inteligencja,",
    headlineAccent: "która działa za Ciebie.",
    subtitle:
      "AssistantX pisze kod, przegląda sieć, steruje pulpitem i pamięta to, co ważne — za Twoją zgodą, transparentnie.",
    ctaJoin: "Dołącz do waitlisty",
    ctaHint: "Zajmie 15 sekund. Bez karty.",
    scrollHint: "Przewiń",
  },
  features: {
    eyebrow: "Co potrafi",
    headlineLead: "To nie chatbot.",
    headlineAccent: "To operator.",
    comingSoonLabel: "Wkrótce",
    learnMore: "Zobacz więcej",
    items: [
      {
        id: "coding",
        title: "Pisze kod",
        subtitle: "Wieloplikowa edycja z planem i weryfikacją",
        body:
          "Pełny operator programistyczny: planuje zmianę, edytuje w wielu plikach, uruchamia kod i weryfikuje wynik, zanim powie „gotowe”. To nie autouzupełnianie — to inżynier.",
        bullets: [
          "Wieloplikowe zmiany z jawnym planem",
          "Weryfikacja składni i wyniku po każdej zmianie",
          "Podgląd na żywo i cofnięcie",
        ],
        gradient: "from-indigo-500 to-violet-500",
        glow: "rgba(99,102,241,0.35)",
        icon:
          "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
      },
      {
        id: "reasoning",
        title: "Myśli, zanim działa",
        subtitle: "Wielokrokowe rozumowanie z oceną pewności",
        body:
          "Zanim cokolwiek wykona, AssistantX ocenia własną pewność, weryfikuje pomysł względem znanych faktów i eskaluje do głębszego rozumowania, gdy zadanie jest niejednoznaczne. Niska pewność = pyta, a nie zgaduje.",
        bullets: [
          "Ocena pewności każdej decyzji",
          "Reality Check blokuje nierealne plany",
          "Adwokat Diabła kwestionuje ryzykowne wybory",
        ],
        gradient: "from-blue-500 to-cyan-500",
        glow: "rgba(59,130,246,0.35)",
        icon:
          "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
      },
      {
        id: "research",
        title: "Przegląda internet",
        subtitle: "Badania w czasie rzeczywistym z cytatami",
        body:
          "Sieciowy research w czasie rzeczywistym z zachowaniem źródeł: AssistantX szuka, czyta i syntetyzuje wiele stron w tle, a potem raportuje tylko to, co istotne — z cytatami.",
        bullets: [
          "Badania w tle — bez wyskakujących okien",
          "Synteza wielu źródeł z cytatami",
          "Odpowiedzi, które można zweryfikować",
        ],
        gradient: "from-rose-500 to-pink-500",
        glow: "rgba(244,63,94,0.35)",
        icon:
          "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
      },
      {
        id: "browser",
        title: "Używa Twoich aplikacji",
        subtitle: "Głęboka integracja z narzędziami, których używasz",
        body:
          "AssistantX podłącza się do Twoich narzędzi — kalendarza, poczty, edytora, przeglądarki — i koordynuje je w jednej rozmowie, zamiast zmuszać Cię do przeskakiwania między oknami.",
        bullets: [
          "Głębokie integracje, nie płytkie skróty",
          "Międzyaplikacyjne przepływy w jednym poleceniu",
          "Rozszerzalny system konektorów",
        ],
        gradient: "from-amber-500 to-orange-500",
        glow: "rgba(245,158,11,0.35)",
        icon:
          "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
      },
      {
        id: "desktop",
        title: "Steruje Twoim komputerem",
        subtitle: "Natywna automatyzacja pulpitu i aplikacji",
        body:
          "Od uruchamiania aplikacji po orkiestrację całych przepływów — AssistantX obsługuje pulpit natywnie: klika, pisze, przenosi pliki. Za Twoją zgodą, nigdy za Twoimi plecami.",
        bullets: [
          "Natywne uruchamianie i sterowanie aplikacjami",
          "Automatyzacja gated permission",
          "Działa na całym pulpicie",
        ],
        gradient: "from-emerald-500 to-teal-500",
        glow: "rgba(16,185,129,0.35)",
        icon:
          "M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25",
      },
      {
        id: "memory",
        title: "Pamięta",
        subtitle: "Trwały kontekst między rozmowami",
        body:
          "AssistantX pamięta kontekst między rozmowami: Twoje preferencje, projekty i wcześniejsze decyzje — wszystko dostępne do wglądu i edycji. Żadnej czarnej skrzynki.",
        bullets: [
          "Warstwy pamięci: rozmowa + długoterminowa",
          "Pamięć decyzji z pełnym audytem",
          "Możesz przeglądać i usuwać cokolwiek",
        ],
        gradient: "from-purple-500 to-indigo-500",
        glow: "rgba(147,51,234,0.35)",
        icon:
          "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
      },
      {
        id: "multiagent",
        title: "Inteligencja wieloagentowa",
        subtitle: "Wyspecjalizowani agenci pracujący równolegle",
        body:
          "Do dużych zadań AssistantX uruchamia wyspecjalizowanych agentów pracujących równolegle — researcher, coder, reviewer — koordynowanych przez warstwę orkiestracji z oceną zaufania. Wchodzi w wersji v2.0.",
        bullets: [
          "Równolegli wyspecjalizowani agenci",
          "Autonomia per agent z oceną zaufania",
          "Adwersaryjna weryfikacja wyników",
        ],
        gradient: "from-red-500 to-orange-500",
        glow: "rgba(239,68,68,0.35)",
        icon:
          "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
      },
      {
        id: "image",
        title: "Tworzy obrazy",
        subtitle: "Generuje i edytuje wizualizacje w rozmowie",
        body:
          "Generuje i edytuje wizualizacje przez rozmowę — od szybkich koncepcji po dopracowane materiały marki. Automatyczny routing do najlepszego dostępnego modelu.",
        bullets: [
          "Generowanie tekst-obraz",
          "Edycja i warianty",
          "Inteligentny wybór modelu dla najlepszej jakości",
        ],
        gradient: "from-fuchsia-500 to-pink-500",
        glow: "rgba(217,70,239,0.35)",
        icon:
          "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z",
      },
      {
        id: "voice",
        title: "Rozmawia z Tobą",
        subtitle: "Interfejs głosowy, na urządzeniu",
        body:
          "Powiedz słowo aktywacji, zadaj pytanie, dostań odpowiedź — z weryfikacją mówcy i lokalną obróbką szumu.",
        bullets: [
          "Aktywacja słowem kluczowym",
          "Weryfikacja mówcy",
          "Szybka lokalna transkrypcja",
        ],
        gradient: "from-violet-500 to-fuchsia-500",
        glow: "rgba(168,85,247,0.35)",
        icon:
          "M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z",
        comingSoon: true,
      },
    ],
  },
  comparison: {
    headlineLead: "Więcej niż chatbot.",
    headlineAccent: "AssistantX naprawdę działa.",
    subtitle:
      "AssistantX to nie kolejny chatbot AI — to inteligencja, która podejmuje działanie, uczy się i realizuje zadania.",
    columnFeature: "Funkcja",
    columnUs: "AssistantX",
    columnThem: "Chatboty AI",
    rows: [
      { feature: "Rozumie kontekst",              why: "AssistantX zachowuje kontekst projektu, pamięci i ekranu. Chatboty zaczynają od zera przy każdej wiadomości." },
      { feature: "Steruje Twoim komputerem",      why: "Chatboty tylko o tym mówią. AssistantX faktycznie klika, pisze, uruchamia i automatyzuje." },
      { feature: "Pamięta wszystko",              why: "Trwała, warstwowa pamięć — a nie okno kontekstu, które zapomina, jak tylko się zapełni." },
      { feature: "Rozumowanie wieloagentowe",     why: "Równolegli wyspecjalizowani agenci wzajemnie sprawdzają swoją pracę, zamiast jednego modelu zgadującego samotnie." },
      { feature: "Interfejs głosowy",             why: "Słuchanie z aktywacją słowem kluczowym i weryfikacją mówcy — nie gadżet typu „naciśnij i mów”." },
      { feature: "Uczy się na błędach",           why: "Porażki stają się wersjonowanymi lekcjami, które zmieniają przyszłe zachowanie. Chatboty powtarzają te same błędy." },
      { feature: "Wykonuje realne działania",     why: "Pliki, aplikacje, kod, sieć — realne skutki chronione bramkami uprawnień, które Ty kontrolujesz." },
      { feature: "Działa offline",                why: "Lokalne modele pracują bez internetu — a Twoje dane zostają na Twoim komputerze." },
    ],
  },
  waitlist: {
    eyebrow: "Zapisz się jako pierwszy",
    headlineLead: "Otrzymaj wczesny dostęp,",
    headlineAccent: "zanim wystartujemy.",
    subtitle: "Zapisz się na listę i bądź jednym z pierwszych, którzy wypróbują AssistantX.",
    namePlaceholder: "Twoje imię",
    emailPlaceholder: "twoj@email.pl",
    submitIdle: "Dołącz do nas",
    submitLoading: "Zapisywanie…",
    successTitleFirst: "Jesteś na liście! 🎉",
    successBodyFirst: "Damy znać, gdy AssistantX będzie gotowy.",
    successTitleAlready: "Już jesteś na liście",
    successBodyAlready: "Ten adres e-mail jest już zarejestrowany — nie ma potrzeby zapisywać się drugi raz.",
    pendingTitle: "Sprawdź skrzynkę 📬",
    pendingBody: "Wysłaliśmy link potwierdzający. Kliknij go, żeby zaklepać miejsce — jeśli nie widzisz, zajrzyj do spamu.",
    errorGeneric: "Coś poszło nie tak — spróbuj ponownie.",
    errorRateLimited: "Zbyt wiele zgłoszeń z Twojej sieci — spróbuj ponownie za chwilę.",
    disclosureName:
      "Gdy dołączysz, Twoje imię (np. „Anna K.”) pojawi się na naszym Discordzie. Twój e-mail nigdy nie jest nigdzie pokazywany.",
    disclosureGdprPrefix: "Klikając „Dołącz do nas” zgadzasz się, aby Acrux.pl Sp. z o.o. przetwarzała Twoje imię i adres e-mail w celu powiadomienia Cię o starcie AssistantX. Szczegóły w ",
    disclosureGdprLink: "Polityce Prywatności",
    disclosureGdprSuffix: ".",
    counterSuffix: "osób oczekuje",
  },
  community: {
    headlineLead: "Dołącz do społeczności.",
    headlineAccent: "",
    cards: {
      discord:  { label: "Discord",     desc: "Rozmawiaj z twórcami" },
      docs:     { label: "Dokumentacja", desc: "Poznaj jak to działa" },
      roadmap:  { label: "Roadmap",     desc: "Zobacz, co dalej" },
    },
  },
  footer: {
    tagline: "AssistantX",
    copyright: "© {year} Acrux.pl Sp. z o.o. Wszelkie prawa zastrzeżone.",
  },
};

export function getLandingCopy(lang: PublicUILanguage): LandingCopy {
  return lang === "pl" ? PL : EN;
}
