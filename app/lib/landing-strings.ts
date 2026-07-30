import type { PublicUILanguage } from "@/app/lib/ui-language";

export type LandingStrings = {
  hero: {
    titleTop: string;
    titleBottom: string;
    subtitle: string;
    joinCta: string;
    demoCta: string;
  };
  showcaseHeading: { top: string; bottom: string };
  /** Scroll-driven laptop tour: one entry per stage, in display order. */
  tour: {
    eyebrow: string;
    scrollHint: string;
    learnMore: string;
    comingSoon: string;
    stages: { id: string; label: string; title: string; subtitle: string }[];
  };
  demos: {
    heading: string;
    subtitle: string;
    comingSoon: string;
    filmSubtitle: string;
    filmBody: string;
    filmBullets: string[];
  };
  timelineHeading: string;
  comparison: {
    heading: string;
    subheading: string;
    feature: string;
    jarvisCol: string;
    chatbotCol: string;
  };
  waitlist: {
    heading: string;
    subheading: string;
    successAlready: string;
    successAlreadyBody: string;
    successPending: string;
    successPendingBody: string;
    successOn: string;
    successOnBody: string;
    namePh: string;
    emailPh: string;
    joining: string;
    join: string;
    rateLimited: string;
    genericError: string;
    disclaimer: string;
    peopleWaiting: string;
    referralTitle: string;
    referralBody: string;
    referredByBanner: string;
    copy: string;
    copied: string;
  };
  community: {
    heading: string;
    discord: { label: string; desc: string };
    docs: { label: string; desc: string };
    roadmap: { label: string; desc: string };
  };
  footer: {
    faq: string;
    privacy: string;
    terms: string;
    contact: string;
    rights: string;
  };
  modal: {
    close: string;
    getAccess: string;
  };
  langLabel: string;
};

