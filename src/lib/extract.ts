import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { getAnthropic, MODELS } from "@/lib/ai/server";

/**
 * Turns an uploaded file into page texts (section 6.1), so search and the
 * chatbot can cite "file, page N". Free extraction first; the AI only reads
 * images and scanned PDFs, and only when the key is set.
 */

export interface Extracted {
  kind: "pdf" | "docx" | "pptx" | "text" | "image" | "audio" | "video" | "other";
  pages: string[];
  /** Why there is no text, if there isn't. */
  note?: "needs_ai" | "transcription_later" | "unsupported" | "empty";
}

const PAGE_CHARS = 2500;

/** Splits long text into "pages" at paragraph breaks. */
function paginate(text: string): string[] {
  const paras = text.split(/\n\s*\n/);
  const pages: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > PAGE_CHARS) {
      pages.push(cur.trim());
      cur = "";
    }
    cur += p + "\n\n";
  }
  if (cur.trim()) pages.push(cur.trim());
  return pages;
}

function kindOf(name: string, mime: string): Extracted["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || mime.includes("wordprocessingml")) return "docx";
  if (ext === "pptx" || mime.includes("presentationml")) return "pptx";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return "image";
  if (mime.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg"].includes(ext)) return "audio";
  if (mime.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  if (mime.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) return "text";
  return "other";
}

/** Reads text from images or scanned PDFs with Claude (handles handwriting and Arabic). */
async function aiRead(buf: Buffer, mime: string, isPdf: boolean): Promise<string[] | null> {
  const ai = getAnthropic();
  if (!ai) return null;
  const data = buf.toString("base64");
  const media = (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg") as
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif";
  const res = await ai.messages.create({
    model: MODELS.small,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          isPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
            : { type: "image", source: { type: "base64", media_type: media, data } },
          {
            type: "text",
            text: `Transcribe all text in this ${isPdf ? "document" : "image"} exactly, including handwriting and Arabic. Keep math as LaTeX. ${
              isPdf ? "Start each page with a line '=== Page N ===' using the page number." : ""
            } Output only the transcription.`,
          },
        ],
      },
    ],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  if (!isPdf) return [text.trim()];
  const parts = text.split(/^=== Page \d+ ===\s*$/m).map((s) => s.trim());
  return parts[0] === "" ? parts.slice(1) : parts;
}

export async function extractFile(buf: Buffer, name: string, mime: string): Promise<Extracted> {
  const kind = kindOf(name, mime);
  switch (kind) {
    case "pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = (text as string[]).map((t) => t.replace(/[ \t]+/g, " ").trim());
      const chars = pages.join("").length;
      if (chars < 20 * Math.max(1, pages.length)) {
        // Probably scanned: let the AI read it if we can.
        const ocr = await aiRead(buf, mime, true);
        if (ocr) return { kind, pages: ocr };
        return { kind, pages, note: "needs_ai" };
      }
      return { kind, pages };
    }
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      const pages = paginate(value);
      return { kind, pages, note: pages.length ? undefined : "empty" };
    }
    case "pptx": {
      const zip = await JSZip.loadAsync(buf);
      const slides = Object.keys(zip.files)
        .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
      const pages: string[] = [];
      for (const s of slides) {
        const xml = await zip.files[s].async("string");
        const runs = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]);
        pages.push(
          runs
            .join(" ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'"),
        );
      }
      return { kind, pages };
    }
    case "text":
      return { kind, pages: paginate(buf.toString("utf8")) };
    case "image": {
      const ocr = await aiRead(buf, mime, false);
      return ocr ? { kind, pages: ocr } : { kind, pages: [], note: "needs_ai" };
    }
    case "audio":
    case "video":
      return { kind, pages: [], note: "transcription_later" };
    default:
      return { kind, pages: [], note: "unsupported" };
  }
}
