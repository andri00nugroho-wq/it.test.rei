import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response, request);
  return response;
}
