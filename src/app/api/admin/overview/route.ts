import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, isRecord } from "@/lib/api";
import { getAdminSession } from "@/lib/auth";
import {
  audit,
  getDatabase,
  getRubric,
  withTransaction,
  type ExamTask,
} from "@/lib/db";

export const runtime = "nodejs";

type ExamRow = {
  id: string;
  position: string;
  title: string;
  instructions: string;
  duration_minutes: number;
  status: string;
  tasks_json: string;
  rubric_version: number;
  created_at: string;
};

function isTaskType(value: unknown): value is ExamTask["type"] {
  return (
    value === "code" ||
    value === "sql" ||
    value === "qa" ||
    value === "troubleshooting" ||
    value === "text"
  );
}

function normalizeTasks(value: unknown): ExamTask[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
  if (
    !value.every(
      (item) =>
        isRecord(item) &&
        typeof item.title === "string" &&
        item.title.trim().length > 0 &&
        item.title.trim().length <= 160 &&
        isTaskType(item.type) &&
        typeof item.instructions === "string" &&
        item.instructions.trim().length > 0 &&
        item.instructions.trim().length <= 3000,
    )
  ) {
    return null;
  }
  return value.map((item) => ({
    id: randomUUID(),
    title: item.title.trim(),
    type: item.type,
    instructions: item.instructions.trim(),
  }));
}

export function GET(request: NextRequest) {
  if (!getAdminSession(request)) {
    return errorResponse("Akses Admin diperlukan.", 401);
  }
  const database = getDatabase();
  const exams = database
    .prepare(
      `SELECT e.id, e.position, e.title, e.instructions, e.duration_minutes, e.status,
       e.tasks_json, e.rubric_version, e.created_at,
       (SELECT COUNT(*) FROM invitations i WHERE i.exam_id = e.id) AS invitation_count,
       (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submission_count
       FROM exams e ORDER BY e.created_at DESC`,
    )
    .all() as Array<ExamRow & { invitation_count: number; submission_count: number }>;
  const submissions = database
    .prepare(
      `SELECT s.id, s.exam_id AS examId, e.title AS examTitle, e.position,
       s.candidate_name AS candidateName, s.candidate_email AS candidateEmail,
       s.started_at AS startedAt, s.deadline_at AS deadlineAt,
       s.submitted_at AS submittedAt, s.status, s.score,
       (SELECT COUNT(*) FROM audit_events a
        WHERE a.object_type = 'submission' AND a.object_id = s.id
        AND a.action = 'candidate_tab_hidden') AS focusLossCount
       FROM submissions s JOIN exams e ON e.id = s.exam_id
       ORDER BY s.started_at DESC LIMIT 100`,
    )
    .all();
  const counts = database
    .prepare(
      `SELECT COUNT(*) AS candidates,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inProgress,
       SUM(CASE WHEN status IN ('submitted', 'assessed') THEN 1 ELSE 0 END) AS submitted
       FROM submissions`,
    )
    .get() as { candidates: number; inProgress: number | null; submitted: number | null };

  return NextResponse.json({
    exams: exams.map((exam) => ({
      ...exam,
      tasks: JSON.parse(exam.tasks_json) as ExamTask[],
      criteria: getRubric(exam.id),
      tasks_json: undefined,
    })),
    submissions,
    counts: {
      candidates: counts.candidates,
      inProgress: counts.inProgress ?? 0,
      submitted: counts.submitted ?? 0,
      exams: exams.length,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!getAdminSession(request)) {
    return errorResponse("Akses Admin diperlukan.", 401);
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    !isRecord(body) ||
    typeof body.position !== "string" ||
    typeof body.title !== "string" ||
    typeof body.instructions !== "string" ||
    typeof body.durationMinutes !== "number"
  ) {
    return errorResponse("Lengkapi semua informasi ujian dengan format yang benar.");
  }
  const position = body.position.trim().slice(0, 100);
  const title = body.title.trim().slice(0, 160);
  const instructions = body.instructions.trim().slice(0, 3000);
  const durationMinutes = Math.floor(body.durationMinutes);
  const taskInput =
    body.tasks ??
    (typeof body.taskTitle === "string" &&
    typeof body.taskInstructions === "string" &&
    isTaskType(body.taskType)
      ? [{ title: body.taskTitle, type: body.taskType, instructions: body.taskInstructions }]
      : undefined);
  const tasks = normalizeTasks(taskInput);
  if (
    !position ||
    !title ||
    !instructions ||
    !tasks ||
    durationMinutes < 5 ||
    durationMinutes > 480
  ) {
    return errorResponse("Lengkapi ujian dengan 1–30 tugas yang valid; durasi harus 5–480 menit.");
  }

  const database = getDatabase();
  const examId = randomUUID();
  const rubric = [
    ["Ketepatan solusi", "Akurasi diagnosis atau solusi teknis.", 35],
    ["Kualitas teknis", "Kualitas implementasi dan pertimbangan risiko.", 30],
    ["Kelengkapan analisis", "Kelengkapan pengujian dan penjelasan.", 20],
    ["Komunikasi", "Kejelasan dokumentasi dan langkah kerja.", 15],
  ] as const;
  const create = () => {
    database
      .prepare(
        `INSERT INTO exams (id, position, title, instructions, duration_minutes, status, tasks_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        examId,
        position,
        title,
        instructions,
        durationMinutes,
        JSON.stringify(tasks),
        new Date().toISOString(),
      );
    rubric.forEach(([name, description, weight], index) => {
      database
        .prepare(
          "INSERT INTO rubric_criteria (id, exam_id, version, name, description, weight, position) VALUES (?, ?, 1, ?, ?, ?, ?)",
        )
        .run(randomUUID(), examId, name, description, weight, index);
    });
  };
  withTransaction(database, create);
  audit("admin", "exam_created", "exam", examId);
  return NextResponse.json({ id: examId }, { status: 201 });
}
