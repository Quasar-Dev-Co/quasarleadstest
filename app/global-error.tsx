"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches uncaught client-side errors (including the
 * "removeChild" NotFoundError that browser extensions can trigger by
 * modifying React-managed DOM nodes) and shows a retry button instead of
 * Next.js's generic "Application error: a client-side exception has occurred"
 * page.
 *
 * This file replaces the root <html>/<body> wrapper, so it must render them.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error so it is still visible in the browser console for debugging
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="nl" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            backgroundColor: "#0a0a0a",
            color: "#fafafa",
          }}
        >
          <div style={{ maxWidth: "30rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.75rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#a1a1aa", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
              An unexpected error occurred while rendering the page. This can
              happen when a browser extension modifies the page content. Try
              reloading — if the problem persists, disabling browser extensions
              on this site may help.
            </p>
            <button
              onClick={reset}
              style={{
                backgroundColor: "#a855f7",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.5rem",
                fontSize: "0.95rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
