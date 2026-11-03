# Ruang Ujian — MVP ujian praktik

Aplikasi web untuk membuat ujian praktik, mengundang kandidat, menyimpan jawaban, dan menilai hasil dengan rubrik berbobot.

## Deployment production dengan Docker

Deployment ini menjalankan satu instance Next.js pada Node.js 24. SQLite dan unggahan kandidat disimpan dalam named volume Docker (`app-data`); jangan menjalankan beberapa instance aplikasi pada volume database yang sama. Letakkan aplikasi di belakang reverse proxy yang menyediakan HTTPS sebelum menerima akses publik.

1. Pasang Docker Engine dan Docker Compose v2 pada host.
2. Salin `.env.example` menjadi `.env`, lalu tetapkan `ADMIN_EMAIL`, kata sandi admin yang kuat, `APP_URL` ke URL publik HTTPS, dan `AUTH_SECRET` acak. Buat secret di PowerShell:

   ```powershell
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   ```

3. Dari direktori proyek, build dan jalankan aplikasi:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

4. Arahkan reverse proxy HTTPS ke port `3000` pada host. Periksa kondisi aplikasi dengan `docker compose ps`; health check menggunakan endpoint sesi tanpa memerlukan login.

Volume persisten tidak menggantikan backup. Buat backup terjadwal atas named volume `app-data` dan uji proses pemulihannya. Untuk menghentikan aplikasi tanpa menghapus data, jalankan `docker compose down` (jangan menambahkan `-v` kecuali memang ingin menghapus data).

## Menjalankan secara lokal

Persyaratan: Node.js 24 atau lebih baru.

1. Salin `.env.example` menjadi `.env.local`.
2. Atur `ADMIN_EMAIL`, `ADMIN_PASSWORD`, dan `AUTH_SECRET` di `.env.local`. Untuk pengembangan lokal, ubah `APP_URL` menjadi `http://localhost:3000`.
3. Jalankan:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

4. Buka `http://localhost:3000`, lalu masuk menggunakan kredensial yang sudah diatur.

Tanpa `.env.local`, mode pengembangan menggunakan `admin@example.local` / `admin12345` dan secret lokal bawaan. **Ganti nilai tersebut sebelum penggunaan nyata.** Mode production memerlukan `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, dan `APP_URL` HTTPS; atur melalui environment host, jangan commit rahasia ke repositori.

Secret acak dapat dibuat dari PowerShell dengan `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`.

Database SQLite dan berkas unggahan privat dibuat otomatis di `data/`. Atur `DATA_DIR` jika data perlu disimpan di lokasi lain. Jangan meletakkan folder data di direktori publik atau menyajikan berkas unggahan secara langsung.

## Fitur MVP

- Dashboard Admin untuk lima posisi awal: IT Support, QA Engineer, Backend Developer, Frontend Developer, dan Data Center Engineer.
- Sesi Admin dan kandidat menggunakan cookie terpisah, sehingga Admin dapat membuka dashboard tanpa mengakhiri ujian kandidat di browser yang sama.
- Membuat, menerbitkan, menutup, dan mengedit ujian dengan 1–30 tugas, durasi, dan rubrik. Ujian terkunci untuk perubahan setelah kandidat mulai agar jawaban tetap cocok dengan soal.
- Membuat tautan undangan kandidat yang berlaku dua hari dan hanya ditampilkan sekali.
- Timer berbasis waktu server, autosave jawaban, draf lokal saat offline, dan deteksi konflik perubahan.
- Undangan berlaku dua hari. Saat ujian berlangsung, perpindahan tab yang membuat halaman tersembunyi dicatat dan ditampilkan kepada Admin; browser tidak dapat menjamin semua cara meninggalkan halaman terdeteksi.
- Editor untuk banyak bahasa umum serta opsi menulis nama bahasa lainnya; SQL menggunakan PostgreSQL. Pratinjau HTML/CSS/JavaScript tersedia di iframe sandbox browser; eksekusi backend belum aktif sampai runner terisolasi tersedia.
- Dashboard pengumpulan dan penilaian manual dengan bobot rubrik; skor final ditampilkan pada skala 0–100.
- Lampiran disimpan di lokasi privat dan hanya dapat diunduh oleh kandidat pemilik atau Admin.

## Mencoba alur ujian

1. Masuk sebagai Admin, pilih **Buat ujian**, lalu terbitkan draf.
2. Pilih **Undang** pada ujian aktif, isi data kandidat, lalu salin tautan yang ditampilkan satu kali.
3. Buka tautan di tab privat sebagai kandidat, kerjakan tugas, dan kirim jawaban.
4. Kembali ke dashboard Admin untuk membuka jawaban dan memfinalisasi penilaian.

## Batasan dan keamanan

Kode dalam bahasa apa pun selain pratinjau HTML/CSS/JavaScript dan query PostgreSQL kandidat **tidak dieksekusi** karena layanan runner belum dikonfigurasi. Kandidat dapat memilih bahasa umum atau menulis nama bahasa lain; kode disimpan sebagai teks untuk penilaian Admin. Panel hasil memberi tahu kandidat bahwa eksekusi belum tersedia. Pratinjau frontend berjalan hanya di iframe sandbox tanpa akses cookie, halaman utama, atau jaringan. Untuk mengaktifkan eksekusi multi-bahasa, sediakan layanan sandbox self-hosted terpisah dengan pembatasan proses, waktu, memori, dan jaringan sebelum menghubungkannya ke aplikasi. Aplikasi menggunakan Node.js 24 `node:sqlite` dan Next.js App Router; jalankan pada host Node.js, bukan static hosting atau runtime Edge.

MVP ini belum mencakup pengiriman email otomatis, pengelolaan akun Admin multi-pengguna, reset undangan, pencegahan keluar halaman yang tidak dapat dilewati, atau deployment ber-skala multi-instance. Pemantauan tab hanya mencatat saat halaman ujian menjadi tersembunyi; ini bukan proctoring atau jaminan pendeteksian yang tidak dapat dilewati. Atur HTTPS, backup SQLite dan folder unggahan, retensi data, serta kebijakan akses sebelum digunakan pada data kandidat sungguhan.

Perintah pemeriksaan:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```
