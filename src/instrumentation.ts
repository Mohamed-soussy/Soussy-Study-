import { applyEnvAliases } from "@/lib/env-aliases";

/** Runs once when the server starts: map hand-typed key names onto the exact ones. */
export function register() {
  applyEnvAliases();
}
