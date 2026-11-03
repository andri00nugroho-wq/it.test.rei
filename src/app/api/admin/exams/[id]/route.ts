import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!getAdminSession(request)) {
    return errorResponse("Akses Admin diperlukan.", 401);
  }
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return errorResponse("Permintaan tidak valid.");
  const database = getDatabase();
  const exam = database.prepare("SELECT id, status FROM exams WHERE id = ?").get(id) as
    | { id: string; status: string }
    | undefined;
  if (!exam) return errorResponse("Ujian tidak ditemukan.", 404);

  if (typeof body.status === "string") {
    if (!["draft", "active", "closed"].includes(body.status)) {
      return errorResponse("Status ujian tidak valid.");
    }
    database.prepare("UPDATE exams SET status = ? WHERE id = ?").run(body.status, id);
    audit("admin", `exam_${body.status}`, "exam", id);
    return NextResponse.json({ success: true });
  }

  if ("tasks" in body) {
    if (
      typeof body.position !== "string" ||
      typeof body.title !== "string" ||
      typeof body.instructions !== "string" ||
      typeof body.durationMinutes !== "number"
    ) {
      return errorResponse("Lengkapi informasi ujian dan durasi dengan format yang benar.");
    }
    const position = body.position.trim();
    const title = body.title.trim();
    const instructions = body.instructions.trim();
    const durationMinutes = Math.floor(body.durationMinutes);
    const tasks = normalizeTasks(body.tasks);
    if (
      !position ||
      position.length > 100 ||
      !title ||
      title.length > 160 ||
      !instructions ||
      instructions.length > 3000 ||
      durationMinutes < 5 ||
      durationMinutes > 480 ||
      !tasks
    ) {
      return errorResponse("Lengkapi ujian dengan 1–30 tugas yang valid; durasi harus 5–480 menit.");
    }
    const submissions = database
      .prepare("SELECT COUNT(*) AS count FROM submissions WHERE exam_id = ?")
      .get(id) as { count: number };
    if (submissions.count > 0) {
      return errorResponse(
        "Ujian tidak dapat diubah setelah kandidat mulai. Buat ujian baru agar jawaban lama tetap sesuai.",
        409,
      );
    }
    database
      .prepare(
        "UPDATE exams SET position = ?, title = ?, instructions = ?, duration_minutes = ?, tasks_json = ? WHERE id = ?",
      )
      .run(position, title, instructions, durationMinutes, JSON.stringify(tasks), id);
    audit("admin", "exam_updated", "exam", id);
    return NextResponse.json({ success: true, tasks });
  }

  if (Array.isArray(body.criteria)) {
    const criteria = body.criteria;
    if (
      criteria.length < 1 ||
      criteria.length > 12 ||
      !criteria.every(
        (item) =>
          isRecord(item) &&
          typeof item.name === "string" &&
          item.name.trim().length > 0 &&
          typeof item.description === "string" &&
          typeof item.weight === "number" &&
          Number.isFinite(item.weight) &&
          item.weight > 0 &&
          item.weight <= 100,
      )
    ) {
      return errorResponse("Kriteria rubrik tidak valid.");
    }
    const total = criteria.reduce(
      (sum, item) => sum + (isRecord(item) && typeof item.weight === "number" ? item.weight : 0),
      0,
    );
    if (Math.abs(total - 100) > 0.001) {
      return errorResponse("Total bobot rubrik harus tepat 100%.");
    }
    const currentVersion = database
      .prepare("SELECT rubric_version FROM exams WHERE id = ?")
      .get(id) as { rubric_version: number };
    const nextVersion = currentVersion.rubric_version + 1;
    const saveRubric = () => {
      database
        .prepare("UPDATE exams SET rubric_version = ? WHERE id = ?")
        .run(nextVersion, id);
      const insert = database.prepare(
        "INSERT INTO rubric_criteria (id, exam_id, version, name, description, weight, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      criteria.forEach((item, index) => {
        if (!isRecord(item)) return;
        insert.run(
          randomUUID(),
          id,
          nextVersion,
          String(item.name).trim().slice(0, 120),
          String(item.description).trim().slice(0, 500),
          Number(item.weight),
          index,
        );
      });
    };
    withTransaction(database, saveRubric);
    audit("admin", "rubric_updated", "exam", id);
    return NextResponse.json({ version: nextVersion, criteria: getRubric(id) });
  }

  return errorResponse("Tidak ada perubahan yang dapat disimpan.");
}
