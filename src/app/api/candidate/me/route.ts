import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getCandidateSession } from "@/lib/auth";
import { audit, getDatabase, parseTasks } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const session = getCandidateSession(request);
  if (!session) {
    return errorResponse("Sesi kandidat tidak ditemukan.", 401);
  }
  const database = getDatabase();
  const submission = database
    .prepare(
      `SELECT s.id, s.candidate_name AS candidateName, s.candidate_email AS candidateEmail,
       s.started_at AS startedAt, s.deadline_at AS deadlineAt, s.submitted_at AS submittedAt,
       s.status, s.answers_json AS answers, s.answers_updated_at AS answersUpdatedAt,
       s.rubric_version AS rubricVersion,
       (SELECT COUNT(*) FROM audit_events a
        WHERE a.object_type = 'submission' AND a.object_id = s.id
        AND a.action = 'candidate_tab_hidden') AS focusLossCount,
       e.id AS examId, e.position, e.title, e.instructions, e.duration_minutes AS durationMinutes,
       e.tasks_json AS tasksJson
       FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE s.id = ?`,
    )
    .get(session.submissionId) as
    | {
        id: string;
        candidateName: string;
        candidateEmail: string;
        startedAt: string;
        deadlineAt: string;
        submittedAt: string | null;
        status: string;
        answers: string;
        answersUpdatedAt: string | null;
        rubricVersion: number;
        focusLossCount: number;
        examId: string;
        position: string;
        title: string;
        instructions: string;
        durationMinutes: number;
        tasksJson: string;
      }
    | undefined;
  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  if (
    submission.status === "in_progress" &&
    new Date(submission.deadlineAt).getTime() <= Date.now()
  ) {
    const submittedAt = new Date().toISOString();
    database
      .prepare(
        "UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'in_progress'",
      )
      .run(submittedAt, submission.id);
    audit(submission.candidateEmail, "submission_time_expired", "submission", submission.id);
    submission.status = "submitted";
    submission.submittedAt = submittedAt;
  }
  const attachments = database
    .prepare(
      `SELECT id, task_id AS taskId, original_name AS name, size, created_at AS createdAt
       FROM attachments WHERE submission_id = ? ORDER BY created_at`,
    )
    .all(submission.id);
  return NextResponse.json(
    {
      ...submission,
      answers: JSON.parse(submission.answers) as Record<string, unknown>,
      tasks: parseTasks(submission.tasksJson),
      attachments,
      serverNow: new Date().toISOString(),
      tasksJson: undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
