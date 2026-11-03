import { NextRequest, NextResponse } from "next/server";
import { errorResponse, isRecord } from "@/lib/api";
import { getCandidateSession } from "@/lib/auth";
import { audit, getDatabase, parseTasks } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  const session = getCandidateSession(request);
  if (!session) {
    return errorResponse("Sesi kandidat tidak ditemukan.", 401);
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    !isRecord(body) ||
    !isRecord(body.answers) ||
    (body.baseRevision !== null && typeof body.baseRevision !== "string")
  ) {
    return errorResponse("Format jawaban tidak valid.");
  }
  const serialized = JSON.stringify(body.answers);
  if (Buffer.byteLength(serialized, "utf8") > 500_000) {
    return errorResponse("Ukuran jawaban melebihi batas 500 KB.", 413);
  }
  const database = getDatabase();
  const submission = database
    .prepare(
      `SELECT s.id, s.status, s.deadline_at AS deadlineAt, s.candidate_email AS email,
       s.answers_updated_at AS answersUpdatedAt,
       e.tasks_json AS tasksJson
       FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE s.id = ?`,
    )
    .get(session.submissionId) as
    | {
        id: string;
        status: string;
        deadlineAt: string;
        email: string;
        answersUpdatedAt: string | null;
        tasksJson: string;
      }
    | undefined;
  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  if (submission.status !== "in_progress") {
    return errorResponse("Ujian telah dikirim dan tidak dapat diubah.", 409);
  }
  if (new Date(submission.deadlineAt).getTime() <= Date.now()) {
    const submittedAt = new Date().toISOString();
    database
      .prepare(
        "UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'in_progress'",
      )
      .run(submittedAt, submission.id);
    audit(submission.email, "submission_time_expired", "submission", submission.id);
    return errorResponse("Waktu ujian habis. Jawaban terakhir yang tersimpan telah dikunci.", 410);
  }
  if ((body.baseRevision ?? null) !== submission.answersUpdatedAt) {
    return errorResponse(
      "Jawaban berubah di sesi lain. Muat ulang sebelum menyimpan agar perubahan tidak tertimpa.",
      409,
    );
  }

  const validTaskIds = new Set(parseTasks(submission.tasksJson).map((task) => task.id));
  if (Object.keys(body.answers).some((taskId) => !validTaskIds.has(taskId))) {
    return errorResponse("Jawaban memuat tugas yang tidak tersedia.", 400);
  }
  const savedAt = new Date().toISOString();
  const result = database
    .prepare(
      "UPDATE submissions SET answers_json = ?, answers_updated_at = ? WHERE id = ? AND status = 'in_progress' AND answers_updated_at IS ?",
    )
    .run(serialized, savedAt, submission.id, submission.answersUpdatedAt);
  if (result.changes !== 1) return errorResponse("Jawaban gagal disimpan.", 409);
  return NextResponse.json(
    { savedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
