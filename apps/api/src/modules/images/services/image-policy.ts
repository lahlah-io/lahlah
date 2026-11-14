import { isIP } from "node:net";

/** IPv4/IPv6 ranges that must never be reachable through the image proxy (SSRF). */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("fe80")) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }
  return true;
}

/**
 * Only https URLs on an explicit host allowlist are proxied. Credentials and
 * non-https protocols are rejected outright.
 */
export function parseAllowedSource(
  raw: string,
  allowedHosts: string[],
  allowInsecure = false,
): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.some((entry) => entry.trim().toLowerCase() === host);
  return allowed ? url : null;
}
