import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const session = getSession(request);
  return NextResponse.json(
    {
      role: session?.role ?? null,
      showLocalCredentials:
        process.env.NODE_ENV !== "production" &&
        !process.env.ADMIN_EMAIL &&
        !process.env.ADMIN_PASSWORD,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
