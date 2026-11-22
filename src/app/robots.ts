import type { MetadataRoute } from "next";

const SITE = `https://${process.env.NEXT_PUBLIC_SITE_HOST || "soussy-study.vercel.app"}`;

/** Lets Google index the public pages (the app pages need an account anyway). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/sign-in", "/honesty", "/legal", "/school-it", "/join"], disallow: ["/api/", "/auth/"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
