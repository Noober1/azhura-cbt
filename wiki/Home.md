# Azhura CBT — Panduan Pengguna

**Azhura CBT** adalah sistem ujian berbasis komputer (Computer-Based Test) yang aman & bisa berjalan offline di jaringan sekolah (LAN). Wiki ini adalah **panduan pemakaian** untuk pengguna — bukan dokumentasi teknis pengembangan.

> 💻 Mencari dokumentasi teknis (setup dev, deploy server, rilis)? Lihat **[README & docs di repositori](https://github.com/Noober1/azhura-cbt)** (`docs/DEPLOY.md`, `docs/RELEASE_STUDENT.md`, `docs/CODE_SIGNING.md`).

## Pilih panduan sesuai peranmu

| Peran | Kamu melakukan… | Buka |
|-------|-----------------|------|
| 🛠️ **Admin / Operator** | Kelola pengguna & kelas, susun & impor soal, atur jadwal ujian, lihat rekap nilai | **[[Panduan Admin]]** |
| 👁️ **Pengawas** | Mulai & pantau sesi ujian, kirim peringatan, force-submit / keluarkan peserta, baca log kecurangan | **[[Panduan Pengawas]]** |
| 🎓 **Siswa** | Pasang aplikasi, login, mengerjakan ujian, submit | **[[Panduan Siswa]]** |
| ❓ Semua | Masalah umum (SmartScreen, WebView2, koneksi LAN) | **[[FAQ Troubleshooting]]** |

## Sekilas cara kerja

- **Server sekolah** menjalankan **backend** (API + database) dan **console** (aplikasi web admin/pengawas) di dalam jaringan lokal.
- **Siswa** memakai **aplikasi desktop** (Azhura Student) yang dipasang di tiap komputer ujian, terhubung ke server lewat LAN.
- Sistem dirancang **offline-first**: jawaban tersimpan lokal dulu, lalu tersinkron ke server — aman jika jaringan sempat putus saat ujian.

> 📸 _Catatan: sebagian halaman perlu ditambahi screenshot & penyesuaian nama menu sesuai versi UI terbaru._
