import { Logo } from "./logo";

const WORD = "Soussy Study";

/** Loading screen: the logo, then "Soussy Study" spelled out letter by letter (loops while loading). */
export function BrandLoader({ note }: { note?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4" role="status" aria-label="Soussy Study is loading">
      <Logo size={64} className="soussy-logo-pop" />
      <p className="flex text-3xl font-extrabold tracking-tight text-text sm:text-4xl" aria-hidden dir="ltr">
        {WORD.split("").map((ch, i) => (
          <span key={i} className="soussy-letter" style={{ animationDelay: `${i * 90}ms` }}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </p>
      <span className="h-1 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className="soussy-bar block h-full w-1/3 rounded-full bg-primary" />
      </span>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}
