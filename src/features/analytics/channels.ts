// Pure: turns "where did this visit come from" (referrer host + UTM tags) into a marketing channel.

export const CHANNELS = ["Direct", "Organic search", "Social", "Paid", "Email", "Referral"] as const;
export type Channel = (typeof CHANNELS)[number];

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia|brave|startpage)\./i;
const SOCIAL = /(^|\.)(linkedin|facebook|instagram|twitter|x|t|youtube|whatsapp|wa|reddit|pinterest|telegram|threads)\.(com|me|co|net|org|gl)$|^lnkd\.in$|^l\.facebook\.com$/i;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_social|paidsocial|display|cpm|ads?)$/i;
const EMAIL_MEDIUM = /^(e-?mail|newsletter)$/i;

export function classifyChannel(v: { referrerHost: string | null; utmMedium: string | null; utmSource?: string | null }): Channel {
  const medium = (v.utmMedium ?? "").trim();
  if (PAID_MEDIUM.test(medium)) return "Paid";
  if (EMAIL_MEDIUM.test(medium)) return "Email";
  const host = (v.referrerHost ?? "").trim().toLowerCase();
  if (host) {
    if (SEARCH.test(host)) return "Organic search";
    if (SOCIAL.test(host)) return "Social";
    return "Referral";
  }
  // No referrer: an untagged visit is Direct; a tagged one (a link in a message or QR code) is still counted by its medium.
  if (/^(social|social-media|sm)$/i.test(medium)) return "Social";
  if (/^(organic|seo)$/i.test(medium)) return "Organic search";
  if (medium || v.utmSource) return "Referral";
  return "Direct";
}
