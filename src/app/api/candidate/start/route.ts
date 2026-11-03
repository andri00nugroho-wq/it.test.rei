import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, isRecord } from "@/lib/api";
import {
  getCandidateSession,
  hashInviteToken,
  setSessionCookie,
  type CandidateSession,
} from "@/lib/auth";
import { audit, getDatabase, withTransaction } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.token !== "string" || body.token.length > 200) {
    return errorResponse("Tautan undangan tidak valid.");
  }
  const database = getDatabase();
  const invitation = database
    .prepare(
      `SELECT i.id, i.exam_id, i.candidate_name, i.candidate_email, i.expires_at,
       e.status AS exam_status, e.duration_minutes, e.rubric_version
       FROM invitations i JOIN exams e ON e.id = i.exam_id WHERE i.token_hash = ?`,
    )
    .get(hashInviteToken(body.token)) as
    | {
        id: string;
        exam_id: string;
        candidate_name: string;
        candidate_email: string;
        expires_at: string;
        exam_status: string;
        duration_minutes: number;
        rubric_version: number;
      }
    | undefined;
  if (!invitation || new Date(invitation.expires_at).getTime() <= Date.now()) {
    return errorResponse("Undangan tidak ditemukan atau sudah kedaluwarsa.", 404);
  }
  if (invitation.exam_status !== "active") {
    return errorResponse("Ujian ini sedang tidak menerima pengerjaan.", 403);
  }

  const existing = database
    .prepare("SELECT id, status FROM submissions WHERE invitation_id = ?")
    .get(invitation.id) as { id: string; status: string } | undefined;
  if (existing?.status === "submitted" || existing?.status === "assessed") {
    return errorResponse("Jawaban untuk undangan ini sudah dikirim.", 409);
  }

  const existingSession = getCandidateSession(request);
  if (
    existing &&
    existingSession?.role === "candidate" &&
    existingSession.submissionId === existing.id
  ) {
    return NextResponse.json({ redirect: "/candidate" });
  }
  if (existing) {
    return errorResponse(
      "Ujian ini sudah dimulai di sesi atau perangkat lain. Hubungi Admin jika Anda perlu melanjutkan.",
      409,
    );
  }

  const now = new Date();
  const deadline = new Date(
    now.getTime() + invitation.duration_minutes * 60 * 1000,
  );
  const submissionId = randomUUID();
  const startedSubmissionId = withTransaction(database, () => {
    const alreadyStarted = database
      .prepare("SELECT id FROM submissions WHERE invitation_id = ?")
      .get(invitation.id) as { id: string } | undefined;
    if (alreadyStarted) return alreadyStarted.id;

    database
      .prepare(
        `INSERT INTO submissions
         (id, exam_id, invitation_id, candidate_name, candidate_email, started_at,
          deadline_at, status, rubric_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?)`,
      )
      .run(
        submissionId,
        invitation.exam_id,
        invitation.id,
        invitation.candidate_name,
        invitation.candidate_email,
        now.toISOString(),
        deadline.toISOString(),
        invitation.rubric_version,
      );
    audit(invitation.candidate_email, "submission_started", "submission", submissionId);
    return submissionId;
  });
  if (startedSubmissionId !== submissionId) {
    return errorResponse(
      "Ujian ini sudah dimulai di sesi atau perangkat lain. Hubungi Admin jika Anda perlu melanjutkan.",
      409,
    );
  }

  const session: CandidateSession = {
    role: "candidate",
    submissionId,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  };
  const response = NextResponse.json({ redirect: "/candidate" });
  setSessionCookie(response, session);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
