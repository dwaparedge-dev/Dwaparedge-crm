"use client";

// Replaces the root layout when it fails, so it brings its own <html>/<body> and plain styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center" }}>
        <div role="alert">
          <h2>Something went wrong</h2>
          <p>The application hit an unexpected error{error.digest ? ` (reference ${error.digest})` : ""}.</p>
          <button onClick={() => retry()} style={{ padding: "8px 16px", fontSize: 16 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
