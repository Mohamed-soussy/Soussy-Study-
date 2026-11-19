"use client";

import type { Segment } from "./types";

/**
 * Teams already makes transcripts (.vtt, or .docx when downloaded from the meeting).
 * When the student has one, we use it directly instead of listening again (section 11.2).
 */

type Line = Segment & { speaker?: string };

function seconds(t: string): number {
  // 00:01:02.345, 01:02.345, or Teams' 0:0:3.12
  const parts = t.trim().replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** WebVTT, including Teams' "<v Speaker Name>text</v>" lines. */
export function parseVtt(text: string): Line[] {
  const out: Line[] = [];
  const blocks = text.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    let body = lines.slice(i + 1).join(" ").trim();
    let speaker: string | undefined;
    const v = body.match(/^<v\s+([^>]+)>/);
    if (v) speaker = v[1].trim();
    body = body.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!body) continue;
    const s = seconds(a);
    const e = seconds(b.trim().split(/\s/)[0]);
    // Teams splits sentences into many short cues: join cues by the same speaker.
    const prev = out[out.length - 1];
    if (prev && prev.speaker === speaker && s - prev.e < 1.5 && prev.text.length < 300) {
      prev.text += ` ${body}`;
      prev.e = e;
    } else out.push({ s, e, text: body, speaker });
  }
  return out;
}

/** Paragraph text of a .docx (Word) file, read in the browser. */
async function docxParagraphs(file: Blob): Promise<string[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return [];
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) =>
      [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:(br|tab)\/>/g)]
        .map((m) => (m[1] !== undefined ? m[1] : " "))
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Teams .docx transcripts come in two layouts:
 *   new: "Speaker Name   3:41" then the words on the next paragraph(s)
 *   old: "0:0:3.120 --> 0:0:7.500", "Speaker Name", then the words
 */
export async function parseDocxTranscript(file: Blob): Promise<Line[]> {
  const paras = await docxParagraphs(file);
  const out: Line[] = [];
  let cur: Line | null = null;
  const push = () => {
    if (cur && cur.text.trim()) out.push(cur);
    cur = null;
  };
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const arrow = p.match(/^(\d+:\d+:\d+(?:\.\d+)?)\s*-->\s*(\d+:\d+:\d+(?:\.\d+)?)/);
    if (arrow) {
      push();
      const next = paras[i + 1] ?? "";
      const looksLikeName = next.length < 60 && !/[.?!]$/.test(next) && paras[i + 2] !== undefined && !/-->/.test(paras[i + 2]);
      cur = { s: seconds(arrow[1]), e: seconds(arrow[2]), text: "", speaker: looksLikeName ? next : undefined };
      if (looksLikeName) i++;
      continue;
    }
    const head = p.match(/^(.{1,60}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (head) {
      push();
      const s = seconds(head[2]);
      cur = { s, e: s, text: "", speaker: head[1].trim() };
      continue;
    }
    if (cur) cur.text = `${cur.text} ${p}`.trim();
  }
  push();
  // New-style files have no end times: each line ends where the next begins.
  out.forEach((l, i) => {
    if (l.e <= l.s) l.e = out[i + 1]?.s ?? l.s + Math.max(3, l.text.split(/\s+/).length / 2.5);
  });
  return out;
}
