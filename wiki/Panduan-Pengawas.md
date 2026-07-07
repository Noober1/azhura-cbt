# Panduan Pengawas

Panduan ini untuk **pengawas (proktor)** yang memantau ujian secara langsung lewat **Console**.

> ℹ️ _Nama menu/tombol mengikuti fungsi; sesuaikan dengan label UI terbaru bila berbeda._

## 1. Masuk & Buka Ruang Pengawasan

1. Login ke console dengan akun **pengawas**.
2. Buka halaman **pemantauan ujian** untuk ujian yang sedang berlangsung.
3. Kamu akan melihat daftar peserta beserta **status koneksi & progres** mereka secara real-time.

> 📸 _Screenshot dashboard proctoring._

## 2. Pantau Peserta Secara Langsung

Pengawasan bersifat **real-time** (lewat koneksi WebSocket ke server). Yang bisa dipantau umumnya:
- Peserta yang sedang online / terputus.
- Progres pengerjaan (mis. jumlah soal terjawab).
- **Pelanggaran anti-cheat** yang terdeteksi di aplikasi siswa.

## 3. Peringatan & Tindakan

Sebagai pengawas kamu bisa mengirim tindakan ke aplikasi siswa:

| Tindakan | Efek di sisi siswa |
|----------|--------------------|
| **Kirim peringatan** (alert) | Menampilkan pesan peringatan ke siswa tertentu |
| **Force-submit** | Memaksa mengumpulkan ujian siswa (mengakhiri sesi & menilai) |
| **Keluarkan (kick)** | Mengeluarkan siswa dari sesi ujian |

> ⚠️ Gunakan **force-submit** dan **kick** dengan hati-hati — keduanya mengakhiri/menghentikan sesi siswa.

## 4. Log Kecurangan (Anti-Cheat)

Aplikasi siswa dapat mendeteksi & mencatat pelanggaran, lalu mengirimkannya **langsung ke pengawas** dan menyimpannya ke catatan (`cheat log`). Contoh yang dipantau (tergantung konfigurasi):
- Keluar dari **mode layar penuh**.
- **Kehilangan fokus** jendela (mis. Alt+Tab / pindah aplikasi).
- Percobaan **shortcut terlarang** (mis. F12, refresh).
- **Multi-monitor** terdeteksi.

Tinjau log ini selama & setelah ujian untuk menindaklanjuti dugaan kecurangan.

---

### Terkait
- Menyiapkan ujian, soal, & grup → **[[Panduan Admin]]**
- Kendala teknis → **[[FAQ Troubleshooting]]**
