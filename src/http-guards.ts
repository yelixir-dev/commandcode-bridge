import type { FastifyRequest } from "fastify";

export function isAdminRequest(request: FastifyRequest): boolean {
  return request.url.startsWith("/admin/");
}

export function isDashboardAdminWrite(request: FastifyRequest): boolean {
  return (
    (request.method === "PUT" && request.url.startsWith("/admin/config")) ||
    (request.method === "POST" && request.url.startsWith("/admin/restart"))
  );
}

export function shouldRequireAuth(request: FastifyRequest): boolean {
  if (request.method === "OPTIONS") return false;
  if (request.method === "GET" && request.url.startsWith("/admin/config")) return false;
  if (request.method === "GET" && request.url.startsWith("/admin/commandcode/credentials")) {
    return false;
  }
  return request.url.startsWith("/v1/") || isAdminRequest(request);
}

export function isPublicAdminRequest(request: FastifyRequest): boolean {
  return (
    request.method === "OPTIONS" ||
    (request.method === "GET" &&
      (request.url.startsWith("/admin/config") ||
        request.url.startsWith("/admin/commandcode/credentials")))
  );
}

export function sameHostnameOrigin(request: FastifyRequest): string | undefined {
  const origin = request.headers.origin;
  if (!origin) return undefined;
  const host = request.headers.host;
  if (!host) return undefined;
  try {
    const originUrl = new URL(origin);
    const hostName = host.split(":")[0];
    if (originUrl.protocol === "http:" && originUrl.hostname === hostName) return origin;
  } catch {
    return undefined;
  }
  return undefined;
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0]?.toLowerCase();
  if (hostname === "::1" || hostname === "localhost") return true;
  const octets = hostname?.split(".") ?? [];
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
  );
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return normalized === "::1" || normalized.startsWith("127.");
}

export function isLoopbackBootstrapRequest(request: FastifyRequest): boolean {
  return isLoopbackAddress(request.ip) && isLoopbackHost(request.headers.host);
}
