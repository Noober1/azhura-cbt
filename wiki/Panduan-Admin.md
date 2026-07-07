# Panduan Admin / Operator

Panduan ini untuk **admin/operator** yang mengelola ujian lewat **Console** (aplikasi web) Azhura CBT.

> ℹ️ _Nama menu/tombol di bawah mengikuti fungsi; sesuaikan dengan label UI versi terbaru bila berbeda._

## 1. Masuk ke Console

1. Pastikan **server sekolah menyala** (backend + console berjalan).
2. Buka browser di komputer yang satu jaringan (LAN) dengan server, lalu akses alamat console — biasanya `http://<IP-server-sekolah>` (mis. `http://192.168.1.10`).
3. Login dengan akun **admin**.

> 📸 _Screenshot halaman login._

## 2. Kelola Pengguna & Kelas

- **Siswa** dikelompokkan ke dalam **kelas/grup**. Setiap siswa punya **NIS** (Nomor Induk Siswa) + password untuk login di aplikasi.
- **Grup ujian (`exam group`)** menentukan **ujian mana yang boleh dilihat & dikerjakan** tiap siswa. Siswa hanya melihat ujian yang diizinkan untuk grupnya.
- Tugas admin di sini: menambah/mengubah data siswa, menetapkan kelas/grup, dan (bila perlu) mereset password.

## 3. Susun & Impor Soal

- **Buat soal manual** lewat editor soal di console (pilihan ganda, dsb. sesuai tipe yang didukung).
- **Impor massal** soal dari berkas (mis. spreadsheet) untuk mempercepat input banyak soal sekaligus.
- Kelompokkan soal ke dalam **paket ujian** yang nantinya ditugaskan ke grup tertentu.

> 📸 _Screenshot editor soal & dialog impor._

## 4. Atur Jadwal & Penugasan Ujian

- Tentukan **durasi**, **paket soal**, dan **grup peserta** untuk tiap ujian.
- Karena akses ujian **dibatasi per grup**, pastikan grup peserta sudah benar sebelum ujian dimulai.

## 5. Rekap Nilai

- Setelah ujian, lihat **rekap hasil** per siswa/kelas: skor, rincian jawaban, dan status pengerjaan.
- Rekap bisa dipakai untuk evaluasi dan (bila tersedia) diekspor.

## 6. Pengaturan (Settings)

- Konfigurasi umum sistem ujian tersedia di menu **Settings** console.

---

### Terkait
- Menjalankan sesi & pengawasan langsung → **[[Panduan Pengawas]]**
- Menyiapkan/menjalankan server (Docker, dsb.) → dokumen teknis `docs/DEPLOY.md` di repositori.
