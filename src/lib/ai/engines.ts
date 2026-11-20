import "server-only";

/**
 * Soussy Study's three AI engines, called over plain HTTPS with time limits.
 *
 *  - Gemini (Google):     complex reasoning, long context, vision, structured JSON
 *                          (whiteboard timelines). FREE TIER: Google may use what we
 *                          send to improve its products, so it only receives PUBLIC
 *                          academic content, or images a student explicitly opted in to send.
 *  - Groq:                 fast replies (chat, tagging, check-ins) and reading images.
 *                          Everything personal goes here.
 *  - Hugging Face:         open-source models (embeddings, etc.) to avoid depending
 *                          on a single company.
 *
 * Which job goes to which engine is decided in ROUTES below and nowhere else.
 */

export type Engine = "gemini" | "groq" | "huggingface";

/** The privacy class of what a job sends. */
export type DataClass = "public" | "personal" | "opt-in-image";

export const ROUTES = {
  /** Study Hub tutor chat: personal (the student's words and files). */
  chat: { engine: "groq", data: "personal", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
  /** Step-by-step solver: the student's homework (personal). The strongest Groq model first. */
  solve: { engine: "groq", data: "personal", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
  /** Flashcards made from the student's files or chats: personal. */
  cards: { engine: "groq", data: "personal", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  /** Auto-tagging uploaded files: personal. */
  tagFile: { engine: "groq", data: "personal", models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] },
  /** Reading text from a student's photo or handwriting: personal image. */
  readImage: { engine: "groq", data: "personal", models: ["qwen/qwen3.8-27b"] },
  /** Answering a question about a whiteboard drawing: personal (the student's question). */
  whiteboardAsk: { engine: "groq", data: "personal", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  /** Whiteboard lesson on a syllabus topic: public, generated once and cached for everyone. */
  /** Lesson recordings → text with timestamps (section 11.2). Private, so Groq (Whisper). */
  transcribe: { engine: "groq", data: "personal", models: ["whisper-large-v3-turbo", "whisper-large-v3"] },
  /** Finding homework, tests and key ideas in a lesson transcript, and lesson chat/quiz. */
  lesson: { engine: "groq", data: "personal", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  /** Reading assignment text a student pasted from school (section 10.1, Level 1). */
  schoolParse: { engine: "groq", data: "personal", models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] },
  /** Resource finder: summaries of PUBLIC web pages and original practice questions (section 9.1). */
  resources: { engine: "gemini", data: "public", models: ["gemini-3.1-flash-lite", "gemini-3-flash-preview"] },
  /** Community vault: checking and merging notes students wrote (personal until approved). */
  community: { engine: "groq", data: "personal", models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] },
  /** Phase 7: mock exams, rubric feedback, teach-back, core workspace helpers (the student's work). */
  coach: { engine: "groq", data: "personal", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
  whiteboardLesson: {
    engine: "gemini",
    data: "public",
    // Fastest first: Flash-Lite starts speaking in ~1.5 s; the bigger models think for 30+ s.
    models: ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash"],
  },
  /** Focus snapshot check: only when the student switched on cloud checks (opt-in). */
  focusSnapshot: { engine: "gemini", data: "opt-in-image", models: ["gemini-3.1-flash-lite"] },
  /** Embeddings for "search by meaning" (open-source, multilingual, 1024 dimensions). */
  embed: { engine: "huggingface", data: "personal", models: ["BAAI/bge-m3"] },
} as const satisfies Record<string, { engine: Engine; data: DataClass; models: readonly string[] }>;

/** Safety net for the privacy rule: personal data never goes to the Gemini free tier. */
function assertPrivacy(engine: Engine, data: DataClass) {
  if (engine === "gemini" && data === "personal") {
    throw new Error("Privacy rule: personal data may not be sent to the Gemini free tier.");
  }
}

export class EngineError extends Error {
  constructor(
    public engine: Engine,
    public code: "not_configured" | "rate_limited" | "busy" | "no_credits" | "bad_request" | "timeout" | "failed",
    message: string,
    /** Seconds the provider asked us to wait (rate limits). */
    public retryAfter = 0,
  ) {
    super(message);
  }
}

export function engineConfigured(engine: Engine): boolean {
  if (engine === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (engine === "groq") return Boolean(process.env.GROQ_API_KEY);
  return Boolean(process.env.HUGGINGFACE_ACCESS_TOKEN);
}

function classify(engine: Engine, status: number, body: string, retryAfter = 0): EngineError {
  if (status === 429) return new EngineError(engine, "rate_limited", "Too many requests right now.", retryAfter);
  // Groq occasionally rejects its own output against a strict schema: worth another try.
  if (/does not match the expected schema|failed_generation|json_validate_failed/i.test(body)) return new EngineError(engine, "busy", "The model's answer was malformed.");
  if (status === 503 || status === 500 || status === 502) return new EngineError(engine, "busy", "The model is busy.");
  if (status === 402 || /credits|purchase/i.test(body)) return new EngineError(engine, "no_credits", "No credits left on this account.");
  if (status === 400 || status === 404) return new EngineError(engine, "bad_request", body.slice(0, 300));
  return new EngineError(engine, "failed", `HTTP ${status}`);
}

async function post(engine: Engine, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<Response> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw classify(engine, res.status, await res.text().catch(() => ""), Number(res.headers.get("retry-after")) || 0);
    return res;
  } catch (err) {
    if (err instanceof EngineError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new EngineError(engine, "timeout", "The model took too long.");
    }
    throw new EngineError(engine, "failed", "Couldn't reach the model.");
  }
}

/**
 * Tries each model in order; moves on when one is busy, rate limited or slow.
 * If every model is rate limited, waits once (up to 30 s, as the provider asks) and tries again.
 */
async function withFallback<T>(models: readonly string[], run: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let round = 0; round < 2; round++) {
    let wait = 0;
    for (const m of models) {
      try {
        return await run(m);
      } catch (err) {
        last = err;
        if (!(err instanceof EngineError) || !["busy", "rate_limited", "timeout"].includes(err.code)) throw err;
        if (err.code === "rate_limited") wait = Math.max(wait, err.retryAfter || 3);
      }
    }
    if (!wait || wait > 30) break;
    await new Promise((r) => setTimeout(r, wait * 1000 + 250));
  }
  throw last;
}

/* ---------------- Gemini ---------------- */

/** Gemini's JSON-schema subset (OpenAPI style: OBJECT, ARRAY, STRING, NUMBER, INTEGER, BOOLEAN). */
export type GeminiSchema = Record<string, unknown>;

export async function geminiJSON<T>(
  route: { engine: "gemini"; data: DataClass; models: readonly string[] },
  args: {
    system?: string;
    prompt: string;
    schema: GeminiSchema;
    images?: { mime: string; base64: string }[];
    maxOutputTokens?: number;
    /** Lowest thinking for tiny checks (saves tokens). */
    minimalThinking?: boolean;
    timeoutMs?: number;
  },
): Promise<T> {
  assertPrivacy("gemini", route.data);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new EngineError("gemini", "not_configured", "GEMINI_API_KEY is not set.");
  return withFallback(route.models, async (model) => {
    const thinking = args.minimalThinking
      ? model.startsWith("gemini-2.5")
        ? { thinkingBudget: 0 }
        : { thinkingLevel: "minimal" }
      : undefined;
    const res = await post(
      "gemini",
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": key },
      {
        ...(args.system ? { systemInstruction: { parts: [{ text: args.system }] } } : {}),
        contents: [
          {
            role: "user",
            parts: [
              ...(args.images ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.base64 } })),
              { text: args.prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: args.schema,
          maxOutputTokens: args.maxOutputTokens ?? 8192,
          ...(args.images?.length ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      },
      args.timeoutMs ?? 60000,
    );
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new EngineError("gemini", "failed", `Gemini returned unreadable JSON (${data.candidates?.[0]?.finishReason ?? "?"}).`);
    }
  });
}

/* ---------------- Groq (OpenAI-compatible) ---------------- */

type GroqContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: GroqContent;
}

function groqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new EngineError("groq", "not_configured", "GROQ_API_KEY is not set.");
  return key;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Groq's free tier reserves max_completion_tokens against an 8,000-tokens-per-minute
 * budget per model, so every call asks only for what it needs, keeps reasoning short
 * and doesn't send the reasoning text back.
 */
function groqExtras(model: string, effort: "low" | "medium" = "low") {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: effort, include_reasoning: false };
  if (model.startsWith("qwen/")) return { reasoning_format: "hidden" };
  return {};
}

/** Structured JSON from Groq (strict JSON schema). */
export async function groqJSON<T>(
  route: { engine: "groq"; models: readonly string[] },
  args: { messages: GroqMessage[]; schema: Record<string, unknown>; name: string; maxTokens?: number; effort?: "low" | "medium" },
): Promise<T> {
  const key = groqKey();
  return withFallback(route.models, async (model) => {
    const res = await post(
      "groq",
      GROQ_URL,
      { Authorization: `Bearer ${key}` },
      {
        model,
        messages: args.messages,
        max_completion_tokens: args.maxTokens ?? 2000,
        ...groqExtras(model, args.effort),
        response_format: { type: "json_schema", json_schema: { name: args.name, strict: true, schema: args.schema } },
      },
      45000,
    );
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    try {
      return JSON.parse(data.choices[0].message.content) as T;
    } catch {
      throw new EngineError("groq", "failed", "Groq returned unreadable JSON.");
    }
  });
}

/** Plain text from Groq (used for reading images). */
export async function groqText(route: { engine: "groq"; models: readonly string[] }, messages: GroqMessage[], maxTokens = 1500): Promise<string> {
  const key = groqKey();
  return withFallback(route.models, async (model) => {
    const res = await post("groq", GROQ_URL, { Authorization: `Bearer ${key}` }, { model, messages, max_completion_tokens: maxTokens, ...groqExtras(model) }, 60000);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return (data.choices[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  });
}

/** Streams text deltas from Groq (server-sent events). */
export async function* groqStream(route: { engine: "groq"; models: readonly string[] }, messages: GroqMessage[], maxTokens = 1500): AsyncGenerator<string> {
  const key = groqKey();
  const res = await withFallback(route.models, (model) =>
    post("groq", GROQ_URL, { Authorization: `Bearer ${key}` }, { model, messages, stream: true, max_completion_tokens: maxTokens, ...groqExtras(model) }, 60000),
  );
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const delta = (JSON.parse(payload) as { choices: { delta: { content?: string } }[] }).choices[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* keep-alive or partial line */
      }
    }
  }
}

/** One piece of speech with its time in the recording (seconds). */
export interface Segment {
  s: number;
  e: number;
  text: string;
}

/**
 * Speech to text with Groq Whisper (verbose JSON gives a start and end time per segment).
 * `prompt` is a short hint of names and subject words; it improves spelling, nothing else.
 */
export async function groqTranscribe(audio: Blob, opts: { prompt?: string; language?: string } = {}): Promise<{ segments: Segment[]; language: string }> {
  const key = groqKey();
  return withFallback(ROUTES.transcribe.models, async (model) => {
    const form = new FormData();
    form.append("file", audio, "chunk.wav");
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("temperature", "0");
    if (opts.prompt) form.append("prompt", opts.prompt.slice(0, 600));
    if (opts.language) form.append("language", opts.language);
    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(55000),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) throw new EngineError("groq", "timeout", "Transcribing took too long.");
      throw new EngineError("groq", "failed", "Couldn't reach the speech model.");
    }
    if (!res.ok) throw classify("groq", res.status, await res.text().catch(() => ""), Number(res.headers.get("retry-after")) || 0);
    const data = (await res.json()) as {
      language?: string;
      segments?: { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number }[];
    };
    const segments = (data.segments ?? [])
      // Whisper "hears" words in silence and loops on noise; drop those segments.
      .filter((g) => (g.no_speech_prob ?? 0) < 0.7 && (g.compression_ratio ?? 1) < 2.6 && (g.avg_logprob ?? 0) > -1.2)
      .map((g) => ({ s: Math.round(g.start * 10) / 10, e: Math.round(g.end * 10) / 10, text: g.text.trim() }))
      .filter((g) => g.text && !/^(thank you\.?|thanks for watching!?|you|\.+)$/i.test(g.text));
    return { segments, language: data.language ?? "" };
  });
}

