/**
 * Azhura CBT Console — Central help content (#138 / #134 / #137).
 *
 * One typed source of plain-Indonesian help, keyed by topic. The per-page help
 * button (`PageHelpButton`), the import dialog help, and the header tutorial all
 * read from here so wording stays consistent and is easy to maintain or
 * translate later.
 *
 * Writing rules (audience = non-technical school operators):
 *  - Short sentences. Concrete. No jargon.
 *  - Avoid "upsert", "sync", "batch", "schema", "parse", "token", "spreadsheet".
 *    If a technical idea is unavoidable, explain it in everyday words.
 */

/** Topics that can have a help entry. Mirrors the console's main sections. */
export type HelpTopic =
  | "dashboard"
  | "groups"
  | "students"
  | "exams"
  | "examDetail"
  | "examSessions"
  | "questionForm"
  | "supervisors"
  | "media"
  | "monitoring"
  | "recap"
  | "settings"
  | "import";

/**
 * One step of a visual tutorial (#180): a short demo animation plus a plain
 * Indonesian title and description.
 */
export interface TutorialStep {
  /**
   * Asset path relative to `src/assets/help/`, e.g. `"groups/1.webp"`.
   * The file is an animated WebP (<10s). A reduced-motion fallback frame may
   * sit next to it as `<name>.poster.webp` (see `lib/help-assets.ts`).
   */
  image: string;
  /** Short step title — also used as the visual's alt text. */
  title: string;
  /** One or two plain sentences explaining what the animation shows. */
  description: string;
}

/** One self-contained help entry for a topic. */
export interface HelpEntry {
  /** Dialog title. */
  title: string;
  /** Short plain-language paragraphs. Each string is its own paragraph. */
  body: string[];
  /** Optional ordered "how to" steps shown as a numbered list. */
  steps?: string[];
  /**
   * Optional visual step-by-step tutorial (#180). When present (non-empty),
   * the help dialog switches to the visual carousel; `body`/`steps` stay as
   * the text fallback for topics whose recordings don't exist yet.
   */
  tutorial?: TutorialStep[];
}

