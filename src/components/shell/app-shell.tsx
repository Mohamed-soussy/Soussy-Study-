"use client";

import { LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo, Wordmark } from "@/components/brand/logo";
import { ageOn } from "@/lib/profile/types";
import { signOut } from "@/lib/profile/store";
import { useProfile } from "@/lib/profile/use-profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { NAV, TABS } from "./nav";
import { ProfileContext } from "./profile-context";

const COLLAPSE_KEY = "soussy.sidebar.collapsed";

/**
 * App shell (sections 2A and 4): sidebar on desktop, top bar (search, timer
 * bubble, profile) and one workspace. Phones get a 5-tab bottom bar.
 * Signed-out students go to /sign-in; unfinished setups go to /onboarding.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const c = useTranslations("common");
  const { profile, status } = useProfile();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const blocked = profile?.dateOfBirth ? ageOn(profile.dateOfBirth) < 13 : false;

  useEffect(() => {
    if (status === "signed-out") router.replace("/sign-in");
    if (status === "ready" && profile && (!profile.onboardedAt || blocked)) {
      router.replace(`/onboarding${blocked ? "?step=8" : ""}`);
    }
  }, [status, profile, blocked, router]);

  if (status !== "ready" || !profile?.onboardedAt || blocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-muted">
        <Logo size={28} className="animate-pulse" />
        {status === "error" ? c("saveFailed") : c("loading")}
      </div>
    );
  }

  function toggle() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }

  return (
    <ProfileContext.Provider value={profile}>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar name={profile.fullName ?? ""} />
          <main className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))] pt-6 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))] md:pb-10 md:ps-8 md:pe-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-8">{children}</div>
          </main>
        </div>
        <BottomTabs />
      </div>
    </ProfileContext.Provider>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-border bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <Link href="/home" className="inline-flex items-center gap-2">
          <Logo size={30} />
          {!collapsed && <Wordmark />}
        </Link>
      </div>
      <nav aria-label={t("menu")} className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? t(item.key) : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
                    active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{t(item.key)}</span>}
                  {!collapsed && item.phase && (
                    <span className="ms-auto rounded-full bg-surface-2 px-1.5 text-[10px] font-semibold text-muted">P{item.phase}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-sm text-muted hover:bg-surface-2 hover:text-text",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px] rtl:rotate-180" aria-hidden />
          ) : (
            <PanelLeftClose className="size-[18px] rtl:rotate-180" aria-hidden />
          )}
          <span className={cn(collapsed && "sr-only")}>{collapsed ? t("expand") : t("collapse")}</span>
        </button>
      </div>
    </aside>
  );
}

function TopBar({ name }: { name: string }) {
  const t = useTranslations("nav");
  const c = useTranslations("common");
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd + K opens search (section 4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))] md:ps-8 md:pe-8">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3">
        <Link href="/home" className="md:hidden" aria-label="Soussy Study">
          <Logo size={30} />
        </Link>

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-10 w-full max-w-md items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm text-muted hover:border-primary/40"
            aria-expanded={searchOpen}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("search")}</span>
            <kbd dir="ltr" className="ms-auto hidden rounded border border-border px-1.5 font-mono text-[11px] sm:inline">
              Ctrl K
            </kbd>
          </button>
          {searchOpen && (
            <div className="absolute start-0 top-12 z-30 w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-4 text-sm text-muted shadow-lg">
              {c("comingInPhase", { phase: 2 })}
            </div>
          )}
        </div>

        {!isSupabaseConfigured && (
          <span
            title={c("demoModeHint")}
            className="hidden rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-text sm:inline"
          >
            {c("demoMode")}
          </span>
        )}

        {/* Timer bubble placeholder: the real bubble arrives in phase 3. */}
        <span
          title={`${t("timer")} · ${c("comingInPhase", { phase: 3 })}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-medium text-muted"
        >
          <Timer className="size-4 text-primary" aria-hidden />
          <span dir="ltr" className="font-mono tabular-nums">
            25:00
          </span>
        </span>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary"
          >
            {initials || "?"}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute end-0 top-12 z-30 w-48 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-lg">
              <Link
                role="menuitem"
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm text-text hover:bg-surface-2"
              >
                <Settings className="size-4" aria-hidden />
                {t("settings")}
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={async () => {
                  await signOut();
                  router.replace("/");
                  router.refresh();
                }}
                className="flex h-10 w-full items-center gap-2 rounded-[8px] px-3 text-sm text-text hover:bg-surface-2"
              >
                <LogOut className="size-4 rtl:rotate-180" aria-hidden />
                {c("signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomTabs() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const moreActive = !TABS.slice(0, 4).some((tab) => isActive(pathname, tab.href));
  return (
    <nav
      aria-label={t("menu")}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.href === "/more" ? moreActive : isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
