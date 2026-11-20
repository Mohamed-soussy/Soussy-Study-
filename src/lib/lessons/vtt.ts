import type { Segment } from "./types";

/** Teams transcripts (.vtt): used in the browser (uploads) and on the server (Teams Level 3). */

type Line = Segment & { speaker?: string };

export function seconds(t: string): number {
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

