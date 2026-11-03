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

  const submission = getDatabase()
    .prepare(
      `SELECT candidate_email AS candidateEmail, status, deadline_at AS deadlineAt
       FROM submissions WHERE id = ?`,
    )
    .get(session.submissionId) as
    | { candidateEmail: string; status: string; deadlineAt: string }
    | undefined;

  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  if (
    submission.status !== "in_progress" ||
    new Date(submission.deadlineAt).getTime() <= Date.now()
  ) {
    return errorResponse("Sesi ujian sudah berakhir.", 409);
  }

  audit(
    submission.candidateEmail,
    "candidate_tab_hidden",
    "submission",
    session.submissionId,
  );
  return NextResponse.json({ recorded: true }, { status: 201 });
}
