import { NextRequest, NextResponse } from "next/server";
import { errorResponse, isRecord } from "@/lib/api";
import { getAdminSession } from "@/lib/auth";
import { audit, getDatabase, getRubric } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!getAdminSession(request)) {
    return errorResponse("Akses Admin diperlukan.", 401);
  }
  const { id } = await context.params;
  const database = getDatabase();
  const submission = database
    .prepare(
      `SELECT s.id, s.candidate_name AS candidateName, s.candidate_email AS candidateEmail,
       s.started_at AS startedAt, s.deadline_at AS deadlineAt, s.submitted_at AS submittedAt,
       s.status, s.answers_json AS answers, s.rubric_version AS rubricVersion,
       s.assessment_json AS assessment, s.score, e.title AS examTitle, e.position,
       e.id AS examId, e.tasks_json AS tasksJson
       FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE s.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        candidateName: string;
        candidateEmail: string;
        startedAt: string;
        deadlineAt: string;
        submittedAt: string | null;
        status: string;
        answers: string;
        rubricVersion: number;
        assessment: string;
        score: number | null;
        examTitle: string;
        position: string;
        examId: string;
        tasksJson: string;
      }
    | undefined;
  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  const attachments = database
    .prepare(
      "SELECT id, task_id AS taskId, original_name AS name, size, created_at AS createdAt FROM attachments WHERE submission_id = ? ORDER BY created_at",
    )
    .all(id);
  return NextResponse.json({
    ...submission,
    answers: JSON.parse(submission.answers) as Record<string, unknown>,
    assessment: JSON.parse(submission.assessment) as Record<string, unknown>,
    tasks: JSON.parse(submission.tasksJson) as unknown[],
    criteria: getRubric(submission.examId, submission.rubricVersion),
    attachments,
    tasksJson: undefined,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!getAdminSession(request)) {
    return errorResponse("Akses Admin diperlukan.", 401);
  }
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !isRecord(body.assessment) || typeof body.final !== "boolean") {
    return errorResponse("Format penilaian tidak valid.");
  }
  const database = getDatabase();
  const submission = database
    .prepare(
      "SELECT id, exam_id AS examId, rubric_version AS rubricVersion, status FROM submissions WHERE id = ?",
    )
    .get(id) as
    | { id: string; examId: string; rubricVersion: number; status: string }
    | undefined;
  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  if (submission.status === "in_progress") {
    return errorResponse("Kandidat belum mengirimkan ujian.", 409);
  }

  const criteria = getRubric(submission.examId, submission.rubricVersion);
  const assessment: Record<string, { score: number; comment: string }> = {};
  for (const criterion of criteria) {
    const entry = body.assessment[criterion.id];
    if (entry === undefined && !body.final) continue;
    if (
      !isRecord(entry) ||
      typeof entry.score !== "number" ||
      !Number.isFinite(entry.score) ||
      entry.score < 0 ||
      entry.score > 5
    ) {
      return errorResponse(`Isi skor 0–5 untuk kriteria "${criterion.name}".`);
    }
    assessment[criterion.id] = {
      score: entry.score,
      comment: typeof entry.comment === "string" ? entry.comment.slice(0, 1000) : "",
    };
  }
  const score =
    criteria.length > 0 &&
    criteria.every((criterion) => assessment[criterion.id] !== undefined)
      ? Number(
          criteria
            .reduce(
              (sum, criterion) =>
                sum +
                (assessment[criterion.id].score * criterion.weight) / 5,
              0,
            )
            .toFixed(1),
        )
      : null;
  if (body.final && score === null) {
    return errorResponse("Lengkapi semua kriteria sebelum memfinalisasi nilai.");
  }
  const assessedAt = body.final ? new Date().toISOString() : null;
  database
    .prepare(
      "UPDATE submissions SET assessment_json = ?, score = ?, status = ?, assessed_at = ? WHERE id = ?",
    )
    .run(
      JSON.stringify(assessment),
      score,
      body.final ? "assessed" : "submitted",
      assessedAt,
      submission.id,
    );
  audit("admin", body.final ? "assessment_finalized" : "assessment_saved", "submission", id);
  return NextResponse.json({ score, status: body.final ? "assessed" : "submitted" });
}
