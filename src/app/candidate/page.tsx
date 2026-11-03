"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  type: "code" | "sql" | "qa" | "troubleshooting" | "text";
  instructions: string;
};

type Attachment = { id: string; taskId: string; name: string; size: number };
type CandidateData = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  status: "in_progress" | "submitted" | "assessed";
  answers: Record<string, unknown>;
  answersUpdatedAt: string | null;
  focusLossCount: number;
  position: string;
  title: string;
  instructions: string;
  durationMinutes: number;
  tasks: Task[];
  attachments: Attachment[];
  serverNow: string;
};

type LocalDraft = {
  baseRevision: string | null;
  savedAt: string;
  answers: Record<string, unknown>;
};

const codeLanguages = [
  "JavaScript",
  "TypeScript",
  "Python",
  "PHP",
  "Java",
  "Kotlin",
  "Swift",
  "C",
  "C++",
  "C#",
  "Go",
  "Rust",
  "Ruby",
  "Dart (Flutter)",
  "Scala",
  "Elixir",
  "Erlang",
  "Haskell",
  "OCaml",
  "Perl",
  "Lua",
  "R",
  "Julia",
  "MATLAB",
  "SQL (PostgreSQL)",
  "Bash",
  "PowerShell",
] as const;
const frontendLanguage = "HTML/CSS/JavaScript";

