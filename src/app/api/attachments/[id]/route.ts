import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getAdminSession, getCandidateSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getUploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const session = getAdminSession(request) ?? getCandidateSession(request);
  if (!session) return errorResponse("Sesi tidak ditemukan.", 401);
  const { id } = await context.params;
  const database = getDatabase();
  const attachment = database
    .prepare(
      `SELECT a.stored_name AS storedName, a.original_name AS originalName,
       a.content_type AS contentType, a.submission_id AS submissionId
       FROM attachments a WHERE a.id = ?`,
    )
    .get(id) as
    | {
        storedName: string;
        originalName: string;
        contentType: string;
        submissionId: string;
      }
    | undefined;
  if (!attachment) return errorResponse("Lampiran tidak ditemukan.", 404);
  if (
    session.role === "candidate" &&
    session.submissionId !== attachment.submissionId
  ) {
    return errorResponse("Anda tidak berhak mengakses lampiran ini.", 403);
  }

  let content: Buffer;
  try {
    content = await readFile(join(getUploadDirectory(), attachment.storedName));
  } catch (error) {
    console.error("Lampiran tidak dapat dibaca.", error);
    return errorResponse("Lampiran tidak dapat dibaca.", 500);
  }
  const safeName = attachment.originalName.replace(/["\\\r\n]/g, "_");
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
