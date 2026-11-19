import type { MetadataRoute } from "next";

/** Installable PWA (section 4): students can keep Soussy Study on their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Soussy Study",
    short_name: "Soussy",
    description: "Study your way, with an AI that knows your curriculum.",
    start_url: "/home",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