export const HELP_CONTENT: Record<HelpTopic, HelpEntry> = {
  dashboard: {
    title: "Tentang Dashboard",
    body: [
      "Dashboard adalah ringkasan keadaan sekolah Anda saat ini: berapa peserta, berapa grup, berapa ujian, dan siapa yang sedang online.",
      "Grafik nilai menampilkan nilai terendah, tengah, dan tertinggi untuk setiap ujian yang sudah selesai.",
      "Angka di sini diperbarui otomatis. Jika muncul tanda \"data mungkin tidak terkini\", koneksi sedang terputus sebentar — coba muat ulang halaman.",
    ],
  },
  groups: {
    title: "Tentang Grup",
    body: [
      "Grup dipakai untuk mengelompokkan peserta, misalnya per kelas (7A, 7B) atau per rombongan belajar.",
      "Setiap ujian nanti ditugaskan ke satu atau beberapa grup, sehingga hanya peserta di grup itu yang bisa mengerjakannya.",
      "Menghapus grup tidak menghapus pesertanya. Peserta hanya menjadi tanpa grup, dan bisa Anda pindahkan ke grup lain.",
    ],
    steps: [
      "Klik \"Buat grup\".",
      "Isi nama grup (contoh: Kelas 7A) dan kode singkatnya.",
      "Simpan. Setelah itu Anda bisa menambahkan peserta ke grup ini.",
    ],
  },
  students: {
    title: "Tentang Peserta",
    body: [
      "Halaman ini berisi seluruh akun peserta ujian. Setiap peserta punya NIS (nomor induk) dan masuk ke salah satu grup.",
      "Anda bisa menambah peserta satu per satu, atau menambah banyak sekaligus dari sebuah file lewat tombol \"Import\".",
      "Peserta yang pernah mengikuti ujian tidak bisa dihapus, agar nilainya tidak hilang. Untuk menonaktifkan, ubah status akunnya menjadi nonaktif.",
      "Tombol \"Cetak Kartu\" mencetak kartu login peserta untuk dibagikan sebelum ujian.",
    ],
    steps: [
      "Klik \"Tambah siswa\" untuk satu peserta, atau \"Import\" untuk banyak peserta dari file.",
      "Pastikan setiap peserta sudah dimasukkan ke grup yang benar.",
      "Bagikan kartu login lewat \"Cetak Kartu\" sebelum ujian dimulai.",
    ],
  },
  exams: {
    title: "Tentang Ujian & Soal",
    body: [
      "Di sini Anda membuat paket ujian beserta soal-soalnya, lalu menentukan grup mana yang boleh mengerjakannya.",
      "Setiap ujian punya kode masuk yang dibagikan ke peserta, durasi pengerjaan, dan batas waktu kedaluwarsa.",
      "Setelah ujian dibuat, klik judulnya untuk mengelola soal. Anda juga bisa menugaskan pengawas yang akan memantau jalannya ujian.",
    ],
    steps: [
      "Klik \"Buat ujian\" dan isi judul, durasi, serta batas waktu.",
      "Buka ujian tersebut, lalu tambahkan soal dan pilihan jawabannya.",
      "Tugaskan ujian ke grup peserta yang sesuai.",
      "Bagikan kode masuk ujian ke peserta saat hari ujian.",
    ],
  },
  examDetail: {
    title: "Tentang Detail Ujian",
    body: [
      "Halaman ini menampilkan satu paket ujian secara lengkap: informasi ujian (kode masuk, durasi, batas waktu), pengawas yang ditugaskan, dan daftar soalnya.",
      "Dari sini Anda bisa mengubah pengaturan ujian lewat \"Edit ujian\", menambah atau melepas pengawas lewat \"Kelola pengawas\", serta menambah, mengubah, dan menghapus soal.",
      "Tombol \"Status peserta\" membuka daftar peserta yang pernah atau sedang mengerjakan ujian ini.",
      "Saat ada peserta yang sedang mengerjakan, soal dikunci sementara — tambah, edit, dan hapus soal tidak tersedia sampai mereka selesai. Ini menjaga keadilan penilaian.",
    ],
    steps: [
      "Klik \"Tambah soal\" untuk membuat soal baru, atau ikon pensil untuk mengubah soal yang ada.",
      "Klik \"Kelola pengawas\" untuk memilih siapa yang memantau ujian ini.",
      "Klik \"Edit ujian\" untuk mengubah judul, durasi, atau batas waktu.",
      "Klik \"Status peserta\" untuk melihat siapa saja yang sudah mengerjakan.",
    ],
  },
  examSessions: {
    title: "Tentang Status Peserta",
    body: [
      "Halaman ini berisi daftar peserta yang pernah atau sedang mengerjakan ujian ini, lengkap dengan statusnya: Mengerjakan, Selesai, atau Kedaluwarsa.",
      "Daftar diperbarui otomatis secara berkala, jadi Anda bisa memantau tanpa perlu memuat ulang halaman.",
      "Peserta berstatus \"Selesai\" bisa direset agar dapat mengerjakan lagi — misalnya saat peserta tidak sengaja menekan tombol selesai. Jawaban yang sudah diisi tetap tersimpan, dan waktu pengerjaan kembali penuh.",
    ],
    steps: [
      "Cari peserta yang ingin dibantu pada daftar.",
      "Klik \"Reset\" di baris peserta berstatus Selesai.",
      "Konfirmasi. Peserta bisa langsung masuk lagi dan melanjutkan dari jawaban terakhirnya.",
    ],
  },
  questionForm: {
    title: "Cara Menyusun Soal",
    body: [
      "Di halaman ini Anda menulis satu soal beserta jawabannya. Ada empat jenis soal: Pilihan Ganda, Isi Jawaban, Pasangkan, dan Urutkan.",
      "Jenis soal hanya bisa dipilih saat membuat soal baru — setelah disimpan, jenisnya tidak bisa diubah lagi.",
      "Teks soal bisa diberi gambar, audio, atau video. Gunakan tombol media pada kotak penulisan untuk menyisipkannya.",
      "Khusus soal Pilihan Ganda, tersedia tombol \"Preview\" untuk melihat tampilan soal persis seperti yang dilihat peserta. Jenis soal lain belum memiliki preview.",
    ],
    steps: [
      "Pilih jenis soal di bagian atas.",
      "Tulis teks soal pada kotak penulisan.",
      "Isi jawabannya: tandai pilihan yang benar (Pilihan Ganda), tulis jawaban benar (Isi Jawaban), lengkapi pasangan (Pasangkan), atau susun urutan yang benar (Urutkan).",
      "Tekan \"Simpan Soal\" (atau \"Perbarui Soal\" saat mengedit). Anda akan kembali ke daftar soal ujian.",
    ],
  },
  supervisors: {
    title: "Tentang Pengawas",
    body: [
      "Pengawas adalah akun untuk guru atau petugas yang memantau jalannya ujian. Setiap pengawas masuk dengan NIS (nomor induk atau username) dan password-nya sendiri.",
      "Pengawas hanya bisa melihat ujian yang ditugaskan kepadanya. Penugasan dilakukan dari halaman detail ujian lewat \"Kelola pengawas\".",
      "Jika pengawas lupa password, gunakan ikon kunci di baris akunnya untuk membuat password baru.",
      "Menghapus akun pengawas juga melepasnya dari semua ujian yang ditugaskan. Tindakan ini tidak bisa dibatalkan.",
    ],
    steps: [
      "Klik \"Buat akun pengawas\" lalu isi NIS, nama, dan password.",
      "Buka halaman ujian yang ingin dipantau, lalu tugaskan pengawas lewat \"Kelola pengawas\".",
      "Bagikan info login ke pengawas sebelum hari ujian.",
    ],
  },
  media: {
    title: "Tentang Media",
    body: [
      "Media adalah kumpulan gambar, audio, dan video yang bisa Anda sisipkan ke dalam soal.",
      "Unggah file di sini terlebih dahulu, lalu pilih file tersebut saat menyusun soal.",
      "Menghapus sebuah file membuat soal yang memakainya kehilangan lampiran tersebut, jadi periksa dulu sebelum menghapus.",
    ],
    steps: [
      "Klik \"Upload\" lalu pilih atau seret file gambar, audio, atau video.",
      "Tunggu sampai file selesai diunggah dan muncul di galeri.",
      "Saat menyusun soal, pilih file dari galeri ini untuk dilampirkan.",
    ],
  },
  monitoring: {
    title: "Tentang Monitoring",
    body: [
      "Halaman ini menampilkan peserta yang sedang online secara langsung: yang baru masuk dan yang sedang mengerjakan ujian.",
      "Untuk peserta yang sedang ujian, Anda bisa melihat sisa waktunya, menambah/mengurangi waktu, menyelesaikan ujiannya, atau mengeluarkannya bila perlu.",
      "Anda juga bisa mengirim pesan ke peserta, misalnya pengumuman saat ujian berlangsung.",
      "Tanda \"Realtime aktif\" berarti data peserta diperbarui otomatis. Jika terputus, tunggu sebentar atau muat ulang halaman.",
    ],
  },
  recap: {
    title: "Tentang Rekap Nilai",
    body: [
      "Rekap Nilai memperlihatkan hasil ujian yang sudah selesai.",
      "Lihat \"Per Paket\" untuk semua peserta dalam satu ujian beserta nilai rata-rata kelas.",
      "Lihat \"Per Siswa\" untuk menelusuri riwayat nilai satu peserta dari berbagai ujian.",
    ],
  },
  settings: {
    title: "Tentang Pengaturan",
    body: [
      "Di sini Anda mengatur identitas sekolah, nilai bawaan untuk ujian baru (durasi dan batas kelulusan), serta menyalakan atau mematikan fitur seperti anti-curang dan obrolan publik.",
      "Perubahan berlaku segera setelah Anda menekan \"Simpan Perubahan\".",
      "Bagian \"Zona Berbahaya\" berisi tindakan yang menghapus data secara permanen. Lakukan hanya bila Anda yakin, karena tidak bisa dibatalkan.",
    ],
  },
  import: {
    title: "Cara Menambah Peserta dari File",
    body: [
      "Fitur ini menambahkan banyak peserta sekaligus dari satu file, jadi Anda tidak perlu mengetik satu per satu.",
      "File yang didukung adalah Excel (.xlsx) atau file daftar (.csv), dengan kolom: NIS, nama, kode grup, dan batch (boleh dikosongkan).",
      "Sebelum perubahan benar-benar disimpan, Anda akan melihat pratinjau dulu — daftar peserta yang akan ditambahkan, diperbarui, atau dilewati. Tidak ada yang berubah sampai Anda menekan tombol konfirmasi.",
      "Ada dua pilihan mode. \"Tambah / Perbarui\" hanya menambah peserta baru dan memperbarui yang sudah ada — aman, tidak menghapus apa pun. \"Samakan dengan file\" membuat daftar peserta sama persis seperti file, sehingga peserta yang tidak ada di file akan dihapus.",
      "Penting: mode \"Samakan dengan file\" menghapus peserta yang tidak tercantum di file. Peserta yang pernah mengikuti ujian tetap aman dan tidak ikut terhapus.",
    ],
    steps: [
      "Pilih mode: \"Tambah / Perbarui\" (aman) atau \"Samakan dengan file\".",
      "Unggah file Excel (.xlsx) atau file daftar (.csv). Belum punya? Klik \"Unduh contoh file\".",
      "Periksa pratinjau: lihat peserta mana yang baru, diperbarui, atau dilewati.",
      "Tekan tombol konfirmasi untuk menyimpan. Sebelum ini, belum ada perubahan tersimpan.",
    ],
  },
};
