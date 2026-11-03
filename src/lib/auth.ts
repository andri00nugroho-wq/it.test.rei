import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export type AdminSession = { role: "admin"; expiresAt: number };
export type CandidateSession = {
  role: "candidate";
  submissionId: string;
  expiresAt: number;
};
export type Session = AdminSession | CandidateSession;

export const SESSION_COOKIE = "praktik_session";
export const ADMIN_SESSION_COOKIE = "praktik_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET wajib diatur sebelum menjalankan mode production.");
  }
  return "local-development-only-secret-change-before-deployment";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function signInAdmin(email: string, password: string) {
  const expectedEmail = process.env.ADMIN_EMAIL || "admin@example.local";
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin12345";
  return safeEqual(email.trim().toLowerCase(), expectedEmail.toLowerCase()) &&
    safeEqual(password, expectedPassword);
}

export function makeSession(
  session: Omit<Session, "expiresAt">,
) {
  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifySession(value?: string): Session | null {
  if (!value) return null;
  const [payload, receivedSignature, extra] = value.split(".");
  if (!payload || !receivedSignature || extra) return null;
  if (!safeEqual(signature(payload), receivedSignature)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;
    if (
      !data ||
      typeof data.expiresAt !== "number" ||
      data.expiresAt <= Math.floor(Date.now() / 1000) ||
      (data.role !== "admin" &&
        (data.role !== "candidate" || typeof data.submissionId !== "string"))
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function getSession(request: NextRequest) {
  return getAdminSession(request) ?? getCandidateSession(request);
}

export function getAdminSession(request: NextRequest): AdminSession | null {
  const session =
    verifySession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value) ??
    verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  return session?.role === "admin" ? session : null;
}

export function getCandidateSession(request: NextRequest): CandidateSession | null {
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  return session?.role === "candidate" ? session : null;
}

export function setSessionCookie(response: NextResponse, session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const value = `${payload}.${signature(payload)}`;
  response.cookies.set(session.role === "admin" ? ADMIN_SESSION_COOKIE : SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse, request: NextRequest) {
  const legacySession = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (legacySession?.role !== "admin") return;
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function hashInviteToken(token: string) {
  return createHmac("sha256", getSecret()).update(token).digest("hex");
}

export function newInviteToken() {
  return randomBytes(32).toString("base64url");
}
