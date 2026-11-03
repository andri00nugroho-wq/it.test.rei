import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getCandidateSession } from "@/lib/auth";
import { audit, getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  const session = getCandidateSession(request);
  if (!session) {
    return errorResponse("Sesi kandidat tidak ditemukan.", 401);
  }
  const database = getDatabase();
  const submission = database
    .prepare(
      "SELECT id, status, deadline_at AS deadlineAt, candidate_email AS email FROM submissions WHERE id = ?",
    )
    .get(session.submissionId) as
    | { id: string; status: string; deadlineAt: string; email: string }
    | undefined;
  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  if (submission.status !== "in_progress") {
    return errorResponse("Ujian ini telah dikirim sebelumnya.", 409);
  }
  const submittedAt = new Date().toISOString();
  const result = database
    .prepare(
      "UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'in_progress'",
    )
    .run(submittedAt, submission.id);
  if (result.changes !== 1) return errorResponse("Pengiriman gagal. Muat ulang halaman.", 409);
  audit(submission.email, "submission_sent", "submission", submission.id);
  return NextResponse.json({ status: "submitted", submittedAt });
}
