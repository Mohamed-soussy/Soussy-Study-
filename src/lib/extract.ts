import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { engineConfigured, groqText, ROUTES } from "@/lib/ai/engines";

/**
 * Turns an uploaded file into page texts (section 6.1), so search and the
 * chatbot can cite "file, page N". Free extraction first; the AI only reads
 * photos, and only when the Groq key is set.
 */

export interface Extracted {
  kind: "pdf" | "docx" | "pptx" | "text" | "image" | "audio" | "video" | "other";
  pages: string[];
  /** Why there is no text, if there isn't. */
  note?: "needs_ai" | "scanned_pdf" | "transcription_later" | "unsupported" | "empty";
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

/**
 * Reads text from a student's photo (handwriting, Arabic, worksheets) with Groq's
 * vision model. Personal content, so it never goes to the Gemini free tier.
 */
async function aiReadImage(buf: Buffer, mime: string): Promise<string[] | null> {
  if (!engineConfigured("groq")) return null;
  const media = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg";
  const text = await groqText(
    ROUTES.readImage,
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe all text in this image exactly, including handwriting and Arabic. Keep math as LaTeX. Output only the transcription.",
          },
          { type: "image_url", image_url: { url: `data:${media};base64,${buf.toString("base64")}` } },
        ],
      },
    ],
    4000,
  );
  return [text];
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
        // Scanned pages have no text layer. Sending the whole PDF to a free cloud model
        // would break the privacy rule, so we ask for photos of the pages instead.
        return { kind, pages, note: "scanned_pdf" };
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
      const ocr = await aiReadImage(buf, mime).catch(() => null);
      return ocr ? { kind, pages: ocr } : { kind, pages: [], note: "needs_ai" };
    }
    case "audio":
    case "video":
      return { kind, pages: [], note: "transcription_later" };
    default:
      return { kind, pages: [], note: "unsupported" };
  }
}
