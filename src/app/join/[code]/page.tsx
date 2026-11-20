"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Invite links (section 12.5): remember the code, then sign in. It's redeemed after sign-in. */
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  useEffect(() => {
    try {
      if (/^[A-Z0-9]{6,8}$/i.test(code)) localStorage.setItem("soussy.invite", code.toUpperCase());
    } catch {
      /* ignore */
    }
    router.replace("/sign-in");
  }, [code, router]);
  return null;
}
