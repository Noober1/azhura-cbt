# FAQ & Troubleshooting

Kumpulan masalah umum saat memakai Azhura CBT beserta solusinya.

## Instalasi & Aplikasi Siswa

### "Windows protected your PC" muncul saat memasang aplikasi
Ini normal untuk installer yang **belum bersertifikat publik** (self-signed / unsigned). Aman untuk build resmi sekolah.
- Klik **More info** → **Run anyway**.
- Bila ada prompt **UAC** ("Do you want to allow…"), pilih **Yes**.
- Di komputer sekolah yang sudah dikelola (sertifikat sudah dipasang operator), peringatan ini tidak muncul.

### Aplikasi tidak mau terbuka / layar putih
Aplikasi memerlukan **Microsoft Edge WebView2 Runtime**.
- **Windows 10/11 yang ter-update** umumnya sudah punya (dibawa oleh Edge) — aman.
- Bila komputer sangat lawas / image bersih / tidak pernah online, WebView2 mungkin belum ada. Solusi: pasang **WebView2 Runtime** dari Microsoft (butuh internet sekali), atau minta operator memakai installer versi **offline** yang sudah menyertakan WebView2.

### OS lama (Windows 7/8/8.1)
Tidak didukung. Azhura Student menargetkan **Windows 10 (1803+) / 11**. Komputer dengan Windows 7/8 perlu di-upgrade.

## Login & Ujian (Siswa)

### Tidak bisa login (NIS/password)
- Pastikan **NIS & password** benar (tanya operator bila lupa/reset).
- Pastikan komputer **terhubung ke jaringan (LAN) sekolah** dan server menyala.

### Tidak ada ujian yang muncul
- Ujian hanya tampil untuk **grup/kelas** yang diizinkan. Hubungi admin agar akunmu dimasukkan ke grup ujian yang benar.

### Jaringan putus saat ujian — jawabanku hilang?
Tidak. Jawaban **disimpan lokal** dan **tersinkron otomatis** saat koneksi kembali. Jangan menutup aplikasi; lanjutkan mengerjakan.

## Console (Admin / Pengawas)

### Tidak bisa membuka console dari browser
- Pastikan mengakses **alamat LAN server** (mis. `http://192.168.1.10`), **bukan** `https://`, dan **tanpa** menambahkan port API (`:3000`).
- Pastikan berada di **jaringan yang sama** dengan server dan server menyala.

### Masalah CORS / halaman tidak menarik data
- Akses console lewat **alamat yang sama** dengan yang dikonfigurasi server (host & origin harus cocok). Jika ragu, hubungi operator/admin teknis.

### Pengawasan real-time tidak update
- Periksa koneksi jaringan antara komputer pengawas dan server. Fitur live bergantung pada koneksi WebSocket ke server.

---

> Tidak menemukan jawaban? Untuk kendala teknis mendalam (server, deployment), lihat dokumentasi teknis di **[repositori](https://github.com/Noober1/azhura-cbt)** (`docs/DEPLOY.md`) atau hubungi tim teknis sekolah.
