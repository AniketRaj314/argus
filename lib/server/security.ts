import "server-only";
import { getRuntimeEnv } from "../../db";
import { sha256 } from "./crypto";
import { externalRequestOrigin } from "./request-origin";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_FAILED") {
    super(message);
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("ARGUS request failed", error);
  return Response.json({ error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" }, { status: 500 });
}

export function assertJsonRequest(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json.", "INVALID_CONTENT_TYPE");
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = externalRequestOrigin(request, getRuntimeEnv().ARGUS_APP_ORIGIN);
  if (!origin || origin !== expected) throw new ApiError(403, "Request origin was rejected.", "INVALID_ORIGIN");
  if (request.headers.get("x-argus-request") !== "1") {
    throw new ApiError(403, "Security header is missing.", "CSRF_REJECTED");
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getClientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

export async function hashClientIp(request: Request): Promise<string> {
  const pepper = getRuntimeEnv().ARGUS_PASSWORD_PEPPER ?? "";
  return sha256(`${getClientIp(request)}\u0000${pepper}`);
}

export function parseCookies(request: Request): Record<string, string> {
  const cookie = request.headers.get("cookie") ?? "";
  return Object.fromEntries(cookie.split(";").flatMap((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [];
    return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
  }));
}

export function sessionCookie(token: string, request: Request, maxAge = 60 * 60 * 24 * 7): string {
  const secure = externalRequestOrigin(request, getRuntimeEnv().ARGUS_APP_ORIGIN).startsWith("https:") ? "; Secure" : "";
  return `argus_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function noStoreHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store, private");
  headers.set("Pragma", "no-cache");
  return headers;
}
