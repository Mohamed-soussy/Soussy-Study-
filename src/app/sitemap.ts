import type { MetadataRoute } from "next";

const SITE = `https://${process.env.NEXT_PUBLIC_SITE_HOST || "soussy-study.vercel.app"}`;

/** Public pages Google can list. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/honesty`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/school-it`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
