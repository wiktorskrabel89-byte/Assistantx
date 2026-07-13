/**
 * Locale module — contract tests on the constants exported alongside the
 * useMeridianLocale React hook. The hook itself needs a DOM (covered by an
 * integration test in a follow-on); these guard the public surface so a
 * silent rename doesn't break the wizard, Settings → Ogólne picker, and
 * any future i18n consumer at once.
 */

import {
  LOCALE_AVAILABILITY,
  LOCALE_GREETING,
  LOCALE_LABELS,
  MERIDIAN_LOCALE_DEFAULT,
  MERIDIAN_LOCALE_STORAGE_KEYS,
  type LocaleId,
} from "../app/components/meridian/useMeridianLocale";

describe("meridian-locale module surface", () => {
  const expectedIds: LocaleId[] = ["pl", "en", "es", "de"];

  test("exports all four locale ids in labels, greetings, availability", () => {
    for (const id of expectedIds) {
      expect(LOCALE_LABELS[id]).toBeTruthy();
      expect(LOCALE_GREETING[id]).toBeTruthy();
      expect(["active", "coming-soon"]).toContain(LOCALE_AVAILABILITY[id]);
    }
  });

  test("polish and english are active; spanish and german are coming-soon", () => {
    expect(LOCALE_AVAILABILITY.pl).toBe("active");
    expect(LOCALE_AVAILABILITY.en).toBe("active");
    expect(LOCALE_AVAILABILITY.es).toBe("coming-soon");
    expect(LOCALE_AVAILABILITY.de).toBe("coming-soon");
  });

  test("default locale is one of the active ones", () => {
    expect(LOCALE_AVAILABILITY[MERIDIAN_LOCALE_DEFAULT]).toBe("active");
  });

  test("storage keys are stable strings that any tab can observe", () => {
    expect(MERIDIAN_LOCALE_STORAGE_KEYS.locale).toBe("jarvis.locale");
    expect(MERIDIAN_LOCALE_STORAGE_KEYS.chosen).toBe("jarvis.locale.chosen");
  });

  test("polish greeting is the native Cześć… form", () => {
    expect(LOCALE_GREETING.pl.startsWith("Cześć")).toBe(true);
  });
});
