"use client";

/** Last-resort screen if the whole app fails to load (no translations available here). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 480, margin: "10vh auto" }}>
        <h1>Something went wrong / حدث خطأ ما</h1>
        <p>Your work is saved. Try again, or reload the page.</p>
        <button onClick={() => reset()} style={{ padding: "10px 16px", marginInlineEnd: 8 }}>Try again</button>
        <button onClick={() => (window.location.href = "/sign-in")} style={{ padding: "10px 16px" }}>Sign in again</button>
        <details style={{ marginTop: 16, fontSize: 12, color: "#555" }}>
          <summary>Details for the site owner</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}{error.digest ? `\n#${error.digest}` : ""}</pre>
        </details>
      </body>
    </html>
  );
}
