/**
 * Language settings. The language lives in a cookie (no /en or /ar in the URL),
 * so switching language keeps the student on the same page.
 */
export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const THEME_COOKIE = "soussy-theme";
export type ThemeChoice = "system" | "light" | "dark";

/** Arabic is written right-to-left. */
export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
