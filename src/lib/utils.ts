import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins Tailwind classes and removes conflicts (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** CSS color for subject slot 1–8. */
export function subjectColor(index: number) {
  return `var(--subject-${((index % 8) + 8) % 8 + 1})`;
}
