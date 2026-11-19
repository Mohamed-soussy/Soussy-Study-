"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/lib/profile/types";

/** The signed-in student's profile, shared with every page inside the app shell. */
export const ProfileContext = createContext<Profile | null>(null);

export function useCurrentProfile(): Profile {
  const p = useContext(ProfileContext);
  if (!p) throw new Error("useCurrentProfile must be used inside the app shell");
  return p;
}
