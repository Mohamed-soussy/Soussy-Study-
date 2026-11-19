import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { TOOL_PAGES } from "@/components/shell/nav";

/** Copy for the tools with their own line; others use the generic one. */
const COPY: Record<string, { text: string; empty: string }> = {
  calendar: { text: "calendarText", empty: "calendarEmpty" },
  hub: { text: "hubText", empty: "hubEmpty" },
  whiteboard: { text: "whiteboardText", empty: "whiteboardEmpty" },
};


/**
 * Tools that arrive in later phases. Each follows the page template and says
 * plainly which phase delivers it, instead of faking the feature (section 0).
 */
export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const item = TOOL_PAGES[tool];
  if (!item) notFound();

  const nav = await getTranslations("nav");
  const p = await getTranslations("pages");
  const c = await getTranslations("common");
  const copy = COPY[tool] ?? { text: "soonText", empty: "soonEmpty" };
  const Icon = item.icon;

  return (
    <>
      <PageHeader title={nav(item.key)} text={p(copy.text)} />
      <EmptyState
        icon={<Icon className="size-8" />}
        title={p(copy.empty)}
        badge={c("comingInPhase", { phase: item.phase! })}
        className="py-16"
      />
    </>
  );
}