async function getError(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return "Permintaan tidak berhasil. Periksa koneksi dan coba lagi.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hasAnswer(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  return (
    isRecord(value) &&
    Object.values(value).some(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    )
  );
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 3600)).padStart(2, "0")}:${String(
    Math.floor((safe % 3600) / 60),
  ).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function createFrontendPreview(html: string, css: string, javascript: string) {
  const safeJavaScript = javascript.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'">
<style>${css}</style>
</head>
<body>${html}<script>${safeJavaScript}</script></body>
</html>`;
}

export default function CandidatePage() {
  const [data, setData] = useState<CandidateData | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [activeTask, setActiveTask] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [saveState, setSaveState] = useState<"loading" | "saved" | "saving" | "offline" | "conflict" | "error">("loading");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [uploadingTask, setUploadingTask] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [focusLossCount, setFocusLossCount] = useState(0);
  const [conflictDraft, setConflictDraft] = useState("");
  const answersRef = useRef<Record<string, unknown>>({});
  const revisionRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const clockOffsetRef = useRef(0);
  const submitBusyRef = useRef(false);
  const localDraftKey = useRef("");

  const loadCandidate = useCallback(async () => {
    const response = await fetch("/api/candidate/me", { cache: "no-store" });
    if (!response.ok) throw new Error(await getError(response));
    const result = (await response.json()) as CandidateData;
    setError("");
    setData(result);
    setFocusLossCount(result.focusLossCount);
    const offset = new Date(result.serverNow).getTime() - Date.now();
    clockOffsetRef.current = offset;
    revisionRef.current = result.answersUpdatedAt;
    localDraftKey.current = `praktik-draft-${result.id}`;
    const serverAnswers = result.answers ?? {};
    let restored = serverAnswers;
    let hasLocalChanges = false;
    let hasConflict = false;
    try {
      const rawDraft = localStorage.getItem(localDraftKey.current);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as LocalDraft;
        if (draft.baseRevision === result.answersUpdatedAt) {
          restored = draft.answers;
          hasLocalChanges =
            JSON.stringify(draft.answers) !== JSON.stringify(serverAnswers);
        } else if (draft.savedAt && JSON.stringify(draft.answers) !== JSON.stringify(serverAnswers)) {
          hasConflict = true;
          setConflictDraft(JSON.stringify(draft.answers, null, 2));
        }
      }
    } catch (cause) {
      console.error("Draf lokal tidak dapat dibaca.", cause);
      setError("Draf lokal tidak dapat dibaca. Jawaban dari server tetap tersedia.");
    }
    answersRef.current = restored;
    setAnswers(restored);
    versionRef.current = hasLocalChanges ? 1 : 0;
    savedVersionRef.current = 0;
    if (hasConflict) {
      setSaveState("conflict");
      setError("Draf di perangkat berbeda dari jawaban server. Salin atau simpan draf lokal sebelum memuat ulang.");
    } else {
      setSaveState(hasLocalChanges ? "saving" : "saved");
    }
    setSecondsLeft(
      Math.max(
        0,
        Math.floor(
          (new Date(result.deadlineAt).getTime() - (Date.now() + offset)) / 1000,
        ),
      ),
    );
  }, []);

  useEffect(() => {
    let active = true;
    const loading = window.setTimeout(() => {
      loadCandidate().catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Ujian gagal dimuat.");
          setSaveState("error");
        }
      });
    }, 0);
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      setSaveState("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const onlineCheck = window.setTimeout(() => setOnline(navigator.onLine), 0);
    return () => {
      active = false;
      window.clearTimeout(loading);
      window.clearTimeout(onlineCheck);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadCandidate]);

  useEffect(() => {
    if (!data || data.status !== "in_progress") return;
    let tabWasHidden = document.visibilityState === "hidden";
    const recordFocusLoss = () => {
      if (tabWasHidden) return;
      tabWasHidden = true;
      setFocusLossCount((count) => count + 1);
      setNotice("Perpindahan dari halaman ujian terdeteksi dan dicatat.");
      void fetch("/api/candidate/attention", {
        method: "POST",
        keepalive: true,
      }).then(async (response) => {
        if (!response.ok) throw new Error(await getError(response));
      }).catch((cause: unknown) => {
        setError(cause instanceof Error
          ? `Pencatatan perpindahan tab gagal: ${cause.message}`
          : "Pencatatan perpindahan tab gagal.");
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordFocusLoss();
        return;
      }
      tabWasHidden = false;
    };
    const handlePageHide = () => recordFocusLoss();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [data]);

  const saveLatest = useCallback(async (): Promise<void> => {
    if (!data || data.status !== "in_progress" || saveState === "conflict") return;
    if (!navigator.onLine) {
      setSaveState("offline");
      if (savedVersionRef.current < versionRef.current) {
        throw new Error("Koneksi terputus. Draf tersimpan di perangkat, tetapi belum tersinkron.");
      }
      return;
    }
    if (savePromiseRef.current) {
      await savePromiseRef.current;
      if (savedVersionRef.current < versionRef.current) return saveLatest();
      return;
    }

    const versionAtStart = versionRef.current;
    const snapshot = answersRef.current;
    const operation = (async () => {
      setSaveState("saving");
      const response = await fetch("/api/candidate/answers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: snapshot, baseRevision: revisionRef.current }),
      });
      if (!response.ok) {
        const message = await getError(response);
        if (response.status === 409) setSaveState("conflict");
        else if (!navigator.onLine) setSaveState("offline");
        else setSaveState("error");
        setError(message);
        throw new Error(message);
      }
      const result = (await response.json()) as { savedAt: string };
      revisionRef.current = result.savedAt;
      savedVersionRef.current = versionAtStart;
      try {
        localStorage.setItem(
          localDraftKey.current,
          JSON.stringify({
            baseRevision: result.savedAt,
            savedAt: new Date().toISOString(),
            answers: snapshot,
          } satisfies LocalDraft),
        );
      } catch (cause) {
        console.error("Draf tidak dapat disimpan di perangkat.", cause);
      }
      setSaveState("saved");
      setError("");
    })();
    savePromiseRef.current = operation;
    try {
      await operation;
    } finally {
      savePromiseRef.current = null;
    }
    if (savedVersionRef.current < versionRef.current) return saveLatest();
  }, [data, saveState]);

  useEffect(() => {
    if (
      !data ||
      data.status !== "in_progress" ||
      versionRef.current === 0 ||
      savedVersionRef.current >= versionRef.current
    ) return;
    const timeout = window.setTimeout(() => {
      saveLatest().catch(() => {});
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [answers, data, online, saveLatest]);

  useEffect(() => {
    if (!data || data.status !== "in_progress") return;
    const updateClock = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (new Date(data.deadlineAt).getTime() -
            (Date.now() + clockOffsetRef.current)) /
            1000,
        ),
      );
      setSecondsLeft(remaining);
      if (remaining === 0 && !submitBusyRef.current) {
        submitBusyRef.current = true;
        setSubmitBusy(true);
        saveLatest()
          .then(() => sendSubmission())
          .catch(() => {
            setError("Waktu habis. Jawaban yang telah tersimpan akan dikunci.");
            sendSubmission().catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : "Pengiriman otomatis gagal.");
            });
          })
          .finally(() => {
            submitBusyRef.current = false;
            setSubmitBusy(false);
          });
      }
    };
    const interval = window.setInterval(updateClock, 1000);
    updateClock();
    return () => window.clearInterval(interval);
  }, [data, saveLatest]);

  function updateAnswer(taskId: string, value: unknown) {
    const next = { ...answersRef.current, [taskId]: value };
    answersRef.current = next;
    versionRef.current += 1;
    setAnswers(next);
    setSaveState(navigator.onLine ? "saving" : "offline");
    try {
      localStorage.setItem(
        localDraftKey.current,
        JSON.stringify({
          baseRevision: revisionRef.current,
          savedAt: new Date().toISOString(),
          answers: next,
        } satisfies LocalDraft),
      );
    } catch (cause) {
      console.error("Draf tidak dapat disimpan di perangkat.", cause);
      setError("Penyimpanan draf lokal gagal. Periksa ruang penyimpanan perangkat.");
    }
  }

  async function sendSubmission() {
    const response = await fetch("/api/candidate/submit", { method: "POST" });
    if (!response.ok) throw new Error(await getError(response));
    const result = (await response.json()) as { submittedAt: string };
    setData((current) =>
      current ? { ...current, status: "submitted", submittedAt: result.submittedAt } : current,
    );
    setShowSubmitConfirm(false);
    setNotice("Jawaban berhasil dikirim.");
  }

  async function submitExam() {
    if (submitBusyRef.current || !data || data.status !== "in_progress") return;
    if (!window.confirm("Kirim jawaban sekarang? Jawaban tidak dapat diubah setelah dikirim.")) return;
    submitBusyRef.current = true;
    setSubmitBusy(true);
    try {
      await saveLatest();
      await sendSubmission();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jawaban gagal dikirim.");
    } finally {
      submitBusyRef.current = false;
      setSubmitBusy(false);
    }
  }

  async function uploadFile(taskId: string, file?: File) {
    if (!file) return;
    setUploadingTask(taskId);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("taskId", taskId);
      const response = await fetch("/api/candidate/upload", { method: "POST", body: form });
      if (!response.ok) throw new Error(await getError(response));
      const result = (await response.json()) as Attachment;
      setData((current) =>
        current ? { ...current, attachments: [...current.attachments, result] } : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Berkas gagal diunggah.");
    } finally {
      setUploadingTask("");
    }
  }

  const task = data?.tasks[activeTask];
  const currentAnswer = task ? answers[task.id] : undefined;
  if (!data) {
    return (
      <main className="candidate-loading">
        <div className="spinner" />
        <p>{error || "Memuat ujian…"}</p>
        {error && <Link className="button button-outline" href="/">Kembali ke portal</Link>}
      </main>
    );
  }

  if (data.status !== "in_progress") {
    return (
      <main className="candidate-loading">
        <div className="submitted-check">✓</div>
        <span className="eyebrow">UJIAN SELESAI</span>
        <h1>Jawaban Anda sudah diterima.</h1>
        <p>Pengumpulan untuk <strong>{data.title}</strong> telah dikunci pada {data.submittedAt ? new Date(data.submittedAt).toLocaleString("id-ID") : "waktu yang tercatat"}.</p>
        <p className="muted">Terima kasih telah mengikuti ujian praktik ini.</p>
      </main>
    );
  }

  const completedTasks = data.tasks.filter((item) => hasAnswer(answers[item.id])).length;
  const timedOut = secondsLeft === 0;

  return (
    <main className="candidate-app">
      <header className="candidate-topbar">
        <Link className="brand" href="/candidate"><Image className="brand-logo" src="/logo-rei.png" alt="REI" width={145} height={45} priority /></Link>
        <div className="candidate-topbar-right">
          <span className={`save-indicator save-${saveState}`}><i />{saveState === "saved" ? "Tersimpan" : saveState === "saving" ? "Menyimpan…" : saveState === "offline" ? "Offline · draf lokal" : saveState === "conflict" ? "Konflik draf" : saveState === "loading" ? "Memuat…" : "Belum tersimpan"}</span>
          <span className="candidate-name">{data.candidateName}</span>
          <Link className="candidate-admin-link" href="/">Portal Admin</Link>
          <button className="candidate-avatar">{data.candidateName.slice(0, 1).toUpperCase()}</button>
        </div>
      </header>

      <div className="candidate-layout">
        <aside className="candidate-rail">
          <div className={`timer-card ${secondsLeft < 300 ? "timer-warning" : ""}`}>
            <span className="timer-label">SISA WAKTU</span>
            <strong>{formatTime(secondsLeft)}</strong>
            <span>Timer mengikuti waktu server</span>
          </div>
          <div className="candidate-exam-info">
            <span className="eyebrow">UJIAN PRAKTIK</span>
            <h1>{data.title}</h1>
            <span className="candidate-position">{data.position}</span>
            <div className="candidate-divider" />
            <p>{data.instructions}</p>
          </div>
          <div className="task-nav-heading"><span>TUGAS</span><span>{completedTasks}/{data.tasks.length} terisi</span></div>
          <div className="candidate-task-list">
            {data.tasks.map((item, index) => {
              const isComplete = hasAnswer(answers[item.id]);
              return (
                <button className={`candidate-task-nav ${index === activeTask ? "candidate-task-active" : ""}`} key={item.id} onClick={() => setActiveTask(index)}>
                  <span className={`task-number ${isComplete ? "task-number-done" : ""}`}>{isComplete ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <span>{item.title}</span>
                </button>
              );
            })}
          </div>
          <div className="candidate-rail-note">Jawaban disimpan otomatis saat Anda online. Hindari menutup halaman sebelum pengiriman.</div>
        </aside>

        <section className="candidate-workspace">
          <div className="candidate-workspace-top">
            <div><span className="eyebrow">TUGAS {String(activeTask + 1).padStart(2, "0")} DARI {String(data.tasks.length).padStart(2, "0")}</span><h2>{task?.title}</h2></div>
            <div className="task-progress"><span style={{ width: `${((activeTask + 1) / data.tasks.length) * 100}%` }} /></div>
          </div>
          {error && <div className="candidate-alert" role="alert"><span>{error}</span><button aria-label="Tutup" onClick={() => setError("")}>×</button></div>}
          <div className="focus-monitor-notice" role="status">
            Perpindahan tab terdeteksi: {focusLossCount}. Aktivitas ini dicatat untuk peninjauan Admin.
          </div>
          {saveState === "conflict" && (
            <div className="candidate-alert alert-conflict">
              <span>
                Draf lokal berbeda dari versi server. Jawaban di layar tidak disimpan agar perubahan tidak tertimpa.
                <details><summary>Lihat draf lokal untuk disalin</summary><pre>{conflictDraft}</pre></details>
              </span>
            </div>
          )}
          {task && (
            <article className="task-panel">
              <div className="task-instructions"><span className="instruction-icon">i</span><p>{task.instructions}</p></div>
              <AnswerEditor
                task={task}
                position={data.position}
                value={currentAnswer}
                disabled={timedOut || saveState === "conflict" || submitBusy}
                onChange={(value) => updateAnswer(task.id, value)}
              />
              <div className="upload-row">
                <label className={`upload-button ${uploadingTask === task.id ? "upload-disabled" : ""}`}>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv" disabled={Boolean(uploadingTask) || timedOut} onChange={(event) => {
                    void uploadFile(task.id, event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }} />
                  <span>{uploadingTask === task.id ? "Mengunggah…" : "＋ Unggah hasil atau screenshot"}</span>
                </label>
                <span className="upload-note">PDF, PNG, JPG, TXT, CSV · Maks. 5 MB</span>
              </div>
              {data.attachments.filter((file) => file.taskId === task.id).map((file) => (
                <div className="candidate-attachment" key={file.id}><span>▧</span><a href={`/api/attachments/${file.id}`}>{file.name}</a><small>{Math.ceil(file.size / 1024)} KB</small></div>
              ))}
            </article>
          )}
          <footer className="candidate-workspace-footer">
            <button className="button button-outline" disabled={activeTask === 0} onClick={() => setActiveTask(Math.max(0, activeTask - 1))}>← Tugas sebelumnya</button>
            <div className="candidate-footer-right">
              <span className="save-status-text">{online ? saveState === "saved" ? "Semua perubahan tersimpan" : saveState === "saving" ? "Menyimpan jawaban…" : "Menunggu sinkronisasi" : "Koneksi terputus"}</span>
              {activeTask < data.tasks.length - 1
                ? <button className="button button-primary" onClick={() => setActiveTask(activeTask + 1)}>Tugas berikutnya <span>→</span></button>
                : <button className="button button-primary" disabled={submitBusy || timedOut || saveState === "conflict"} onClick={() => setShowSubmitConfirm(true)}>Kirim jawaban <span>→</span></button>}
            </div>
          </footer>
        </section>
      </div>

      {showSubmitConfirm && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSubmitConfirm(false); }}>
          <section className="modal-card submit-confirm-card" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <div className="entry-icon">✓</div>
            <h2 id="submit-title">Kirim jawaban ujian?</h2>
            <p className="muted">Anda telah mengisi {completedTasks} dari {data.tasks.length} tugas. Setelah dikirim, jawaban tidak dapat diubah.</p>
            <div className="modal-actions"><button className="button button-outline" onClick={() => setShowSubmitConfirm(false)}>Periksa lagi</button><button className="button button-primary" disabled={submitBusy} onClick={() => { void submitExam(); }}>{submitBusy ? "Mengirim…" : "Ya, kirim jawaban"}</button></div>
          </section>
        </div>
      )}
      {notice && <div className="candidate-notice">{notice}</div>}
    </main>
  );
}

function AnswerEditor({ task, position, value, disabled, onChange }: { task: Task; position: string; value: unknown; disabled: boolean; onChange: (value: unknown) => void }) {
  const object = isRecord(value) ? value : {};
  const setField = (field: string, text: string) => onChange({ ...object, [field]: text });
  if (task.type === "code") {
    const rawLanguage =
      asText(object.language) ||
      (position.toLowerCase().includes("frontend") ? frontendLanguage : "JavaScript");
    const knownLanguage =
      rawLanguage === frontendLanguage ||
      codeLanguages.some((item) => item === rawLanguage);
    const languageSelection =
      rawLanguage === "__other__" || !knownLanguage ? "__other__" : rawLanguage;
    const customLanguage =
      asText(object.languageCustom) ||
      (!knownLanguage && rawLanguage !== "__other__" ? rawLanguage : "");
    const language =
      languageSelection === "__other__"
        ? customLanguage.trim() || "Bahasa lainnya"
        : languageSelection;
    return (
      <div className="editor-stack">
        <label className="editor-label"><span>BAHASA PEMROGRAMAN</span><small>Pilih bahasa untuk jawaban</small></label>
        <select
          className="code-language-select"
          aria-label="Bahasa pemrograman"
          disabled={disabled}
          value={languageSelection}
          onChange={(event) =>
            onChange({
              ...object,
              language: event.target.value,
              languageCustom: event.target.value === "__other__" ? "" : "",
            })
          }
        >
          <option value={frontendLanguage}>{frontendLanguage} · pratinjau</option>
          {codeLanguages.map((item) => <option key={item} value={item}>{item}</option>)}
          <option value="__other__">Bahasa lainnya…</option>
        </select>
        {language === frontendLanguage ? (
          <FrontendCodeEditor
            html={asText(object.html)}
            css={asText(object.css)}
            javascript={asText(object.javascript)}
            disabled={disabled}
            onChange={setField}
          />
        ) : (
          <>
            {languageSelection === "__other__" && (
              <label className="editor-label">
                <span>NAMA BAHASA</span>
                <input
                  className="code-language-select"
                  aria-label="Nama bahasa pemrograman lainnya"
                  disabled={disabled}
                  maxLength={60}
                  value={customLanguage}
                  onChange={(event) =>
                    onChange({
                      ...object,
                      language: "__other__",
                      languageCustom: event.target.value,
                    })
                  }
                  placeholder="Contoh: Zig, Clojure, Solidity…"
                />
              </label>
            )}
            <label className="editor-label"><span>EDITOR {language.toUpperCase()}</span><small>Kode disimpan sebagai teks</small></label>
            <textarea className="code-editor" aria-label={`Jawaban kode ${language}`} spellCheck={false} disabled={disabled} value={asText(object.code)} onChange={(event) => setField("code", event.target.value)} placeholder={`// Tulis jawaban ${language} di sini…`} />
            <DisabledRunnerOutput language={language} />
          </>
        )}
        {position.toLowerCase().includes("backend") && (
          <>
            <label className="editor-label"><span>EDITOR SQL · POSTGRESQL</span><small>Query disimpan sebagai teks</small></label>
            <textarea className="code-editor sql-editor" aria-label="Jawaban SQL" spellCheck={false} disabled={disabled} value={asText(object.sql)} onChange={(event) => setField("sql", event.target.value)} placeholder={"-- Tulis query SQL di sini…"} />
            <DisabledRunnerOutput language="SQL PostgreSQL" />
          </>
        )}
        <label className="editor-label"><span>PENJELASAN</span><small>Jelaskan asumsi dan pendekatan Anda</small></label>
        <textarea className="answer-textarea" rows={4} disabled={disabled} value={asText(object.notes)} onChange={(event) => setField("notes", event.target.value)} placeholder="Uraikan pendekatan, pertimbangan, dan cara pengujian…" />
      </div>
    );
  }
  if (task.type === "sql") {
    return <div className="editor-stack"><label className="editor-label"><span>EDITOR SQL · POSTGRESQL</span><small>Query disimpan sebagai teks</small></label><textarea className="code-editor sql-editor" aria-label="Jawaban SQL PostgreSQL" spellCheck={false} disabled={disabled} value={asText(object.query)} onChange={(event) => setField("query", event.target.value)} placeholder={"-- Tulis query PostgreSQL di sini…"} /><DisabledRunnerOutput language="SQL PostgreSQL" /><label className="editor-label"><span>PENJELASAN</span></label><textarea className="answer-textarea" rows={4} disabled={disabled} value={asText(object.notes)} onChange={(event) => setField("notes", event.target.value)} placeholder="Jelaskan asumsi dan pendekatan…" /></div>;
  }
  if (task.type === "qa") {
    return (
      <div className="editor-stack">
        <label className="editor-label"><span>TEST CASE</span><small>Langkah, hasil yang diharapkan, dan hasil aktual</small></label>
        <textarea className="answer-textarea qa-textarea" rows={6} disabled={disabled} value={asText(object.testCases)} onChange={(event) => setField("testCases", event.target.value)} placeholder={"ID / judul test case:\nPrasyarat:\nLangkah pengujian:\nHasil yang diharapkan:\nHasil aktual:"} />
        <div className="qa-grid">
          <label><span>SEVERITY</span><select disabled={disabled} value={asText(object.severity)} onChange={(event) => setField("severity", event.target.value)}><option value="">Pilih severity</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label><span>PRIORITAS</span><select disabled={disabled} value={asText(object.priority)} onChange={(event) => setField("priority", event.target.value)}><option value="">Pilih prioritas</option><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label>
        </div>
        <label className="editor-label"><span>BUG REPORT</span></label>
        <textarea className="answer-textarea" rows={5} disabled={disabled} value={asText(object.bugReport)} onChange={(event) => setField("bugReport", event.target.value)} placeholder="Judul, lingkungan, langkah reproduksi, hasil aktual, hasil yang diharapkan…" />
      </div>
    );
  }
  if (task.type === "troubleshooting") {
    return (
      <div className="editor-stack">
        <label className="editor-label"><span>DIAGNOSIS</span><small>Apa kemungkinan penyebab utama?</small></label>
        <textarea className="answer-textarea" rows={3} disabled={disabled} value={asText(object.diagnosis)} onChange={(event) => setField("diagnosis", event.target.value)} placeholder="Tuliskan diagnosis dan bukti yang mendukung…" />
        <label className="editor-label"><span>LANGKAH PEMERIKSAAN DAN PENANGANAN</span><small>Susun tindakan secara berurutan dan aman</small></label>
        <textarea className="answer-textarea" rows={6} disabled={disabled} value={asText(object.steps)} onChange={(event) => setField("steps", event.target.value)} placeholder={"1. Pemeriksaan awal:\n2. Analisis hasil:\n3. Mitigasi:\n4. Verifikasi pemulihan:"} />
        <label className="editor-label"><span>LAPORAN INSIDEN / ESKALASI</span></label>
        <textarea className="answer-textarea" rows={4} disabled={disabled} value={asText(object.report)} onChange={(event) => setField("report", event.target.value)} placeholder="Dampak, waktu, layanan terdampak, pihak yang perlu dihubungi, dan informasi penting lainnya…" />
      </div>
    );
  }
  return <div className="editor-stack"><label className="editor-label"><span>JAWABAN</span><small>Tuliskan jawaban Anda</small></label><textarea className="answer-textarea" rows={12} disabled={disabled} value={asText(value)} onChange={(event) => onChange(event.target.value)} placeholder="Ketik jawaban di sini…" /></div>;
}

