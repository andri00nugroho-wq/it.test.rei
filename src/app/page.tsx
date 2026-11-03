"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  type: "code" | "sql" | "qa" | "troubleshooting" | "text";
  instructions: string;
};

type Criterion = {
  id: string;
  name: string;
  description: string;
  weight: number;
  position: number;
};

type Exam = {
  id: string;
  position: string;
  title: string;
  instructions: string;
  duration_minutes: number;
  status: "draft" | "active" | "closed";
  tasks: Task[];
  rubric_version: number;
  invitation_count: number;
  submission_count: number;
  criteria?: Criterion[];
};

type Submission = {
  id: string;
  examId: string;
  examTitle: string;
  position: string;
  candidateName: string;
  candidateEmail: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  status: "in_progress" | "submitted" | "assessed";
  score: number | null;
  focusLossCount: number;
};

type Overview = {
  exams: Exam[];
  submissions: Submission[];
  counts: { candidates: number; inProgress: number; submitted: number; exams: number };
};

type ReviewData = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  examTitle: string;
  position: string;
  answers: Record<string, unknown>;
  tasks: Task[];
  criteria: Criterion[];
  assessment: Record<string, { score: number; comment: string }>;
  attachments: Array<{ id: string; taskId: string; name: string; size: number }>;
  score: number | null;
};

type AssessmentInput = Record<string, { score: string; comment: string }>;
type Section = "ringkasan" | "ujian" | "kandidat" | "rubrik";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Permintaan tidak berhasil. Silakan coba lagi.";
    throw new Error(message);
  }
  return data as T;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function prettyAnswer(value: unknown) {
  if (typeof value === "string") return value || "Belum ada jawaban.";
  if (value === undefined || value === null) return "Belum ada jawaban.";
  return JSON.stringify(value, null, 2);
}

const sectionLabels: Record<Section, string> = {
  ringkasan: "Ringkasan",
  ujian: "Kelola ujian",
  kandidat: "Kandidat",
  rubrik: "Rubrik nilai",
};

