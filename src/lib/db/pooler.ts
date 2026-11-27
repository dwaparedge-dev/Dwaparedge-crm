/**
 * Supabase's session pooler (port 5432) allows 15 client connections in total, shared by every server, dev run and script that uses the
 * database, so it runs out (EMAXCONNSESSION, every page fails). The app must use the transaction pooler (port 6543); the session URL
 * belongs in DIRECT_URL for db:sync and db:migrate. Returns the warning to log, or null when the URL is fine.
 */
export function sessionPoolerWarning(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const onPooler = parsed.hostname.endsWith(".pooler.supabase.com");
  const port = parsed.port || "5432";
  if (!onPooler || port !== "5432") return null;
  return "DATABASE_URL uses the Supabase session pooler (port 5432), which allows only 15 connections in total and will run out (EMAXCONNSESSION). Use the transaction pooler (port 6543) in DATABASE_URL and keep the 5432 URL in DIRECT_URL for db:sync and db:migrate. See docs/SECURITY.md.";
}
