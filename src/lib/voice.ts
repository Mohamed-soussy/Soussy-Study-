"use client";

/**
 * Picks the most natural free voice the device has (section 7: speech is the
 * browser's own, free). Neural voices ("Natural", "Online", "Google", "Siri",
 * "Premium", "Enhanced") sound far softer than the old robotic defaults.
 * The student can choose another in the whiteboard; the choice is remembered.
 */
const KEY = (lang: string) => `soussy.voice.${lang}`;
const GOOD = [/natural/i, /online/i, /neural/i, /premium/i, /enhanced/i, /siri/i, /google/i, /samantha|ava|allison|serena|daniel|karen|moira|tessa/i, /maged|tarik|laila|hamed|zariyah|salma/i];
const BAD = [/compact|espeak|robot|novelty|bad news|bells|bubbles|cellos|jester|organ|trinoids|whisper|zarvox|albert|fred|junior|ralph|bahh|boing|deranged|hysterical|kathy|superstar/i];

export function voicesFor(lang: "en" | "ar"): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang) && !BAD.some((r) => r.test(v.name)));
}

function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  GOOD.forEach((r, i) => {
    if (r.test(v.name)) s += 20 - i;
  });
  if (/en-(us|gb)/i.test(v.lang)) s += 2;
  if (!v.localService) s += 3; // cloud voices on Edge/Chrome are the neural ones
  return s;
}

export function bestVoice(lang: "en" | "ar"): SpeechSynthesisVoice | undefined {
  const list = voicesFor(lang);
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY(lang));
  } catch {
    /* ignore */
  }
  return list.find((v) => v.name === saved) ?? [...list].sort((a, b) => score(b) - score(a))[0];
}

export function saveVoice(lang: "en" | "ar", name: string) {
  try {
    localStorage.setItem(KEY(lang), name);
  } catch {
    /* ignore */
  }
}

/** A calm, natural utterance: best voice, slightly slower than default. */
export function utterance(text: string, lang: "en" | "ar", voice = { pitch: 1, rate: 1 }): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "ar" ? "ar-SA" : "en-US";
  const v = bestVoice(lang);
  if (v) u.voice = v;
  u.rate = 0.95 * voice.rate;
  u.pitch = voice.pitch;
  return u;
}
