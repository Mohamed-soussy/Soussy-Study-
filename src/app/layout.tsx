import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { dirFor, THEME_COOKIE, type Locale } from "@/i18n/config";
import "./globals.css";

// Fonts from section 2: Plus Jakarta Sans (headings), Inter (body),
// JetBrains Mono (code and math input), IBM Plex Sans Arabic (Arabic).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
/** Accessibility option: a typeface designed for low vision and dyslexia (section 12.5). */
const readable = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-readable", display: "swap", preload: false });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Soussy Study", template: "%s · Soussy Study" },
  description: "Study your way, with an AI that knows your curriculum.",
  applicationName: "Soussy Study",
  appleWebApp: { capable: true, title: "Soussy Study", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  const theme = (await cookies()).get(THEME_COOKIE)?.value;

  return (
    <html
      suppressHydrationWarning
      lang={locale}
      dir={dirFor(locale)}
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${jakarta.variable} ${inter.variable} ${mono.variable} ${arabic.variable} ${readable.variable}`}
    >
      <head>
        {/* Accessibility settings, applied before the first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var a=JSON.parse(localStorage.getItem("soussy.a11y")||"{}"),h=document.documentElement;if(a.font)h.dataset.font=a.font;if(a.motion)h.dataset.motion=a.motion;if(a.size&&a.size!==100)h.style.fontSize=a.size+"%"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
