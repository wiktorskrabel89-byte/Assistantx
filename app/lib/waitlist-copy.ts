import type { PublicUILanguage } from "@/app/lib/ui-language";

export type WaitlistCopy = {
  badge: string;
  title: string;
  titleAccent: string;
  tagline: string;
  intro: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitButton: string;
  submitButtonLoading: string;
  successMessage: string;
  alreadyOnListMessage: string;
  errorMessage: string;
  invalidEmailMessage: string;
  privacyNote: string;
  privacyLink: string;
  footerRights: string;
};

export const WAITLIST_COPY: Record<PublicUILanguage, WaitlistCopy> = {
  en: {
    badge: "Coming soon",
    title: "The next chapter of",
    titleAccent: "AssistantX",
    tagline: "We're building something bigger. Be the first to know.",
    intro:
      "AssistantX is evolving into a new kind of AI workspace. Join the waitlist to get early access and updates as we get closer to launch.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    submitButton: "Join the waitlist",
    submitButtonLoading: "Joining...",
    successMessage: "You're on the list! We'll be in touch soon.",
    alreadyOnListMessage: "You're already on the waitlist — thanks for your enthusiasm!",
    errorMessage: "Something went wrong. Please try again.",
    invalidEmailMessage: "Please enter a valid email address.",
    privacyNote: "We'll only use your email to share AssistantX updates. See our",
    privacyLink: "Privacy Policy",
    footerRights: "All rights reserved.",
  },
  pl: {
    badge: "Wkrótce",
    title: "Nowy rozdział",
    titleAccent: "AssistantX",
    tagline: "Budujemy coś większego. Bądź pierwszy, który się dowie.",
    intro:
      "AssistantX przekształca się w nowy rodzaj workspace AI. Zapisz się na listę, aby uzyskać wczesny dostęp i aktualności w miarę zbliżania się do startu.",
    emailLabel: "Adres e-mail",
    emailPlaceholder: "ty@przyklad.pl",
    submitButton: "Zapisz się na listę",
    submitButtonLoading: "Zapisywanie...",
    successMessage: "Jesteś na liście! Wkrótce się odezwiemy.",
    alreadyOnListMessage: "Jesteś już na liście — dziękujemy za zainteresowanie!",
    errorMessage: "Coś poszło nie tak. Spróbuj ponownie.",
    invalidEmailMessage: "Podaj prawidłowy adres e-mail.",
    privacyNote: "Użyjemy Twojego adresu e-mail tylko do aktualności o AssistantX. Zobacz",
    privacyLink: "Politykę prywatności",
    footerRights: "Wszelkie prawa zastrzeżone.",
  },
};
