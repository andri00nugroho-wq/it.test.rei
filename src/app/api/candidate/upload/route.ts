import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getCandidateSession } from "@/lib/auth";
import { audit, getDatabase, parseTasks } from "@/lib/db";
import { cleanOriginalName, getUploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

const allowedTypes: Record<string, { contentType: string; extension: string }> = {
  ".pdf": { contentType: "application/pdf", extension: ".pdf" },
  ".png": { contentType: "image/png", extension: ".png" },
  ".jpg": { contentType: "image/jpeg", extension: ".jpg" },
  ".jpeg": { contentType: "image/jpeg", extension: ".jpg" },
  ".txt": { contentType: "text/plain", extension: ".txt" },
  ".csv": { contentType: "text/csv", extension: ".csv" },
};

function isAllowedContent(extension: string, bytes: Uint8Array) {
  if (extension === ".pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (extension === ".png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return !bytes.includes(0);
}

export async function POST(request: NextRequest) {
  const session = getCandidateSession(request);
  if (!session) {
    return errorResponse("Sesi kandidat tidak ditemukan.", 401);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 5_500_000) {
    return errorResponse("Ukuran unggahan maksimal 5 MB.", 413);
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const taskId = form?.get("taskId");
  if (!(file instanceof File) || typeof taskId !== "string") {
    return errorResponse("Berkas dan tugas wajib dipilih.");
  }
  if (file.size < 1 || file.size > 5_000_000) {
    return errorResponse("Ukuran berkas harus antara 1 byte dan 5 MB.", 413);
  }

  const originalName = cleanOriginalName(file.name);
  const dot = originalName.lastIndexOf(".");
  const extension = dot >= 0 ? originalName.slice(dot).toLowerCase() : "";
  const type = allowedTypes[extension];
  if (!type) {
    return errorResponse("Format yang diizinkan: PDF, PNG, JPG, TXT, atau CSV.");
  }
  if (
    file.type &&
    file.type !== type.contentType &&
    !(extension === ".jpeg" && file.type === "image/jpeg") &&
    !(extension === ".csv" && file.type === "application/vnd.ms-excel")
  ) {
    return errorResponse("Tipe berkas tidak sesuai dengan ekstensinya.");
  }

  const database = getDatabase();
  const submission = database
    .prepare(
      `SELECT s.id, s.status, s.deadline_at AS deadlineAt, s.candidate_email AS email,
       e.tasks_json AS tasksJson
       FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE s.id = ?`,
    )
    .get(session.submissionId) as
    | { id: string; status: string; deadlineAt: string; email: string; tasksJson: string }
    | undefined;
  if (!submission) return errorResponse("Pengumpulan tidak ditemukan.", 404);
  if (
    submission.status !== "in_progress" ||
    new Date(submission.deadlineAt).getTime() <= Date.now()
  ) {
    return errorResponse("Ujian telah dikunci; berkas tidak dapat diunggah.", 409);
  }
  if (!parseTasks(submission.tasksJson).some((task) => task.id === taskId)) {
    return errorResponse("Tugas tidak ditemukan.", 404);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isAllowedContent(extension, bytes)) {
    return errorResponse("Isi berkas tidak cocok dengan format yang diizinkan.");
  }
  const id = randomUUID();
  const storedName = `${id}${type.extension}`;
  await writeFile(
    join(/*turbopackIgnore: true*/ getUploadDirectory(), storedName),
    bytes,
    { flag: "wx" },
  );
  database
    .prepare(
      "INSERT INTO attachments (id, submission_id, task_id, original_name, content_type, stored_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      submission.id,
      taskId,
      originalName,
      type.contentType,
      storedName,
      file.size,
      new Date().toISOString(),
    );
  audit(submission.email, "attachment_uploaded", "attachment", id);
  return NextResponse.json({ id, name: originalName, size: file.size }, { status: 201 });
}
