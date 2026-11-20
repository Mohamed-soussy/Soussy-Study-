import {
  BookMarked,
  Columns2,
  NotebookPen,
  CalendarDays,
  FileCheck2,
  Calculator,
  GraduationCap,
  Home,
  Layers,
  Library,
  MoreHorizontal,
  PenTool,
  Settings,
  ShieldCheck,
  School,
  Timer,
  Trophy,
  Users,
  Video,
  Webcam,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Key under "nav" in messages. */
  key: string;
  icon: LucideIcon;
  /** Build phase that delivers the tool (section 16). Undefined = available now. */
  phase?: number;
  /** Only shown to these roles (staff tools). */
  roles?: ("teacher" | "moderator")[];
}

/** Hides staff-only tools from students. */
export const visibleNav = (role: string | undefined) => NAV.filter((n) => !n.roles || n.roles.includes(role as "teacher"));

/** Sidebar order from section 4. */
export const NAV: NavItem[] = [
  { href: "/home", key: "home", icon: Home },
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/hub", key: "hub", icon: Library },
  { href: "/whiteboard", key: "whiteboard", icon: PenTool },
  { href: "/solver", key: "solver", icon: Calculator },
  { href: "/vault", key: "vault", icon: BookMarked },
  { href: "/lessons", key: "lessons", icon: Video },
  { href: "/flashcards", key: "flashcards", icon: Layers },
  { href: "/exam", key: "exam", icon: FileCheck2 },
  { href: "/focus", key: "focus", icon: Timer },
  { href: "/rooms", key: "rooms", icon: Webcam },
  { href: "/progress", key: "progress", icon: Trophy },
  { href: "/core", key: "core", icon: GraduationCap },
  { href: "/squads", key: "squads", icon: Users },
  { href: "/workspace", key: "workspace", icon: Columns2 },
  { href: "/notes", key: "notes", icon: NotebookPen },
  { href: "/teach", key: "teach", icon: School },
  { href: "/moderate", key: "moderate", icon: ShieldCheck, roles: ["moderator"] },
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

