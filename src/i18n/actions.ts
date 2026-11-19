"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, THEME_COOKIE, type ThemeChoice } from "./config";

const YEAR = 60 * 60 * 24 * 365;

/** Saves the chosen language. The page re-renders in the new language and direction. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

/** Saves light / dark / system theme. */
export async function setTheme(theme: ThemeChoice) {
  if (!["system", "light", "dark"].includes(theme)) return;
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", maxAge: YEAR, sameSite: "lax" });
}
