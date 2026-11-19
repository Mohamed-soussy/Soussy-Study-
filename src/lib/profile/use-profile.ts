"use client";

import { useEffect, useState } from "react";
import { loadProfile } from "./store";
import type { Profile } from "./types";

/**
 * Loads the signed-in student's profile once.
 * status "signed-out" means nobody is signed in (or no demo session).
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "error">("loading");

  useEffect(() => {
    let alive = true;
    loadProfile()
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setStatus(p ? "ready" : "signed-out");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  return { profile, setProfile, status };
}
