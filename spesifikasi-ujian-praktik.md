# Spesifikasi Ujian Praktik Berbasis Website

## 1. Tujuan

Website digunakan untuk menyelenggarakan ujian praktik kandidat secara terstruktur, menyimpan pekerjaan kandidat, dan membantu Admin menilai hasil berdasarkan rubrik yang konsisten.

## 2. Pengguna dan Hak Akses

### Kandidat

- Membuka ujian melalui akun atau tautan undangan yang valid.
- Melihat instruksi, durasi, dan tugas sesuai posisi yang dilamar.
- Mengerjakan dan menyimpan jawaban selama ujian berlangsung.
- Mengunggah berkas pendukung jika diminta.
- Mengirim jawaban sebelum batas waktu.
- Melihat status pengiriman; hasil atau umpan balik hanya ditampilkan jika diaktifkan Admin.

### Admin/Penilai

- Membuat dan mengelola ujian, posisi, instruksi, tugas, durasi, dan periode akses.
- Mengatur rubrik, bobot, skala nilai, dan kriteria kelulusan.
- Mengundang kandidat serta memantau status pengerjaan.
- Meninjau jawaban dan lampiran, memberi nilai per kriteria, dan menambahkan catatan.
- Melihat, memfilter, dan mengekspor hasil sesuai hak akses.

## 3. Alur Utama

### Persiapan oleh Admin

1. Admin membuat ujian dan memilih posisi.
2. Admin menambahkan instruksi, tugas, durasi, batas akses, serta rubrik penilaian.
3. Admin meninjau tampilan ujian dan menerbitkannya.
4. Kandidat ditambahkan atau dikirimi undangan dengan tautan akses yang aman.

### Pengerjaan oleh Kandidat

1. Kandidat membuka undangan dan menyelesaikan verifikasi akses.
2. Sistem menampilkan posisi, instruksi, durasi, aturan, dan tombol mulai.
3. Setelah ujian dimulai, timer berjalan dan jawaban disimpan otomatis secara berkala serta saat kandidat berpindah bagian.
4. Kandidat dapat menyimpan dan kembali mengerjakan selama periode ujian masih berlaku, jika kebijakan ujian mengizinkan.
5. Kandidat mengirim ujian secara manual atau sistem mengunci dan mengirim jawaban tersimpan saat waktu habis.
6. Sistem mencatat waktu mulai, waktu pengiriman, dan status ujian.

### Penilaian

1. Penilai membuka daftar pengumpulan yang perlu dinilai.
2. Penilai meninjau jawaban dan lampiran, lalu mengisi skor serta catatan untuk setiap kriteria.
3. Sistem menghitung nilai akhir berdasarkan bobot rubrik.
4. Hasil ditandai sebagai draf atau final; hanya hasil final yang dapat dibagikan jika pengaturan mengizinkan.

## 4. Jenis Tugas dan Kebutuhan per Posisi

| Posisi | Tugas yang dapat dikonfigurasi | Bukti/jawaban |
|---|---|---|
| IT Support | Simulasi troubleshooting jaringan; analisis keluaran CMD; diagnosis dan urutan tindakan; laporan insiden | Jawaban terstruktur, pilihan tindakan, laporan, atau lampiran |
| QA Engineer | Menyusun test case; menganalisis temuan; menentukan severity dan prioritas; menulis bug report | Form test case dan bug report |
| Backend Developer | Menulis kode API; memperbaiki kode; menjelaskan pendekatan; menyusun query SQL | Editor kode dan SQL, jawaban teks |
| Frontend Developer | Membuat komponen UI; memperbaiki bug; menjelaskan validasi tampilan responsif | Editor kode, jawaban teks, screenshot bila diminta |
| Data Center Engineer | Menganalisis gejala server, UPS, suhu, dan konektivitas; memilih tindakan; menentukan eskalasi | Skenario, jawaban terstruktur, laporan insiden |

Setiap ujian dapat berisi satu atau beberapa jenis tugas. Jenis tugas yang tidak relevan untuk posisi tertentu tidak perlu ditampilkan.

## 5. Persyaratan Fungsional

### Pengelolaan Ujian

- Admin dapat membuat, mengubah, menggandakan, menerbitkan, menutup, dan mengarsipkan ujian.
- Ujian memiliki posisi, instruksi, periode akses, durasi, dan status.
- Admin dapat mengatur apakah kandidat boleh kembali ke bagian sebelumnya, mengirim ulang, atau melihat hasil.
- Perubahan terhadap ujian yang sudah memiliki pengerjaan tidak boleh mengubah jawaban historis secara diam-diam. Versi ujian dan rubrik yang digunakan harus tersimpan pada pengumpulan terkait.

### Editor dan Area Jawaban

