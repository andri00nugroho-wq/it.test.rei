import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ExamTask = {
  id: string;
  title: string;
  type: "code" | "sql" | "qa" | "troubleshooting" | "text";
  instructions: string;
};

export type RubricCriterion = {
  id: string;
  name: string;
  description: string;
  weight: number;
  position: number;
};

const positionSeeds: Array<{
  position: string;
  title: string;
  instructions: string;
  task: ExamTask;
}> = [
  {
    position: "IT Support",
    title: "Simulasi Troubleshooting Jaringan",
    instructions:
      "Analisis gejala dan bukti yang tersedia. Jelaskan diagnosis, langkah pemeriksaan secara berurutan, serta isi laporan insiden singkat.",
    task: {
      id: "network-incident",
      title: "Gangguan konektivitas kantor",
      type: "troubleshooting",
      instructions:
        "Seorang pengguna tidak dapat membuka aplikasi internal. Perangkat lain di ruangan yang sama juga mengalami masalah. Catat analisis dan langkah penanganan.",
    },
  },
  {
    position: "QA Engineer",
    title: "Analisis Test Case dan Bug",
    instructions:
      "Buat test case yang dapat direproduksi. Laporkan hasil aktual, hasil yang diharapkan, severity, dan prioritas.",
    task: {
      id: "qa-review",
      title: "Validasi formulir login",
      type: "qa",
      instructions:
        "Rancang skenario pengujian login, lalu tuliskan satu contoh bug report yang jelas dan dapat direproduksi.",
    },
  },
  {
    position: "Backend Developer",
    title: "API dan Query SQL",
    instructions:
      "Jelaskan asumsi Anda. Tulis kode dan query sebagai teks; sistem ini tidak mengeksekusi kode maupun SQL.",
    task: {
      id: "api-query",
      title: "Rancang endpoint daftar pesanan",
      type: "code",
      instructions:
        "Tuliskan rancangan endpoint API untuk mengambil pesanan beserta query SQL yang diperlukan. Pertimbangkan validasi dan penanganan kesalahan.",
    },
  },
  {
    position: "Frontend Developer",
    title: "Komponen UI Responsif",
    instructions:
      "Buat prototipe komponen dengan HTML, CSS, dan JavaScript di editor. Jalankan pratinjau browser, lalu jelaskan validasi responsif dan bug yang ditemukan.",
    task: {
      id: "responsive-component",
      title: "Kartu ringkasan responsif",
      type: "code",
      instructions:
        "Buat kartu ringkasan responsif menggunakan HTML, CSS, dan JavaScript. Jalankan pratinjau di halaman ini dan jelaskan cara menguji tampilannya pada ukuran layar berbeda.",
    },
  },
  {
    position: "Data Center Engineer",
    title: "Analisis Insiden Data Center",
    instructions:
      "Nilai risiko operasional, jelaskan urutan pemeriksaan aman, dan tentukan kapan serta kepada siapa insiden harus dieskalasikan.",
    task: {
      id: "datacenter-incident",
      title: "Peringatan suhu dan UPS",
      type: "troubleshooting",
      instructions:
        "Suhu salah satu rak meningkat dan UPS mengirim peringatan. Uraikan prioritas keselamatan, pemeriksaan, mitigasi, dan eskalasi.",
    },
  },
];

const defaultRubric = [
  ["Ketepatan solusi", "Akurasi diagnosis atau solusi teknis.", 35],
  ["Kualitas teknis", "Kualitas implementasi dan pertimbangan risiko.", 30],
  ["Kelengkapan analisis", "Kelengkapan pengujian dan penjelasan.", 20],
  ["Komunikasi", "Kejelasan dokumentasi dan langkah kerja.", 15],
] as const;

const globalForDb = globalThis as typeof globalThis & {
  praktikDb?: DatabaseSync;
};

export function withTransaction<T>(database: DatabaseSync, callback: () => T) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function createDatabase() {
  const dataDirectory = process.env.DATA_DIR
    ? resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR)
    : join(process.cwd(), "data");
  mkdirSync(/*turbopackIgnore: true*/ dataDirectory, { recursive: true });

  const database = new DatabaseSync(
    join(/*turbopackIgnore: true*/ dataDirectory, "praktik-ujian.sqlite"),
  );
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      position TEXT NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
      tasks_json TEXT NOT NULL,
      rubric_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      exam_id TEXT NOT NULL REFERENCES exams(id),
      candidate_name TEXT NOT NULL,
      candidate_email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(exam_id, candidate_email)
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id),
      invitation_id TEXT NOT NULL UNIQUE REFERENCES invitations(id),
      candidate_name TEXT NOT NULL,
      candidate_email TEXT NOT NULL,
      started_at TEXT NOT NULL,
      deadline_at TEXT NOT NULL,
      submitted_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'assessed')),
      answers_json TEXT NOT NULL DEFAULT '{}',
      answers_updated_at TEXT,
      rubric_version INTEGER NOT NULL,
      score REAL,
      assessment_json TEXT NOT NULL DEFAULT '{}',
      assessed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS rubric_criteria (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id),
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      weight REAL NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      task_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE INDEX IF NOT EXISTS idx_rubric_exam_version ON rubric_criteria(exam_id, version);
  `);
  const submissionColumns = database
    .prepare("PRAGMA table_info(submissions)")
    .all() as Array<{ name: string }>;
  if (!submissionColumns.some((column) => column.name === "answers_updated_at")) {
    database.exec("ALTER TABLE submissions ADD COLUMN answers_updated_at TEXT");
  }

  const count = database.prepare("SELECT COUNT(*) AS count FROM exams").get() as {
    count: number;
  };
  if (count.count === 0) {
    const insertExam = database.prepare(`
      INSERT INTO exams (id, position, title, instructions, duration_minutes, status, tasks_json, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `);
    const insertCriterion = database.prepare(`
      INSERT INTO rubric_criteria (id, exam_id, version, name, description, weight, position)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `);
    const seed = () => {
      for (const item of positionSeeds) {
        const examId = randomUUID();
        insertExam.run(
          examId,
          item.position,
          item.title,
          item.instructions,
          60,
          JSON.stringify([item.task]),
          new Date().toISOString(),
        );
        defaultRubric.forEach(([name, description, weight], criterionIndex) => {
          insertCriterion.run(
            randomUUID(),
            examId,
            name,
            description,
            weight,
            criterionIndex,
          );
        });
      }
    };
    withTransaction(database, seed);
  }

  return database;
}

export function getDatabase() {
  if (!globalForDb.praktikDb) globalForDb.praktikDb = createDatabase();
  return globalForDb.praktikDb;
}

export function audit(
  actor: string,
  action: string,
  objectType: string,
  objectId: string,
) {
  getDatabase()
    .prepare(
      "INSERT INTO audit_events (id, actor, action, object_type, object_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), actor, action, objectType, objectId, new Date().toISOString());
}

export function parseTasks(value: string): ExamTask[] {
  return JSON.parse(value) as ExamTask[];
}

export function getRubric(
  examId: string,
  version?: number,
): RubricCriterion[] {
  const database = getDatabase();
  const selectedVersion =
    version ??
    (database
      .prepare("SELECT rubric_version FROM exams WHERE id = ?")
      .get(examId) as { rubric_version: number } | undefined)?.rubric_version;
  if (!selectedVersion) return [];
  return database
    .prepare(
      "SELECT id, name, description, weight, position FROM rubric_criteria WHERE exam_id = ? AND version = ? ORDER BY position",
    )
    .all(examId, selectedVersion) as RubricCriterion[];
}