/* ---------------- Hugging Face ---------------- */

/** Sentence embeddings from an open-source model (BAAI/bge-m3, 1024 numbers per text). */
export async function hfEmbed(texts: string[]): Promise<number[][]> {
  const token = process.env.HUGGINGFACE_ACCESS_TOKEN;
  if (!token) throw new EngineError("huggingface", "not_configured", "HUGGINGFACE_ACCESS_TOKEN is not set.");
  const model = ROUTES.embed.models[0];
  const res = await post(
    "huggingface",
    `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`,
    { Authorization: `Bearer ${token}` },
    { inputs: texts },
    30000,
  );
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new EngineError("huggingface", "failed", "Unexpected embedding response.");
  return data as number[][];
}

/** Text generation through Hugging Face's router (OpenAI-compatible), for open-source chat models. */
export async function hfChat(model: string, messages: GroqMessage[], maxTokens = 1000): Promise<string> {
  const token = process.env.HUGGINGFACE_ACCESS_TOKEN;
  if (!token) throw new EngineError("huggingface", "not_configured", "HUGGINGFACE_ACCESS_TOKEN is not set.");
  const res = await post(
    "huggingface",
    "https://router.huggingface.co/v1/chat/completions",
    { Authorization: `Bearer ${token}` },
    { model, messages, max_tokens: maxTokens },
    45000,
  );
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

/** Friendly message for the student; never includes keys or internals. */
export function engineErrorMessage(err: unknown): string {
  if (err instanceof EngineError) {
    switch (err.code) {
      case "not_configured":
        return "The AI isn't connected yet.";
      case "rate_limited":
        return "The AI is busy right now. Try again in a minute.";
      case "busy":
      case "timeout":
        return "The AI is very busy right now. Try again shortly.";
      case "no_credits":
        return "This AI service has run out of free credits.";
      default:
        return "The AI had a problem. Try again.";
    }
  }
  return "Something went wrong. Try again.";
}