- Editor kode mendukung penulisan dan penyimpanan jawaban tanpa menjalankan kode di server aplikasi.
- SQL editor menyediakan area untuk menulis query. Eksekusi query hanya tersedia bila lingkungan basis data latihan terisolasi telah disiapkan.
- Simulasi troubleshooting menampilkan skenario, informasi perangkat/log yang telah disiapkan, dan area untuk mencatat diagnosis serta tindakan.
- Form QA menyediakan field yang dapat dinilai, sekurang-kurangnya langkah uji, hasil yang diharapkan, hasil aktual, severity, dan deskripsi bug.
- Jawaban teks dan kode disimpan sebagai teks biasa dengan batas ukuran yang dikonfigurasi.

### Lampiran

- Kandidat dapat mengunggah tipe dan ukuran berkas yang diizinkan Admin.
- Sistem memvalidasi ekstensi, tipe konten, dan ukuran; nama penyimpanan tidak menggunakan nama berkas dari pengguna sebagai path.
- Berkas disimpan privat dan hanya dapat diakses oleh kandidat terkait serta Admin/Penilai berwenang.
- Sistem menampilkan status unggah dan pesan kesalahan yang jelas.

### Timer dan Penyimpanan

- Timer menggunakan waktu server sebagai acuan.
- Jawaban disimpan otomatis dan UI menampilkan status terakhir, seperti tersimpan atau sedang menyimpan.
- Jika koneksi terputus, jawaban lokal yang belum terkirim dipertahankan sementara dan disinkronkan kembali saat koneksi pulih; konflik penyimpanan harus dilaporkan, bukan ditimpa diam-diam.
- Saat waktu habis, sistem mengunci perubahan dan mengirim jawaban terakhir yang berhasil tersimpan.
- Pengiriman manual meminta konfirmasi dan menampilkan ringkasan status sebelum finalisasi.

### Rubrik dan Dashboard

- Rubrik terdiri dari kriteria, bobot, skala nilai, deskripsi tingkat pencapaian, dan catatan penilai.
- Total bobot harus valid sesuai aturan ujian sebelum diterbitkan.
- Nilai akhir dihitung konsisten dari skor dan bobot; aturan pembulatan ditampilkan kepada Admin.
- Dashboard dapat menampilkan kandidat, posisi, status, waktu mulai/kirim, penilai, nilai, dan status penilaian.
- Dashboard menyediakan pencarian dan filter berdasarkan posisi, ujian, status, periode, dan rentang nilai.
- Akses ekspor dan hasil kandidat mengikuti hak akses Admin.

## 6. Status Ujian dan Pengumpulan

- **Draf**: belum tersedia bagi kandidat.
- **Terjadwal**: akan tersedia pada waktu yang ditentukan.
- **Aktif**: dapat diakses kandidat yang memenuhi syarat.
- **Ditutup**: tidak menerima pengerjaan baru.
- **Dalam pengerjaan**: kandidat telah memulai dan belum mengirim.
- **Terkirim**: kandidat telah mengirim atau waktu habis dan jawaban tersimpan difinalisasi.
- **Dinilai**: penilaian telah difinalisasi.
- **Dibatalkan**: akses atau ujian dihentikan oleh Admin dengan alasan tercatat.

Perubahan status penting, termasuk mulai, pengiriman, penguncian karena waktu habis, dan finalisasi nilai, dicatat dalam riwayat aktivitas.

## 7. Rubrik Penilaian

Rubrik dapat disesuaikan dengan posisi dan tugas. Contoh kriteria:

- Ketepatan diagnosis atau solusi.
- Ketepatan teknis dan kualitas implementasi.
- Kelengkapan pengujian atau analisis.
- Kejelasan dokumentasi dan komunikasi.
- Pertimbangan keamanan, risiko, dan eskalasi.

Admin menentukan kriteria yang berlaku, bobot, rentang skor, dan deskripsi pencapaian. Sistem tidak menetapkan bobot baku lintas posisi.

## 8. Keamanan dan Privasi

- Kode kandidat tidak dieksekusi langsung di server Next.js atau proses aplikasi utama.
- Jika eksekusi kode diperlukan, jalankan di sandbox terisolasi dengan batas waktu, CPU, memori, penyimpanan, dan tanpa akses jaringan secara default.
- SQL hanya boleh dijalankan pada basis data latihan terpisah, dengan akun berhak minimum, data sintetis, batas waktu, dan pembatasan operasi yang sesuai.
- Terapkan autentikasi dan otorisasi berdasarkan peran serta kepemilikan ujian/pengumpulan.
- Tautan undangan harus sulit ditebak, dapat kedaluwarsa, dan dapat dicabut.
- Lindungi endpoint perubahan data dari CSRF bila relevan, validasi input di server, dan batasi frekuensi permintaan.
- Berkas unggahan tidak boleh dieksekusi atau disajikan sebagai konten aktif dari origin aplikasi.
- Catat aktivitas penting tanpa menyimpan kredensial, token, atau data sensitif yang tidak diperlukan.
- Tentukan kebijakan retensi dan penghapusan data kandidat sebelum peluncuran.

