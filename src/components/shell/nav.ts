import {
  BookMarked,
  CalendarDays,
  Calculator,
  GraduationCap,
  Home,
  Layers,
  Library,
  MoreHorizontal,
  PenTool,
  Settings,
  Timer,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Key under "nav" in messages. */
  key: string;
  icon: LucideIcon;
  /** Build phase that delivers the tool (section 16). Undefined = available now. */
  phase?: number;
}

/** Sidebar order from section 4. */
export const NAV: NavItem[] = [
  { href: "/home", key: "home", icon: Home },
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/hub", key: "hub", icon: Library },
  { href: "/whiteboard", key: "whiteboard", icon: PenTool },
  { href: "/solver", key: "solver", icon: Calculator, phase: 3 },
  { href: "/vault", key: "vault", icon: BookMarked, phase: 6 },
  { href: "/lessons", key: "lessons", icon: Video, phase: 5 },
  { href: "/flashcards", key: "flashcards", icon: Layers, phase: 3 },
  { href: "/focus", key: "focus", icon: Timer },
  { href: "/core", key: "core", icon: GraduationCap, phase: 7 },
  { href: "/squads", key: "squads", icon: Users, phase: 7 },
  { href: "/settings", key: "settings", icon: Settings },
];

/** Phone bottom tab bar: 5 tabs (section 4). */
export const TABS: NavItem[] = [
  NAV[0],
  NAV[1],
  NAV[2],
  NAV[3],
  { href: "/more", key: "more", icon: MoreHorizontal },
];

/** Tools that are placeholders in this phase, keyed by route segment. */
export const TOOL_PAGES = Object.fromEntries(
  NAV.filter((n) => n.phase).map((n) => [n.href.slice(1), n]),
) as Record<string, NavItem>;

