/** Small cookie helpers shared by the public Growth Intelligence tracking endpoints. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key.trim() === name && rest.length) return decodeURIComponent(rest.join("=").trim());
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export const VISITOR_COOKIE = "gi_vid";
export const SESSION_COOKIE = "gi_sid";
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 730; // 2 years
export const SESSION_MAX_AGE = 60 * 30; // 30 minutes
