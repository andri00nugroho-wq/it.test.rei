import { NextRequest, NextResponse } from "next/server";
import { errorResponse, isRecord } from "@/lib/api";
import {
  setSessionCookie,
  signInAdmin,
  type AdminSession,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.AUTH_SECRET)
  ) {
    return errorResponse("Konfigurasi Admin belum lengkap di environment server.", 503);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.email !== "string" || typeof body.password !== "string") {
    return errorResponse("Email dan kata sandi wajib diisi.");
  }
  if (!signInAdmin(body.email, body.password)) {
    return errorResponse("Email atau kata sandi tidak sesuai.", 401);
  }

  const response = NextResponse.json({ role: "admin" });
  const session: AdminSession = {
    role: "admin",
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  };
  setSessionCookie(response, session);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
