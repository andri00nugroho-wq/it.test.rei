import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, isRecord } from "@/lib/api";
import { getAdminSession, hashInviteToken } from "@/lib/auth";
import { audit, getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!getAdminSession(request)) {
    return errorResponse("Akses Admin diperlukan.", 401);
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    !isRecord(body) ||
    typeof body.examId !== "string" ||
    typeof body.candidateName !== "string" ||
    typeof body.candidateEmail !== "string"
  ) {
    return errorResponse("Ujian, nama, dan email kandidat wajib diisi.");
  }
  const candidateName = body.candidateName.trim().slice(0, 120);
  const candidateEmail = body.candidateEmail.trim().toLowerCase().slice(0, 254);
  if (
    !candidateName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)
  ) {
    return errorResponse("Nama atau format email kandidat tidak valid.");
  }

  const database = getDatabase();
  const exam = database
    .prepare("SELECT id, status FROM exams WHERE id = ?")
    .get(body.examId) as { id: string; status: string } | undefined;
  if (!exam) return errorResponse("Ujian tidak ditemukan.", 404);
  if (exam.status !== "active") {
    return errorResponse("Terbitkan ujian sebelum membuat undangan.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.APP_URL) {
    return errorResponse("APP_URL wajib diatur untuk menerbitkan undangan.", 503);
  }
  let appOrigin: string;
  try {
    const appUrl = new URL(process.env.APP_URL || request.nextUrl.origin);
    if (
      !["http:", "https:"].includes(appUrl.protocol) ||
      (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:")
    ) {
      return errorResponse("APP_URL harus menggunakan HTTPS pada mode production.", 503);
    }
    appOrigin = appUrl.origin;
  } catch {
    return errorResponse("APP_URL tidak valid.", 503);
  }
  const existing = database
    .prepare("SELECT id FROM invitations WHERE exam_id = ? AND candidate_email = ?")
    .get(exam.id, candidateEmail);
  if (existing) {
    return errorResponse("Undangan untuk email ini pada ujian tersebut sudah ada.", 409);
  }

  const token = randomBytes(32).toString("base64url");
  const invitationId = randomUUID();
  database
    .prepare(
      "INSERT INTO invitations (id, token_hash, exam_id, candidate_name, candidate_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      invitationId,
      hashInviteToken(token),
      exam.id,
      candidateName,
      candidateEmail,
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      new Date().toISOString(),
    );
    audit("admin", "invitation_created", "invitation", invitationId);
    const url = new URL(`/invite/${token}`, appOrigin).toString();
  return NextResponse.json({ url }, { status: 201 });
}
