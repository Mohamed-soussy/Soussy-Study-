import type { Metadata } from "next";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  const parsed = step ? Number.parseInt(step, 10) : undefined;
  return <OnboardingFlow startStep={Number.isFinite(parsed) ? parsed : undefined} />;
}
