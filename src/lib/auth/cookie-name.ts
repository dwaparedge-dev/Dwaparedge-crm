// Shared by the proxy (edge) and the server code, so it must not import server-only modules.
// In production the "__Host-" prefix makes browsers refuse the cookie unless it is Secure, sent to this exact host
// and path "/" with no Domain, which stops a sibling subdomain from planting a session cookie.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-de_session" : "de_session";
