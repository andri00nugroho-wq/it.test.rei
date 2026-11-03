"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/candidate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Undangan tidak dapat digunakan.";
        throw new Error(message);
      }
      router.push("/candidate");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Undangan tidak dapat digunakan.");
      setBusy(false);
    }
  }

  return (
    <main className="candidate-entry-page">
      <Link className="brand" href="/">
        <Image className="brand-logo" src="/logo-rei.png" alt="REI" width={170} height={52} priority />
      </Link>
      <section className="entry-card">
        <div className="entry-icon">✓</div>
        <span className="eyebrow">UNDANGAN UJIAN PRAKTIK</span>
        <h1>Ukur kemampuan lewat pekerjaan nyata.</h1>
        <p>
          Anda diundang untuk mengikuti ujian praktik. Timer dimulai setelah Anda
          menekan tombol mulai. Pastikan koneksi internet stabil dan siapkan waktu
          sesuai durasi ujian.
        </p>
        <div className="entry-note">
          <strong>Sebelum memulai</strong>
          <ul>
            <li>Jawaban disimpan otomatis saat koneksi tersedia.</li>
            <li>Anda dapat mengunggah screenshot atau hasil pekerjaan.</li>
            <li>Editor menyediakan pilihan bahasa umum dan opsi menulis nama bahasa lainnya. Kode disimpan sebagai teks; runner belum dikonfigurasi sehingga kode tidak dieksekusi.</li>
            <li>HTML/CSS/JavaScript dapat dipratinjau di sandbox browser. Query SQL memakai PostgreSQL dan belum dijalankan.</li>
            <li>Perpindahan dari halaman ujian saat pengerjaan akan dicatat dan terlihat oleh Admin.</li>
            <li>Setelah waktu habis, jawaban yang tersimpan akan dikunci.</li>
          </ul>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="button button-primary button-wide" disabled={busy} onClick={begin}>
          {busy ? "Memeriksa undangan…" : "Saya siap, mulai ujian"} <span>→</span>
        </button>
        <p className="entry-footnote">Dengan memulai, Anda menyetujui ketentuan ujian yang ditampilkan.</p>
      </section>
      <div className="entry-footer">Ujian praktik kandidat · Akses undangan pribadi</div>
    </main>
  );
}