function FrontendCodeEditor({
  html,
  css,
  javascript,
  disabled,
  onChange,
}: {
  html: string;
  css: string;
  javascript: string;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}) {
  const [previewDocument, setPreviewDocument] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewState, setPreviewState] = useState<"idle" | "running" | "ready" | "timeout">("idle");
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  function runPreview() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setPreviewDocument(createFrontendPreview(html, css, javascript));
    setPreviewKey((key) => key + 1);
    setPreviewVisible(true);
    setPreviewState("running");
    timeoutRef.current = window.setTimeout(() => {
      setPreviewVisible(false);
      setPreviewState("timeout");
      timeoutRef.current = null;
    }, 3000);
  }

  function finishPreview() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPreviewState("ready");
  }

  return (
    <>
      <label className="editor-label"><span>HTML</span><small>Markup pratinjau</small></label>
      <textarea className="code-editor preview-code-editor" aria-label="Kode HTML" spellCheck={false} disabled={disabled} value={html} onChange={(event) => onChange("html", event.target.value)} placeholder={"<main>\n  <h1>Halo!</h1>\n</main>"} />
      <label className="editor-label"><span>CSS</span><small>Gaya pratinjau</small></label>
      <textarea className="code-editor preview-code-editor" aria-label="Kode CSS" spellCheck={false} disabled={disabled} value={css} onChange={(event) => onChange("css", event.target.value)} placeholder={"body {\n  font-family: sans-serif;\n}"} />
      <label className="editor-label"><span>JAVASCRIPT</span><small>Berjalan terisolasi di browser</small></label>
      <textarea className="code-editor preview-code-editor" aria-label="Kode JavaScript" spellCheck={false} disabled={disabled} value={javascript} onChange={(event) => onChange("javascript", event.target.value)} placeholder={"// JavaScript untuk interaksi pratinjau"} />
      <div className="preview-toolbar">
        <button className="button button-outline button-small" type="button" disabled={disabled} onClick={runPreview}>Jalankan pratinjau</button>
        <span role="status">{previewState === "running" ? "Pratinjau berjalan…" : previewState === "ready" ? "Pratinjau diperbarui" : previewState === "timeout" ? "Pratinjau dihentikan setelah 3 detik." : "Output tampil di bawah."}</span>
      </div>
      <div className="preview-frame-wrap">
        {previewVisible && previewDocument !== null ? (
          <iframe
            key={previewKey}
            className="preview-frame"
            title="Pratinjau hasil kode frontend"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={previewDocument}
            onLoad={finishPreview}
          />
        ) : (
          <div className="preview-placeholder">
            {previewState === "timeout"
              ? "Pratinjau dihentikan agar halaman ujian tetap responsif."
              : "Klik “Jalankan pratinjau” untuk melihat hasil HTML, CSS, dan JavaScript."}
          </div>
        )}
      </div>
      <p className="preview-security-note">Kode hanya berjalan di iframe sandbox tanpa akses jaringan, cookie, atau halaman utama. Backend dan SQL tidak dijalankan.</p>
    </>
  );
}

function DisabledRunnerOutput({ language }: { language: string }) {
  return (
    <section className="runner-output" aria-label={`Output ${language}`}>
      <div className="runner-output-heading">
        <span>HASIL PENGUJIAN · {language.toUpperCase()}</span>
        <button className="button button-outline button-small" type="button" disabled>
          Runner belum tersedia
        </button>
      </div>
      <pre role="status">Kode tersimpan sebagai teks. Runner terisolasi belum dikonfigurasi, jadi kode belum dijalankan.</pre>
    </section>
  );
}
