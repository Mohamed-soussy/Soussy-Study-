"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Remembers the school for onboarding, then goes to sign-in. */
export function SchoolStart({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button
      size="lg"
      className="self-start"
      onClick={() => {
        try {
          localStorage.setItem("soussy.schoolPreset", JSON.stringify({ school: "Khalid International Schools (KiS), Riyadh", city: "Riyadh", country: "Saudi Arabia" }));
        } catch {
          /* ignore */
        }
        router.push("/sign-in");
      }}
    >
      {label}
    </Button>
  );
}