export const STRINGS: Record<PublicUILanguage, LandingStrings> = {
  en: {
    hero: {
      titleTop: "The AI that",
      titleBottom: "actually does the work.",
      subtitle:
        "AssistantX is the intelligence layer between you and your entire digital life. It thinks, acts, learns, and evolves.",
      joinCta: "Join Waitlist",
      demoCta: "Watch Demo",
    },
    showcaseHeading: { top: "Not a chatbot.", bottom: "An operator." },
    tour: {
      eyebrow: "What it does",
      scrollHint: "Scroll",
      learnMore: "Learn more",
      comingSoon: "Coming soon",
      stages: [
        { id: "coding", label: "CODING", title: "Writes code", subtitle: "Multi-file edits with a plan and verification" },
        { id: "memory", label: "MEMORY", title: "Remembers", subtitle: "Durable context across every conversation" },
        { id: "desktop", label: "DESKTOP", title: "Runs your computer", subtitle: "Native app and workflow automation" },
        { id: "reasoning", label: "REASONING", title: "Thinks before acting", subtitle: "Multi-step reasoning with confidence scoring" },
        { id: "agents", label: "MULTIAGENT", title: "Multi-agent intelligence", subtitle: "Specialised agents working in parallel" },
        { id: "voice", label: "VOICE", title: "Talks with you", subtitle: "Voice-first interaction, on-device" },
      ],
    },
    demos: {
      heading: "See it in action.",
      subtitle: "Real demonstrations of what AssistantX can do.",
      comingSoon: "Coming soon",
      filmSubtitle: "Demo film",
      filmBody:
        "This demo film is in production. Join the waitlist and you'll be the first to see AssistantX in action — real tasks, real screen, no cuts.",
      filmBullets: [
        "Recorded on real hardware, unscripted",
        "Narrated walkthrough of every step",
        "Premieres to waitlist members first",
      ],
    },
    timelineHeading: "The full stack of intelligence.",
    comparison: {
      heading: "Beyond chatbots.",
      subheading:
        "AssistantX is not another AI chatbot. It is an operator that gets work done.",
      feature: "Feature",
      jarvisCol: "AssistantX",
      chatbotCol: "AI Chatbots",
    },
    waitlist: {
      heading: "Be first in line.",
      subheading:
        "Join the waitlist and get early access to the future of computing.",
      successAlready: "You're already on the list!",
      successAlreadyBody:
        "This email is already registered — no need to sign up twice.",
      successPending: "Check your email 📬",
      successPendingBody:
        "We sent you a confirmation link. Click it to lock in your spot — check spam if you don't see it.",
      successOn: "You're on the list!",
      successOnBody: "We'll notify you when AssistantX is ready.",
      namePh: "Your name",
      emailPh: "your@email.com",
      joining: "Joining…",
      join: "Join Waitlist",
      rateLimited:
        "Too many signups from your network — please try again in a little while.",
      genericError: "Something went wrong — please try again.",
      disclaimer:
        "By joining the waitlist you agree to receive occasional email updates about AssistantX — you can unsubscribe at any time. Your first name (e.g. “Anna K.”) is announced in our Discord community; your email is never shown anywhere.",
      peopleWaiting: "people waiting",
      referralTitle: "Your invite link",
      referralBody: "Every friend that confirms bumps you up the queue. Share it anywhere.",
      referredByBanner: "You were invited by a friend — they get a bump when you confirm. Thanks! 🙌",
      copy: "Copy",
      copied: "Copied!",
    },
    community: {
      heading: "Join the community.",
      discord: { label: "Discord", desc: "Chat with builders" },
      docs: { label: "Documentation", desc: "Learn how it works" },
      roadmap: { label: "Roadmap", desc: "See what's next" },
    },
    footer: {
      faq: "FAQ",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      contact: "Contact",
      rights: "All rights reserved.",
    },
    modal: { close: "Close", getAccess: "Get early access" },
    langLabel: "Language",
  },
  pl: {
    hero: {
      titleTop: "Sztuczna inteligencja,",
      titleBottom: "która działa za Ciebie.",
      subtitle:
        "AssistantX to warstwa inteligencji między Tobą a Twoim całym cyfrowym życiem. Myśli, działa, uczy się i ewoluuje.",
      joinCta: "Dołącz do listy",
      demoCta: "Zobacz demo",
    },
    showcaseHeading: { top: "To nie chatbot.", bottom: "To operator." },
    tour: {
      eyebrow: "Co potrafi",
      scrollHint: "Przewiń",
      learnMore: "Zobacz więcej",
      comingSoon: "Wkrótce",
      stages: [
        { id: "coding", label: "CODING", title: "Pisze kod", subtitle: "Wieloplikowa edycja z planem i weryfikacją" },
        { id: "memory", label: "MEMORY", title: "Pamięta", subtitle: "Trwały kontekst między rozmowami" },
        { id: "desktop", label: "DESKTOP", title: "Steruje Twoim komputerem", subtitle: "Natywna automatyzacja aplikacji i pulpitu" },
        { id: "reasoning", label: "REASONING", title: "Myśli, zanim działa", subtitle: "Wielokrokowe rozumowanie z oceną pewności" },
        { id: "agents", label: "MULTIAGENT", title: "Inteligencja wieloagentowa", subtitle: "Wyspecjalizowani agenci pracujący równolegle" },
        { id: "voice", label: "VOICE", title: "Rozmawia z Tobą", subtitle: "Interfejs głosowy, na urządzeniu" },
      ],
    },
    demos: {
      heading: "Zobacz w akcji.",
      subtitle: "Prawdziwe pokazy tego, co potrafi AssistantX.",
      comingSoon: "Wkrótce",
      filmSubtitle: "Film demo",
      filmBody:
        "Ten film demo jest w produkcji. Dołącz do listy oczekujących, a jako pierwszy zobaczysz AssistantX w akcji — prawdziwe zadania, prawdziwy ekran, bez cięć.",
      filmBullets: [
        "Nagrany na prawdziwym sprzęcie, bez scenariusza",
        "Narracyjny przegląd każdego kroku",
        "Premiera najpierw dla osób z listy",
      ],
    },
    timelineHeading: "Pełny stos inteligencji.",
    comparison: {
      heading: "Więcej niż chatbot.",
      subheading:
        "AssistantX to nie kolejny chatbot AI. To operator, który realnie wykonuje zadania.",
      feature: "Funkcja",
      jarvisCol: "AssistantX",
      chatbotCol: "Chatboty AI",
    },
    waitlist: {
      heading: "Bądź pierwszy w kolejce.",
      subheading:
        "Dołącz do listy oczekujących i uzyskaj wczesny dostęp do przyszłości komputerów.",
      successAlready: "Jesteś już na liście!",
      successAlreadyBody:
        "Ten email jest już zarejestrowany — nie musisz zapisywać się drugi raz.",
      successPending: "Sprawdź skrzynkę 📬",
      successPendingBody:
        "Wysłaliśmy link potwierdzający. Kliknij, aby zabezpieczyć swoje miejsce — sprawdź spam, jeśli nie widzisz maila.",
      successOn: "Jesteś na liście!",
      successOnBody: "Powiadomimy Cię, gdy AssistantX będzie gotowy.",
      namePh: "Twoje imię",
      emailPh: "twoj@email.com",
      joining: "Dołączanie…",
      join: "Dołącz do listy",
      rateLimited:
        "Zbyt wiele zapisów z Twojej sieci — spróbuj ponownie za chwilę.",
      genericError: "Coś poszło nie tak — spróbuj ponownie.",
      disclaimer:
        "Dołączając do listy oczekujących zgadzasz się na otrzymywanie okazjonalnych maili z aktualizacjami o AssistantX — możesz się wypisać w każdej chwili. Twoje imię (np. „Anna K.”) jest ogłaszane na naszym Discordzie; Twój email nie jest nigdzie pokazywany.",
      peopleWaiting: "osób w kolejce",
      referralTitle: "Twój link z zaproszeniem",
      referralBody: "Każdy znajomy, który potwierdzi, przesuwa Cię wyżej w kolejce. Wyślij dalej.",
      referredByBanner: "Zaprosił Cię znajomy — po potwierdzeniu on też dostanie boost. Dzięki! 🙌",
      copy: "Kopiuj",
      copied: "Skopiowano!",
    },
    community: {
      heading: "Dołącz do społeczności.",
      discord: { label: "Discord", desc: "Rozmawiaj z twórcami" },
      docs: { label: "Dokumentacja", desc: "Dowiedz się, jak to działa" },
      roadmap: { label: "Roadmapa", desc: "Zobacz, co dalej" },
    },
    footer: {
      faq: "FAQ",
      privacy: "Polityka prywatności",
      terms: "Regulamin",
      contact: "Kontakt",
      rights: "Wszelkie prawa zastrzeżone.",
    },
    modal: { close: "Zamknij", getAccess: "Zdobądź wczesny dostęp" },
    langLabel: "Język",
  },
};
