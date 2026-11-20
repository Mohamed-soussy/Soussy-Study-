"use client";

/** Accessibility settings (section 12.5), stored on this device and applied to <html>. */
export interface A11y {
  font?: "readable";
  motion?: "reduce";
  size?: number; // percent: 90–140
}

const KEY = "soussy.a11y";

export function getA11y(): A11y {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as A11y;
  } catch {
    return {};
  }
}

export function setA11y(a: A11y) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
  const h = document.documentElement;
  if (a.font) h.dataset.font = a.font;
  else delete h.dataset.font;
  if (a.motion) h.dataset.motion = a.motion;
  else delete h.dataset.motion;
  h.style.fontSize = a.size && a.size !== 100 ? `${a.size}%` : "";
}

/** Reads the selected text, or the page's main content, aloud (read-aloud everywhere). */
export function readAloud(): boolean {
  if (!("speechSynthesis" in window)) return false;
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    return false;
  }
  const selected = window.getSelection()?.toString().trim();
  const main = document.querySelector("main");
  const text = (selected || main?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 6000);
  if (!text) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = document.documentElement.lang === "ar" ? "ar-SA" : "en-US";
  u.rate = 1;
  speechSynthesis.speak(u);
  return true;
}
