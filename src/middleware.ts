import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Pages that need a signed-in student. */
const PROTECTED = [
  "/home", "/calendar", "/hub", "/whiteboard", "/solver", "/vault", "/lessons",
  "/flashcards", "/focus", "/core", "/squads", "/more", "/settings", "/onboarding",
  "/workspace", "/notes", "/reset-password", "/remote", "/scan", "/link", "/moderate", "/system", "/progress", "/rooms", "/teach", "/exam",
];

/**
 * Keeps the Supabase session fresh and sends signed-out visitors to /sign-in.
 * In demo mode there is no server session, so the app shell checks the
 * browser-saved demo profile instead.
 */
export async function middleware(request: NextRequest) {
  // Always use the real address: the long one-off Vercel links ("soussy-study-abc123-….vercel.app")
  // break the robot check and Google sign-in, which only allow soussy-study.vercel.app.
  const canonical = process.env.NEXT_PUBLIC_SITE_HOST || "soussy-study.vercel.app";
  const host = request.headers.get("host") ?? "";
  if (process.env.VERCEL_ENV === "production" && host.endsWith(".vercel.app") && host !== canonical) {
    const url = request.nextUrl.clone();
    url.host = canonical;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  if (!isSupabaseConfigured) return NextResponse.next();

  // Google / email sometimes return to the home page (e.g. "/?code=…") instead of /auth/callback.
  const sp = request.nextUrl.searchParams;
  if (request.nextUrl.pathname !== "/auth/callback" && (sp.has("code") || sp.has("error_description"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|.*\\.(?:svg|png|ico)$).*)"],
};
