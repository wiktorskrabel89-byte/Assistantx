export const UI_LANGUAGE_COOKIE_NAME = "assistantx-ui-language";

export type PublicUILanguage = "en" | "pl";

export function normalizePublicLanguage(value: string | null | undefined): PublicUILanguage {
  return value?.toLowerCase() === "pl" ? "pl" : "en";
}

export function detectLanguageFromAcceptLanguage(value: string | null | undefined): PublicUILanguage {
  if (!value) return "en";
  const normalized = value.toLowerCase();
  if (normalized.startsWith("pl") || normalized.includes(",pl") || normalized.includes(";q=pl")) {
    return "pl";
  }
  return "en";
}

export function detectPreferredPublicLanguage({
  existingCookie,
  countryCode,
  acceptLanguage,
}: {
  existingCookie: string | null | undefined;
  countryCode: string | null | undefined;
  acceptLanguage: string | null | undefined;
}): PublicUILanguage {
  if (existingCookie) {
    return normalizePublicLanguage(existingCookie);
  }
  if (countryCode?.toUpperCase() === "PL") {
    return "pl";
  }
  return detectLanguageFromAcceptLanguage(acceptLanguage);
}
