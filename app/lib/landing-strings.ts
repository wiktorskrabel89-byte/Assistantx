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
      titleTop: "The AI",
      titleBottom: "Operating System.",
      subtitle:
        "AssistantX-Jarvis is the intelligence layer between you and your entire digital life. It thinks, acts, learns, and evolves.",
      joinCta: "Join Waitlist",
      demoCta: "Watch Demo",
    },
    showcaseHeading: { top: "Not a chatbot.", bottom: "An operating system." },
    demos: {
      heading: "See it in action.",
      subtitle: "Real demonstrations of what Jarvis can do.",
      comingSoon: "Coming soon",
      filmSubtitle: "Demo film",
      filmBody:
        "This demo film is in production. Join the waitlist and you'll be the first to see Jarvis in action — real tasks, real screen, no cuts.",
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
        "AssistantX-Jarvis is not another AI chatbot. It is an AI Operating System.",
      feature: "Feature",
      jarvisCol: "Jarvis",
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
      successOnBody: "We'll notify you when Jarvis is ready.",
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
      titleTop: "System operacyjny",
      titleBottom: "sztucznej inteligencji.",
      subtitle:
        "AssistantX-Jarvis to warstwa inteligencji między Tobą a Twoim całym cyfrowym życiem. Myśli, działa, uczy się i ewoluuje.",
      joinCta: "Dołącz do listy",
      demoCta: "Zobacz demo",
    },
    showcaseHeading: { top: "To nie chatbot.", bottom: "To system operacyjny." },
    demos: {
      heading: "Zobacz w akcji.",
      subtitle: "Prawdziwe pokazy tego, co potrafi Jarvis.",
      comingSoon: "Wkrótce",
      filmSubtitle: "Film demo",
      filmBody:
        "Ten film demo jest w produkcji. Dołącz do listy oczekujących, a jako pierwszy zobaczysz Jarvisa w akcji — prawdziwe zadania, prawdziwy ekran, bez cięć.",
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
        "AssistantX-Jarvis to nie kolejny chatbot AI. To system operacyjny AI.",
      feature: "Funkcja",
      jarvisCol: "Jarvis",
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
      successOnBody: "Powiadomimy Cię, gdy Jarvis będzie gotowy.",
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
