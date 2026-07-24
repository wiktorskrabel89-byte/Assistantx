import type { PublicUILanguage } from "@/app/lib/ui-language";

export type PageStrings = {
  back: string;
  nav: { faq: string; privacy: string; terms: string; contact: string };
  footerRights: string;
  faq: {
    eyebrow: string;
    heading: string;
    intro: string;
    notFound: string;
    getInTouch: string;
  };
  contact: {
    eyebrow: string;
    heading: string;
    intro: string;
    sendEmail: string;
    alsoReach: string;
    discord: string;
    reasons: {
      general: { label: string; subject: string; desc: string };
      support: { label: string; subject: string; desc: string };
      privacy: { label: string; subject: string; desc: string };
      legal: { label: string; subject: string; desc: string };
    };
  };
  legal: {
    lastUpdatedLabel: string;
    privacyIntro: string;
    termsIntro: string;
  };
};

export const PAGE_STRINGS: Record<PublicUILanguage, PageStrings> = {
  en: {
    back: "Back to AssistantX",
    nav: { faq: "FAQ", privacy: "Privacy", terms: "Terms", contact: "Contact" },
    footerRights: "All rights reserved.",
    faq: {
      eyebrow: "FAQ",
      heading: "Frequently asked.",
      intro: "Short, honest answers to the questions we hear most.",
      notFound: "Didn't find your answer?",
      getInTouch: "Get in touch",
    },
    contact: {
      eyebrow: "Contact",
      heading: "Get in touch.",
      intro:
        "Pick the topic that fits and tap the button — your mail app will open with the subject filled in. We aim to reply within 1–2 business days.",
      sendEmail: "Send email",
      alsoReach: "You can also reach us through our",
      discord: "Discord community",
      reasons: {
        general: {
          label: "General",
          subject: "AssistantX — General enquiry",
          desc: "Product questions, feedback, partnerships, press.",
        },
        support: {
          label: "Support",
          subject: "AssistantX — Support request",
          desc: "Something isn't working, or you need help with your account.",
        },
        privacy: {
          label: "Privacy & data",
          subject: "AssistantX — Privacy request",
          desc: "GDPR requests, data access, deletion, or questions about our Privacy Policy.",
        },
        legal: {
          label: "Legal",
          subject: "AssistantX — Legal question",
          desc: "Terms of Service questions, licensing, or legal notices.",
        },
      },
    },
    legal: {
      lastUpdatedLabel: "Last updated",
      privacyIntro:
        "This Privacy Policy describes how AssistantX (the “Service”) collects, uses, and shares information when you visit the website, create an account, or use any of the product's features. By using the Service you agree to the practices described here.",
      termsIntro:
        "These Terms of Service (the “Terms”) are a legal agreement between you and the operator of AssistantX (the “Service”). They govern your access to and use of the Service, including the website, chat, uploads, integrations, and any related features. By using the Service you agree to these Terms.",
    },
  },
  pl: {
    back: "Powrót do AssistantX",
    nav: {
      faq: "FAQ",
      privacy: "Prywatność",
      terms: "Regulamin",
      contact: "Kontakt",
    },
    footerRights: "Wszelkie prawa zastrzeżone.",
    faq: {
      eyebrow: "FAQ",
      heading: "Najczęściej zadawane.",
      intro: "Krótkie, uczciwe odpowiedzi na najczęstsze pytania.",
      notFound: "Nie znalazłeś odpowiedzi?",
      getInTouch: "Napisz do nas",
    },
    contact: {
      eyebrow: "Kontakt",
      heading: "Napisz do nas.",
      intro:
        "Wybierz pasujący temat i kliknij przycisk — Twoja aplikacja pocztowa otworzy się z uzupełnionym tematem. Odpowiadamy zwykle w 1–2 dni robocze.",
      sendEmail: "Wyślij email",
      alsoReach: "Możesz też skontaktować się z nami przez",
      discord: "społeczność Discord",
      reasons: {
        general: {
          label: "Ogólne",
          subject: "AssistantX — Zapytanie ogólne",
          desc: "Pytania o produkt, opinie, partnerstwa, prasa.",
        },
        support: {
          label: "Wsparcie",
          subject: "AssistantX — Prośba o wsparcie",
          desc: "Coś nie działa lub potrzebujesz pomocy z kontem.",
        },
        privacy: {
          label: "Prywatność i dane",
          subject: "AssistantX — Prośba o prywatność",
          desc: "Wnioski RODO, dostęp do danych, usunięcie lub pytania o Politykę prywatności.",
        },
        legal: {
          label: "Prawne",
          subject: "AssistantX — Pytanie prawne",
          desc: "Pytania o Regulamin, licencje, zawiadomienia prawne.",
        },
      },
    },
    legal: {
      lastUpdatedLabel: "Ostatnia aktualizacja",
      privacyIntro:
        "Niniejsza Polityka prywatności opisuje, w jaki sposób AssistantX („Usługa”) gromadzi, wykorzystuje i udostępnia informacje, gdy odwiedzasz stronę, tworzysz konto lub korzystasz z funkcji produktu. Korzystając z Usługi, akceptujesz opisane tutaj praktyki.",
      termsIntro:
        "Niniejszy Regulamin („Regulamin”) stanowi umowę prawną między Tobą a operatorem AssistantX („Usługa”). Reguluje dostęp do i korzystanie z Usługi, w tym strony internetowej, czatu, przesyłanych plików, integracji i powiązanych funkcji. Korzystając z Usługi, akceptujesz ten Regulamin.",
    },
  },
};
