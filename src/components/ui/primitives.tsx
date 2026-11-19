import * as React from "react";
import { cn } from "@/lib/utils";

/** Soft rounded card (12 px radius, thin border, shadow only on hover when interactive). */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-text", className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-base text-text placeholder:text-muted",
        "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-base text-text",
        "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
        className,
      )}
      {...props}
    />
  );
}

/** Label + control + optional hint/error, stacked. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ms-1 font-normal text-muted">({optional})</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Small pill. `color` is any CSS color, used for the dot. */
export function Chip({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-text",
        className,
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Page template (section 2A): title, one line saying what the page is for,
 * one primary action top-right, then the content.
 */
export function PageHeader({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-text sm:text-[28px]">{title}</h1>
        <p className="mt-1 text-muted">{text}</p>
      </div>
      {action}
    </header>
  );
}

/** Designed empty state: says what will appear and how to get there. */
export function EmptyState({
  icon,
  title,
  text,
  badge,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  badge?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="mb-1 text-primary">{icon}</div>}
      <p className="font-medium text-text">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {badge && <span className="mt-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">{badge}</span>}
    </div>
  );
}
