import { cn } from "@/lib/utils";

/**
 * Soussy Study logo (section 2): a rounded square holding an "S" drawn as one
 * continuous pen stroke that ends in a small spark — a whiteboard marker line
 * and a lightbulb moment at once.
 *
 * Exported path data is reused by scripts/make-icons.mjs for the favicon and app icons.
 */
export const LOGO_S_PATH = "M21 45 C24 51.5 43 51.5 43 41 C43 31 21 33 21 23 C21 14 36 12 40.5 18.5";
export const LOGO_SPARK_PATH =
  "M46 7.5 L47.6 11.9 L52 13.5 L47.6 15.1 L46 19.5 L44.4 15.1 L40 13.5 L44.4 11.9 Z";

interface LogoProps {
  size?: number;
  /** "tile": indigo tile with white mark (default). "mark": just the mark in the brand color. "inverse": white tile, indigo mark. */
  variant?: "tile" | "mark" | "inverse";
  className?: string;
  title?: string;
}

export function Logo({ size = 32, variant = "tile", className, title = "Soussy Study" }: LogoProps) {
  const markColor = variant === "tile" ? "#ffffff" : "var(--primary)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      {variant !== "mark" && (
        <rect width="64" height="64" rx="16" fill={variant === "tile" ? "#4F46E5" : "#ffffff"} />
      )}
      <path d={LOGO_S_PATH} fill="none" stroke={markColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={LOGO_SPARK_PATH} fill={variant === "tile" ? "#FBBF24" : markColor} />
    </svg>
  );
}

/** "soussy" bold + "study" regular, on one line. Always left-to-right, since it is a brand name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span dir="ltr" className={cn("font-display text-lg tracking-tight text-text", className)}>
      <span className="font-extrabold">soussy</span>
      <span className="font-normal"> study</span>
    </span>
  );
}

export function Brand({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo size={size} />
      <Wordmark />
    </span>
  );
}