export default function Home() {
  const [role, setRole] = useState<"admin" | "candidate" | null>(null);
  const [showLocalCredentials, setShowLocalCredentials] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [section, setSection] = useState<Section>("ringkasan");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [examEditor, setExamEditor] = useState<Exam | "new" | null>(null);
  const [inviteExam, setInviteExam] = useState<Exam | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [review, setReview] = useState<ReviewData | null>(null);
  const [assessment, setAssessment] = useState<AssessmentInput>({});
  const [reviewBusy, setReviewBusy] = useState(false);
  const [rubricExamId, setRubricExamId] = useState("");
  const [rubricDraft, setRubricDraft] = useState<Criterion[]>([]);
  const [rubricBusy, setRubricBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const loadOverview = useCallback(async () => {
    const data = await api<Overview>("/api/admin/overview", { cache: "no-store" });
    setOverview(data);
    setRubricDraft(data.exams.find((exam) => exam.id === rubricExamId)?.criteria ?? []);
    if (!rubricExamId && data.exams[0]) {
      setRubricExamId(data.exams[0].id);
      setRubricDraft(data.exams[0].criteria ?? []);
    }
  }, [rubricExamId]);

  useEffect(() => {
    let active = true;
    api<{ role: "admin" | "candidate" | null; showLocalCredentials: boolean }>(
      "/api/auth/session",
      { cache: "no-store" },
    )
      .then(async (session) => {
        if (!active) return;
        setRole(session.role);
        setShowLocalCredentials(session.showLocalCredentials);
        if (session.showLocalCredentials) {
          setLoginForm({ email: "admin@example.local", password: "admin12345" });
        }
        if (session.role === "admin") {
          await loadOverview();
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Sesi gagal diperiksa.");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadOverview]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredSubmissions = useMemo(() => {
    if (!overview) return [];
    const query = search.trim().toLowerCase();
    return overview.submissions.filter((submission) => {
      const matchesQuery =
        !query ||
        [
          submission.candidateName,
          submission.candidateEmail,
          submission.examTitle,
          submission.position,
        ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || submission.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [overview, search, statusFilter]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoginBusy(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
      setRole("admin");
      setNotice("Berhasil masuk ke dashboard.");
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login gagal.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setRole(null);
    setOverview(null);
    setNotice("Anda telah keluar.");
  }

  async function updateExamStatus(exam: Exam) {
    const nextStatus =
      exam.status === "active" ? "closed" : exam.status === "closed" ? "active" : "active";
    try {
      await api(`/api/admin/exams/${exam.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadOverview();
      setNotice(nextStatus === "active" ? "Ujian berhasil diterbitkan." : "Ujian ditutup.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status ujian gagal diubah.");
    }
  }

  async function openReview(submission: Submission) {
    setReviewId(submission.id);
    setReviewBusy(true);
    setError("");
    try {
      const data = await api<ReviewData>(`/api/admin/submissions/${submission.id}`);
      setReview(data);
      setAssessment(
        Object.fromEntries(
          Object.entries(data.assessment).map(([id, value]) => [
            id,
            { score: String(value.score), comment: value.comment },
          ]),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jawaban gagal dimuat.");
      setReviewId("");
    } finally {
      setReviewBusy(false);
    }
  }

  async function saveAssessment(final: boolean) {
    if (!review) return;
    const values = Object.fromEntries(
      Object.entries(assessment)
        .filter(([, value]) => value.score.trim() !== "")
        .map(([id, value]) => [
          id,
          { score: Number(value.score), comment: value.comment },
        ]),
    );
    try {
      const result = await api<{ score: number | null }>(
        `/api/admin/submissions/${review.id}`,
        { method: "PATCH", body: JSON.stringify({ assessment: values, final }) },
      );
      await loadOverview();
      setNotice(
        final
          ? `Nilai final ${result.score?.toFixed(1)} berhasil disimpan.`
          : "Draf penilaian berhasil disimpan.",
      );
      if (final) {
        setReview(null);
        setReviewId("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Penilaian gagal disimpan.");
    }
  }

  async function saveRubric() {
    if (!rubricExamId) return;
    setRubricBusy(true);
    setError("");
    try {
      await api(`/api/admin/exams/${rubricExamId}`, {
        method: "PATCH",
        body: JSON.stringify({
          criteria: rubricDraft.map(({ name, description, weight }) => ({
            name,
            description,
            weight: Number(weight),
          })),
        }),
      });
      await loadOverview();
      setNotice("Versi rubrik baru berhasil disimpan.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rubrik gagal disimpan.");
    } finally {
      setRubricBusy(false);
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    try {
      const result = await api<{ url: string }>("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({
          examId: inviteExam?.id,
          candidateName: formData.get("candidateName"),
          candidateEmail: formData.get("candidateEmail"),
        }),
      });
      setInviteUrl(result.url);
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Undangan gagal dibuat.");
    }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("Tautan undangan disalin.");
    } catch {
      setError("Tautan tidak dapat disalin. Salin tautan secara manual.");
    }
  }

  if (authLoading) {
    return (
      <main className="loading-screen">
        <div className="spinner" />
        <span>Memuat ruang ujian…</span>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="login-page">
        <div className="login-aside">
          <div className="brand brand-light">
            <Image className="brand-logo" src="/logo-rei.png" alt="REI" width={170} height={52} priority />
          </div>
          <div className="login-message">
            <span className="eyebrow eyebrow-light">REKRUTMEN BERBASIS KOMPETENSI</span>
            <h1>Temukan potensi terbaik, lewat pekerjaan nyata.</h1>
            <p>
              Kelola ujian praktik, pantau progres kandidat, dan nilai dengan rubrik
              yang konsisten dalam satu ruang.
            </p>
            <div className="login-feature"><span>✓</span> Lima rumpun posisi teknis</div>
            <div className="login-feature"><span>✓</span> Jawaban tersimpan dan terlindungi</div>
            <div className="login-feature"><span>✓</span> Penilaian transparan berbasis rubrik</div>
          </div>
          <div className="login-aside-footer">Platform penilaian praktik kandidat</div>
        </div>
        <div className="login-main">
          <form className="login-card" onSubmit={handleLogin}>
            <div className="mobile-brand brand">
              <Image className="brand-logo" src="/logo-rei.png" alt="REI" width={170} height={52} priority />
            </div>
            <span className="eyebrow">PORTAL ADMIN</span>
            <h2>Selamat datang</h2>
            <p className="muted">Masuk untuk mengelola ujian dan hasil kandidat.</p>
            {role === "candidate" && (
              <div className="form-note">
                Sesi ujian kandidat di browser ini tetap terpisah saat Anda masuk sebagai Admin.
              </div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            <label className="field-label" htmlFor="email">Email admin</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
              placeholder="nama@perusahaan.com"
            />
            <label className="field-label" htmlFor="password">Kata sandi</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              placeholder="Masukkan kata sandi"
            />
            {showLocalCredentials && (
              <div className="login-hint">
                Login lokal awal: <strong>admin@example.local</strong> / <strong>admin12345</strong>.
                Ubah melalui <code>.env.local</code> sebelum penggunaan nyata.
              </div>
            )}
            <button className="button button-primary button-wide" disabled={loginBusy}>
              {loginBusy ? "Memeriksa…" : "Masuk ke dashboard"} <span>→</span>
            </button>
            <p className="login-footnote">Akses hanya untuk Admin dan penilai yang berwenang.</p>
          </form>
        </div>
      </main>
    );
  }

  const currentRubricExam = overview?.exams.find((exam) => exam.id === rubricExamId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <Image className="brand-logo" src="/logo-rei.png" alt="REI" width={170} height={52} priority />
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          {(Object.keys(sectionLabels) as Section[]).map((item) => (
            <button
              key={item}
              className={`nav-item ${section === item ? "nav-item-active" : ""}`}
              onClick={() => setSection(item)}
            >
              <span className="nav-icon">
                {item === "ringkasan" ? "◫" : item === "ujian" ? "▤" : item === "kandidat" ? "♙" : "◎"}
              </span>
              {sectionLabels[item]}
              {item === "kandidat" && overview && (
                <span className="nav-count">{overview.counts.candidates}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note"><span>⌑</span><div><strong>Ruang aman</strong><small>Kode kandidat tidak dieksekusi</small></div></div>
          <button className="profile-button" onClick={logout}>
            <span className="avatar">A</span>
            <span className="profile-copy"><strong>Administrator</strong><small>Admin · Keluar</small></span>
            <span className="profile-menu">↗</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{sectionLabels[section]}</strong></div>
          <div className="topbar-right">
            <span className="today-label">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())}</span>
            <span className="topbar-avatar">A</span>
          </div>
        </header>

        <div className="page-wrap">
          {error && (
            <div className="toast toast-error" role="alert">
              <span>{error}</span><button aria-label="Tutup" onClick={() => setError("")}>×</button>
            </div>
          )}
          {notice && <div className="toast toast-success" role="status">{notice}</div>}

          <div className="page-heading">
            <div>
              <span className="eyebrow">PORTAL ADMIN</span>
              <h1>{section === "ringkasan" ? "Selamat pagi, Admin" : sectionLabels[section]}</h1>
              <p>
                {section === "ringkasan"
                  ? "Pantau ujian praktik dan progres kandidat dari satu tempat."
                  : section === "ujian"
                    ? "Susun skenario dan kelola akses ujian praktik."
                    : section === "kandidat"
                      ? "Tinjau progres dan hasil pengerjaan kandidat."
                      : "Atur kriteria penilaian sesuai kebutuhan posisi."}
              </p>
            </div>
            <button className="button button-primary" onClick={() => setExamEditor("new")}>
              <span className="button-plus">＋</span> Buat ujian
            </button>
          </div>

          {!overview ? (
            <div className="panel loading-panel"><div className="spinner" /> Memuat data dashboard…</div>
          ) : (
            <>
              {(section === "ringkasan" || section === "kandidat") && (
                <>
                  <section className="stats-grid">
                    <StatCard label="Total ujian" value={overview.counts.exams} icon="▤" tone="blue" detail="Semua posisi" />
                    <StatCard label="Kandidat terdaftar" value={overview.counts.candidates} icon="♙" tone="violet" detail="Sudah memulai ujian" />
                    <StatCard label="Sedang mengerjakan" value={overview.counts.inProgress} icon="◷" tone="amber" detail="Ujian masih berlangsung" />
                    <StatCard label="Menunggu penilaian" value={overview.submissions.filter((item) => item.status === "submitted").length} icon="✓" tone="green" detail="Jawaban sudah dikirim" />
                  </section>

                  <section className="panel submissions-panel">
                    <div className="panel-heading">
                      <div><h2>{section === "kandidat" ? "Daftar kandidat" : "Aktivitas kandidat"}</h2><p>Pengumpulan terbaru dari seluruh ujian</p></div>
                      <div className="table-actions">
                        <div className="search-box"><span>⌕</span><input aria-label="Cari kandidat" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kandidat…" /></div>
                        <select aria-label="Filter status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                          <option value="all">Semua status</option>
                          <option value="in_progress">Sedang dikerjakan</option>
                          <option value="submitted">Menunggu penilaian</option>
                          <option value="assessed">Selesai dinilai</option>
                        </select>
                      </div>
                    </div>
                    {filteredSubmissions.length === 0 ? (
                      <EmptyState title="Belum ada pengumpulan" text="Kandidat akan muncul di sini setelah memulai ujian." />
                    ) : (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>KANDIDAT</th><th>POSISI / UJIAN</th><th>WAKTU KIRIM</th><th>STATUS</th><th>NILAI</th><th /></tr></thead>
                          <tbody>{filteredSubmissions.map((submission) => (
                            <tr key={submission.id}>
                              <td><div className="candidate-cell"><span className="candidate-avatar">{submission.candidateName.slice(0, 1).toUpperCase()}</span><div><strong>{submission.candidateName}</strong><small>{submission.candidateEmail}</small></div></div></td>
                              <td><strong className="table-primary">{submission.position}</strong><small className="table-secondary">{submission.examTitle}</small></td>
                              <td>{formatDate(submission.submittedAt)}</td>
                              <td><StatusBadge status={submission.status} />{submission.focusLossCount > 0 && <small className="focus-loss-count">Pindah tab: {submission.focusLossCount}×</small>}</td>
                              <td>{submission.score === null ? <span className="score-empty">—</span> : <strong>{submission.score.toFixed(1)}<small className="score-max"> / 100</small></strong>}</td>
                              <td><button className="button button-small button-outline" onClick={() => openReview(submission)}>{submission.status === "in_progress" ? "Lihat" : submission.status === "assessed" ? "Hasil" : "Nilai"} <span>→</span></button></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}

              {(section === "ringkasan" || section === "ujian") && (
                <section className="exams-section">
                  <div className="section-title-row"><div><h2>Ujian berdasarkan posisi</h2><p>Kelola ujian dan undang kandidat</p></div><button className="text-button" onClick={() => setSection("ujian")}>Lihat semua <span>→</span></button></div>
                  <div className="exam-grid">
                    {overview.exams.map((exam) => (
                      <article className="exam-card" key={exam.id}>
                        <div className="exam-card-top">
                          <span className={`position-icon position-${positionTone(exam.position)}`}>{positionInitial(exam.position)}</span>
                          <StatusBadge status={exam.status} />
                        </div>
                        <span className="exam-position">{exam.position}</span>
                        <h3>{exam.title}</h3>
                        <div className="exam-meta"><span>◷ &nbsp;{exam.duration_minutes} menit</span><span>▤ &nbsp;{exam.tasks.length} tugas</span></div>
                        <div className="exam-card-foot">
                          <span><strong>{exam.submission_count}</strong> pengumpulan <span className="dot">·</span> <strong>{exam.invitation_count}</strong> undangan</span>
                          <div className="card-actions">
                            <button
                              className="button button-small button-outline"
                              disabled={exam.submission_count > 0}
                              title={exam.submission_count > 0 ? "Ujian terkunci setelah kandidat mulai" : "Edit ujian dan tugas"}
                              onClick={() => setExamEditor(exam)}
                            >
                              Edit
                            </button>
                            <button className="icon-button" title="Atur rubrik" aria-label="Atur rubrik" onClick={() => { setSection("rubrik"); setRubricExamId(exam.id); setRubricDraft(exam.criteria ?? []); }}>◎</button>
                            <button className="icon-button" title={exam.status === "active" ? "Tutup ujian" : "Terbitkan ujian"} aria-label={exam.status === "active" ? "Tutup ujian" : "Terbitkan ujian"} onClick={() => updateExamStatus(exam)}>{exam.status === "active" ? "Ⅱ" : "↑"}</button>
                            <button className="button button-small button-outline" disabled={exam.status !== "active"} onClick={() => { setInviteExam(exam); setInviteUrl(""); }}>Undang <span>＋</span></button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {section === "rubrik" && (
                <section className="panel rubric-panel">
                  <div className="panel-heading rubric-heading">
                    <div><h2>Rubrik penilaian</h2><p>Bobot disimpan sebagai versi baru agar penilaian lama tetap konsisten.</p></div>
                    <select aria-label="Pilih ujian" value={rubricExamId} onChange={(event) => {
                      const exam = overview.exams.find((item) => item.id === event.target.value);
                      setRubricExamId(event.target.value);
                      setRubricDraft(exam?.criteria ?? []);
                    }}>
                      {overview.exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.position} — {exam.title}</option>)}
                    </select>
                  </div>
                  {currentRubricExam && <div className="rubric-version">Versi aktif: {currentRubricExam.rubric_version} <span>·</span> Nilai diberikan pada skala 0–5, bobot total 100%.</div>}
                  <div className="rubric-list">
                    {rubricDraft.map((criterion, index) => (
                      <div className="rubric-row" key={criterion.id || index}>
                        <div className="rubric-order">{String(index + 1).padStart(2, "0")}</div>
                        <label className="rubric-name"><span>Nama kriteria</span><input value={criterion.name} onChange={(event) => setRubricDraft(rubricDraft.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
                        <label className="rubric-description"><span>Deskripsi</span><input value={criterion.description} onChange={(event) => setRubricDraft(rubricDraft.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /></label>
                        <label className="rubric-weight"><span>Bobot %</span><input type="number" min="1" max="100" value={criterion.weight} onChange={(event) => setRubricDraft(rubricDraft.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(event.target.value) } : item))} /></label>
                        <button className="icon-button remove-button" aria-label="Hapus kriteria" disabled={rubricDraft.length < 2} onClick={() => setRubricDraft(rubricDraft.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className="rubric-footer">
                    <button className="button button-outline" disabled={rubricDraft.length >= 12} onClick={() => setRubricDraft([...rubricDraft, { id: "", name: "", description: "", weight: 1, position: rubricDraft.length }])}>＋ Tambah kriteria</button>
                    <div className="rubric-total">Total bobot <strong className={rubricDraft.reduce((total, item) => total + Number(item.weight), 0) === 100 ? "weight-valid" : "weight-invalid"}>{rubricDraft.reduce((total, item) => total + Number(item.weight), 0)}%</strong><button className="button button-primary" disabled={rubricBusy} onClick={saveRubric}>{rubricBusy ? "Menyimpan…" : "Simpan rubrik"}</button></div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {examEditor && (
        <ExamModal
          initialExam={examEditor === "new" ? undefined : examEditor}
          onClose={() => setExamEditor(null)}
          onSaved={async (isEdit) => {
            setExamEditor(null);
            await loadOverview();
            setSection("ujian");
            setNotice(isEdit ? "Ujian dan daftar tugas berhasil diperbarui." : "Ujian baru dibuat sebagai draf.");
          }}
          onError={setError}
        />
      )}
      {inviteExam && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setInviteExam(null); setInviteUrl(""); } }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="invite-title">
            <button className="modal-close" aria-label="Tutup" onClick={() => { setInviteExam(null); setInviteUrl(""); }}>×</button>
            <span className="eyebrow">UNDANG KANDIDAT</span><h2 id="invite-title">{inviteUrl ? "Tautan undangan siap" : "Kirim undangan ujian"}</h2>
            <p className="muted">{inviteExam.position} · {inviteExam.title}</p>
            {inviteUrl ? (
              <div className="invite-result"><div className="invite-warning">Tautan ini hanya ditampilkan sekali. Salin dan kirim kepada kandidat. Tautan berlaku selama 2 hari.</div><input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} /><button className="button button-primary button-wide" onClick={copyInvitation}>Salin tautan undangan</button></div>
            ) : (
              <form className="form-stack" onSubmit={createInvitation}>
                <label className="field-label" htmlFor="candidate-name">Nama kandidat</label><input id="candidate-name" name="candidateName" required maxLength={120} placeholder="Nama lengkap" />
                <label className="field-label" htmlFor="candidate-email">Email kandidat</label><input id="candidate-email" name="candidateEmail" type="email" required maxLength={254} placeholder="kandidat@email.com" />
                <div className="form-note">Undangan berlaku 2 hari dan hanya dapat digunakan satu kandidat.</div>
                <button className="button button-primary button-wide">Buat tautan undangan</button>
              </form>
            )}
          </section>
        </div>
      )}
      {reviewId && (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setReviewId(""); setReview(null); } }}>
          <section className="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <div className="drawer-top"><div><span className="eyebrow">PENILAIAN KANDIDAT</span><h2 id="review-title">{review?.candidateName ?? "Memuat jawaban…"}</h2><p>{review?.position} · {review?.candidateEmail}</p></div><button className="modal-close static-close" aria-label="Tutup" onClick={() => { setReviewId(""); setReview(null); }}>×</button></div>
            {reviewBusy || !review ? <div className="drawer-loading"><div className="spinner" /> Memuat jawaban kandidat…</div> : (
              <>
                <div className="review-scroll">
                  <div className="review-info"><span>Status <StatusBadge status={review.status} /></span><span>Nilai final <strong>{review.score === null ? "Belum dinilai" : `${review.score.toFixed(1)} / 100`}</strong></span></div>
                  {review.tasks.map((task) => (
                    <article className="answer-card" key={task.id}>
                      <div className="answer-title"><div><span className="eyebrow">JAWABAN KANDIDAT</span><h3>{task.title}</h3></div><span className="task-type">{task.type}</span></div>
                      <pre className="answer-content">{prettyAnswer(review.answers[task.id])}</pre>
                      {review.attachments.filter((file) => file.taskId === task.id).map((file) => <a className="attachment-link" key={file.id} href={`/api/attachments/${file.id}`}>↧ &nbsp;{file.name} <small>({Math.ceil(file.size / 1024)} KB)</small></a>)}
                    </article>
                  ))}
                  <div className="assessment-heading"><span className="eyebrow">RUBRIK PENILAIAN</span><p>Isi skor 0–5 untuk setiap kriteria.</p></div>
                  {review.criteria.map((criterion) => (
                    <article className="criterion-card" key={criterion.id}>
                      <div className="criterion-title"><div><strong>{criterion.name}</strong><p>{criterion.description}</p></div><span>{criterion.weight}%</span></div>
                      <label className="field-label" htmlFor={`score-${criterion.id}`}>Skor <small>(0–5)</small></label>
                      <input id={`score-${criterion.id}`} className="score-input" type="number" min="0" max="5" step="0.5" value={assessment[criterion.id]?.score ?? ""} onChange={(event) => setAssessment({ ...assessment, [criterion.id]: { score: event.target.value, comment: assessment[criterion.id]?.comment ?? "" } })} placeholder="Belum dinilai" />
                      <label className="field-label" htmlFor={`comment-${criterion.id}`}>Catatan penilai</label>
                      <textarea id={`comment-${criterion.id}`} rows={2} value={assessment[criterion.id]?.comment ?? ""} onChange={(event) => setAssessment({ ...assessment, [criterion.id]: { score: assessment[criterion.id]?.score ?? "", comment: event.target.value } })} placeholder="Catatan singkat untuk kriteria ini…" />
                    </article>
                  ))}
                </div>
                <div className="drawer-footer"><button className="button button-outline" onClick={() => saveAssessment(false)}>Simpan draf</button><button className="button button-primary" onClick={() => saveAssessment(true)}>Finalisasi nilai <span>→</span></button></div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, tone, detail }: { label: string; value: number; icon: string; tone: string; detail: string }) {
  return <article className="stat-card"><div className={`stat-icon stat-${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value.toLocaleString("id-ID")}</strong><span className="stat-detail">{detail}</span></article>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: "Draf",
    active: "Aktif",
    closed: "Ditutup",
    in_progress: "Mengerjakan",
    submitted: "Perlu dinilai",
    assessed: "Selesai dinilai",
  };
  return <span className={`status-badge status-${status}`}>{labels[status] ?? status}</span>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon">▤</div><strong>{title}</strong><p>{text}</p></div>;
}

function isTaskType(value: string): value is Task["type"] {
  return (
    value === "code" ||
    value === "sql" ||
    value === "qa" ||
    value === "troubleshooting" ||
    value === "text"
  );
}

function positionInitial(position: string) {
  return position === "Data Center Engineer" ? "DC" : position.split(" ").map((word) => word[0]).slice(0, 2).join("");
}

function positionTone(position: string) {
  if (position.includes("Support")) return "blue";
  if (position.includes("QA")) return "orange";
  if (position.includes("Backend")) return "purple";
  if (position.includes("Frontend")) return "green";
  return "teal";
}

function ExamModal({
  initialExam,
  onClose,
  onSaved,
  onError,
}: {
  initialExam?: Exam;
  onClose: () => void;
  onSaved: (isEdit: boolean) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Array<Omit<Task, "id">>>(() =>
    initialExam
      ? initialExam.tasks.map(({ title, type, instructions }) => ({ title, type, instructions }))
      : [{ title: "", type: "text", instructions: "" }],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(initialExam ? `/api/admin/exams/${initialExam.id}` : "/api/admin/overview", {
        method: initialExam ? "PATCH" : "POST",
        body: JSON.stringify({
          position: form.get("position"),
          title: form.get("title"),
          instructions: form.get("instructions"),
          durationMinutes: Number(form.get("durationMinutes")),
          tasks,
        }),
      });
      await onSaved(Boolean(initialExam));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Ujian gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }
  function updateTask(index: number, patch: Partial<Omit<Task, "id">>) {
    setTasks((current) =>
      current.map((task, taskIndex) =>
        taskIndex === index ? { ...task, ...patch } : task,
      ),
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="edit-exam-title">
        <button className="modal-close" aria-label="Tutup" onClick={onClose}>×</button>
        <span className="eyebrow">{initialExam ? "KELOLA UJIAN" : "UJIAN BARU"}</span>
        <h2 id="edit-exam-title">{initialExam ? "Edit ujian dan tugas" : "Buat ujian praktik"}</h2>
        <p className="muted">
          {initialExam
            ? "Perubahan berlaku untuk undangan yang belum dimulai. Ujian terkunci setelah kandidat mulai."
            : "Ujian baru dibuat sebagai draf. Terbitkan sebelum mengundang kandidat."}
        </p>
        <form className="form-stack" onSubmit={submit}>
          <div className="form-two-col">
            <div><label className="field-label" htmlFor="exam-position">Posisi</label><input id="exam-position" name="position" required maxLength={100} defaultValue={initialExam?.position} placeholder="Contoh: DevOps Engineer" /></div>
            <div><label className="field-label" htmlFor="exam-duration">Durasi (menit)</label><input id="exam-duration" name="durationMinutes" type="number" min="5" max="480" defaultValue={initialExam?.duration_minutes ?? 60} required /></div>
          </div>
          <label className="field-label" htmlFor="exam-title">Nama ujian</label><input id="exam-title" name="title" required maxLength={160} defaultValue={initialExam?.title} placeholder="Contoh: Simulasi insiden produksi" />
          <label className="field-label" htmlFor="exam-instructions">Instruksi kandidat</label><textarea id="exam-instructions" name="instructions" rows={3} required maxLength={3000} defaultValue={initialExam?.instructions} placeholder="Aturan dan konteks ujian…" />
          <div className="form-divider"><span>DAFTAR TUGAS</span></div>
          <div className="exam-task-editor-list">
            {tasks.map((task, index) => (
              <fieldset className="exam-task-editor" key={index}>
                <div className="exam-task-editor-heading">
                  <strong>Tugas {String(index + 1).padStart(2, "0")}</strong>
                  <button type="button" className="text-button" disabled={tasks.length <= 1} onClick={() => setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))}>Hapus</button>
                </div>
                <div className="form-two-col">
                  <div><label className="field-label" htmlFor={`task-title-${index}`}>Nama tugas</label><input id={`task-title-${index}`} required maxLength={160} value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} placeholder="Judul tugas" /></div>
                  <div><label className="field-label" htmlFor={`task-type-${index}`}>Jenis editor</label><select id={`task-type-${index}`} value={task.type} onChange={(event) => { if (isTaskType(event.target.value)) updateTask(index, { type: event.target.value }); }}><option value="text">Jawaban teks</option><option value="code">Editor kode</option><option value="sql">Editor SQL</option><option value="qa">Test case / bug report</option><option value="troubleshooting">Troubleshooting</option></select></div>
                </div>
                <label className="field-label" htmlFor={`task-instructions-${index}`}>Deskripsi tugas</label><textarea id={`task-instructions-${index}`} rows={3} required maxLength={3000} value={task.instructions} onChange={(event) => updateTask(index, { instructions: event.target.value })} placeholder="Jelaskan skenario dan keluaran yang diminta…" />
              </fieldset>
            ))}
          </div>
          <button type="button" className="button button-outline add-task-button" disabled={tasks.length >= 30} onClick={() => setTasks((current) => [...current, { title: "", type: "text", instructions: "" }])}>＋ Tambah tugas</button>
          <div className="form-note">Jawaban kode dan SQL disimpan sebagai teks; runner terisolasi belum tersedia.</div>
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Batal</button><button className="button button-primary" disabled={busy}>{busy ? "Menyimpan…" : initialExam ? "Simpan perubahan" : "Simpan sebagai draf"}</button></div>
        </form>
      </section>
    </div>
  );
}