## 9. Kebutuhan Nonfungsional

- Antarmuka responsif dan dapat digunakan pada desktop serta tablet; editor kode dioptimalkan untuk desktop.
- Simpanan jawaban harus tahan terhadap refresh halaman dan gangguan koneksi sementara.
- Pesan validasi dan status sistem harus jelas serta menggunakan Bahasa Indonesia.
- Data kandidat hanya dapat diakses oleh pengguna yang berwenang.
- Sistem mencatat waktu menggunakan zona waktu yang ditetapkan Admin dan menyimpan waktu secara konsisten di backend.
- Operasi penting, termasuk penilaian dan perubahan rubrik, memiliki jejak audit.
- Kegagalan layanan penyimpanan atau unggah harus terlihat oleh pengguna dan dapat ditindaklanjuti Admin.

## 10. Entitas Data Inti

- **User**: identitas, peran, status akun.
- **Position**: nama posisi dan deskripsi.
- **Exam**: posisi, status, periode akses, durasi, instruksi, konfigurasi, dan versi.
- **Task**: ujian, tipe tugas, urutan, instruksi, konfigurasi editor/form, dan skor maksimum.
- **CandidateInvitation**: kandidat, ujian, token undangan yang disimpan secara aman, masa berlaku, dan status.
- **Submission**: kandidat, versi ujian, status, waktu mulai/kirim, serta jawaban.
- **Answer**: pengumpulan, tugas, isi jawaban terstruktur, dan waktu pembaruan.
- **Attachment**: pengumpulan, metadata berkas, lokasi privat, ukuran, tipe, dan waktu unggah.
- **Rubric / RubricCriterion**: versi rubrik, kriteria, bobot, skala, dan deskripsi.
- **Assessment**: pengumpulan, penilai, skor per kriteria, catatan, status draf/final, dan waktu penilaian.
- **AuditEvent**: aktor, tindakan, objek, waktu, dan metadata minimum yang relevan.

## 11. Batasan MVP

MVP mencakup:

1. Pengelolaan ujian dan posisi oleh Admin.
2. Undangan kandidat dan pengerjaan ujian dengan timer.
3. Editor jawaban teks/kode tanpa eksekusi kode.
4. SQL editor sebagai tempat menulis query tanpa menjalankannya.
5. Simulasi troubleshooting berbasis skenario dan form QA.
6. Unggah lampiran dengan validasi dan akses privat.
7. Penyimpanan otomatis serta pengiriman jawaban.
8. Rubrik manual dan dashboard penilaian.

Eksekusi kode otomatis, eksekusi SQL, proctoring, integrasi ATS, serta pemeringkatan otomatis kandidat berada di luar MVP dan memerlukan keputusan, desain keamanan, serta pengujian terpisah.

## 12. Kriteria Penerimaan MVP

- Admin dapat membuat ujian untuk setiap posisi, mengatur durasi, tugas, dan rubrik, lalu menerbitkannya.
- Kandidat yang memiliki undangan valid dapat memulai ujian dan hanya melihat tugas ujian tersebut.
- Jawaban tetap tersedia setelah halaman dimuat ulang, dan status penyimpanan ditampilkan.
- Timer konsisten dengan waktu server; ujian terkunci saat durasi habis dan jawaban terakhir yang tersimpan difinalisasi.
- Kandidat dapat mengunggah berkas sesuai batas dan tipe yang diizinkan; pengguna tanpa hak tidak dapat mengaksesnya.
- Tidak ada kode kandidat yang dieksekusi oleh server aplikasi.
- Penilai dapat memberi skor per kriteria, menyimpan draf, memfinalisasi nilai, dan melihat perhitungan nilai akhir.
- Dashboard dapat memfilter pengumpulan menurut posisi dan status.
- Sistem mencatat waktu mulai, pengiriman, dan finalisasi penilaian.
- Kesalahan simpan, unggah, atau pengiriman ditampilkan secara eksplisit dan tidak dianggap berhasil.

## 13. Keputusan yang Perlu Ditetapkan Sebelum Implementasi

1. Apakah kandidat memakai akun atau tautan undangan tanpa akun.
2. Apakah kandidat boleh menjeda ujian atau berpindah perangkat.
3. Kebijakan keterlambatan, pengiriman ulang, dan penanganan gangguan koneksi.
4. Format, ukuran maksimum, dan masa retensi lampiran.
5. Skala penilaian, aturan pembulatan, nilai kelulusan, dan siapa yang boleh memfinalisasi.
6. Apakah hasil dan umpan balik ditampilkan kepada kandidat.
7. Kebutuhan eksekusi kode/SQL otomatis dan rancangan sandbox terpisah jika dibutuhkan.
8. Kebijakan retensi, ekspor, dan penghapusan data kandidat.
