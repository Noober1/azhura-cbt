# Panduan Deploy On-Premise — Azhura CBT

Panduan ini untuk **admin sekolah** yang memasang server ujian Azhura CBT di
jaringan lokal (LAN) sekolah menggunakan Docker. Komponen yang di-Docker-kan:
backend (API), database, redis, dan console admin/supervisor. Aplikasi
**student** (Tauri) di-install terpisah di tiap workstation ujian — tidak masuk
ke stack Docker ini.

> Asumsi: server menjalankan Linux dengan **Docker** + **Docker Compose v2**
> (`docker compose`, bukan `docker-compose`).

---

## 1. Topologi Jaringan (2 NIC)

Server idealnya punya **dua kartu jaringan**:

| Interface | Fungsi | Catatan |
|-----------|--------|---------|
| WAN (`eth0`) | Internet keluar | **Hanya** dipakai Watchtower untuk menarik update image dari registry. |
| LAN (`eth1`) | Workstation ujian + browser admin | Semua akses ke API (:3000) & console (:80) lewat sini. |

**Prinsip keamanan:** API dan console **hanya** di-bind ke IP LAN server. Port
`3000` dan `80` **tidak boleh** terjangkau dari sisi WAN/internet.

```
                 ┌────────────── WAN/eth0 (internet) ───────────────┐
                 │  hanya Watchtower (pull image :stable)           │
   Internet ─────┤                                                  │
                 └──────────────────────────────────────────────────┘
                                   Server (Docker)
                 ┌────────────── LAN/eth1 (192.168.1.x) ────────────┐
   Workstation ──┤  console :80   ·   backend API :3000             │
   + Admin       │  (mariadb & redis: internal only, tanpa port)    │
                 └──────────────────────────────────────────────────┘
```

---

## 2. Stack Layanan

| Service | Image | Port host | Akses | Volume |
|---------|-------|-----------|-------|--------|
| `backend` | `ghcr.io/<owner>/azhura-backend:stable` | `LAN_IP:3000` | LAN | `uploads_data` (media) |
| `mariadb` | `mariadb:11` | — (internal) | internal | `db_data` |
| `redis` | `redis:7-alpine` | — (internal) | internal | `redis_data` |
| `nginx` (console) | `ghcr.io/<owner>/azhura-console:stable` | `LAN_IP:80` | LAN | — |
| `watchtower` | `containrrr/watchtower` | — | WAN (outbound) | docker socket (ro) |

`mariadb` dan `redis` **tidak** mem-publish port ke host sama sekali — hanya bisa
dihubungi service lain lewat jaringan internal `azhura`.

---

## 3. Konfigurasi `.env`

Salin template lalu isi nilai sebenarnya:

```bash
cp .env.docker.example .env
```

Edit `.env`:

1. **`LAN_IP`** — IP LAN server ini (lihat `ip addr` pada interface LAN), mis.
   `192.168.1.10`. Ini memastikan API & console hanya terekspos di LAN.
2. **Kredensial DB** — set `DB_PASSWORD`, `MARIADB_ROOT_PASSWORD`,
   `MARIADB_PASSWORD`. Pastikan `MARIADB_DATABASE/USER/PASSWORD` **sama persis**
   dengan `DB_NAME/DB_USER/DB_PASSWORD`.
3. **`JWT_SECRET`** — wajib acak, minimal 32 karakter. Generate dengan:
   ```bash
   openssl rand -base64 48
   ```
4. **`CORS_ORIGIN`** — URL console seperti diakses dari LAN, mis.
   `http://192.168.1.10`.

> Jangan pernah commit `.env`. File ini berisi rahasia produksi.

---

## 4. Menjalankan Stack

> **PENTING — console WAJIB di-build on-premise.** Bundle SPA console
> meng-*inline* `VITE_API_BASE_URL` (alamat backend `http://<LAN_IP>:3000/api`)
> saat **build**, bukan saat runtime. Image console `:stable` dari GHCR (CI)
> hanya memakai URL **placeholder** dan ditujukan untuk dev/preview saja —
> **tidak** bisa dipakai produksi apa adanya. Karena itu jalankan
> `docker compose build` di server sekolah supaya IP LAN sekolah ter-*bake* ke
> dalam bundle. Build mengambil `LAN_IP` dari `.env` (lihat `args:` pada service
> `nginx` di `docker-compose.yml`).

```bash
# Build image lokal — WAJIB untuk console agar LAN_IP ter-bake ke bundle SPA.
docker compose build

# Jalankan semua service di background.
docker compose up -d
```

Cek status & kesehatan:

```bash
docker compose ps
docker compose logs -f backend
```

### Migrasi & Seed

Migrasi schema database **otomatis** dijalankan saat container backend start
(entrypoint menjalankan `src/migrate.ts` sebelum server). Jadi tidak perlu
langkah manual untuk migrate pada deploy normal.

Untuk mengisi data awal (akun demo / data contoh) — **sekali** saat setup
pertama:

```bash
docker compose exec backend bun run src/seed.ts
```

> Untuk menjalankan ulang migrasi secara manual (mis. setelah restore DB):
> `docker compose exec backend bun run src/migrate.ts`.

> **Pemulihan migrasi macet (backend restart-loop di first boot):** DDL
> MySQL/MariaDB tidak transaksional — kalau sebuah migrasi gagal di tengah
> (log backend: `Migration aborted`), tabel yang sudah terlanjur dibuat tetap
> ada tapi journal `__drizzle_migrations` tidak dicatat, sehingga tiap restart
> bentrok `table already exists`. Selama belum ada data penting (first boot),
> reset bersih: `docker compose down -v` (menghapus volume DB) lalu
> `docker compose up -d`. Jika DB sudah berisi data, perbaiki manual: drop
> objek yang dibuat migrasi yang gagal, lalu jalankan ulang migrate.

---

## 5. Firewall (WAJIB)

Bind LAN-only saja **tidak cukup** kalau interface WAN punya IP di subnet yang
sama atau routing salah. Selalu blokir port aplikasi di sisi WAN.

Contoh dengan `ufw` (sesuaikan nama interface):

```bash
# Izinkan akses dari LAN saja
sudo ufw allow in on eth1 to any port 80 proto tcp
sudo ufw allow in on eth1 to any port 3000 proto tcp

# Tolak port aplikasi dari interface WAN
sudo ufw deny in on eth0 to any port 80 proto tcp
sudo ufw deny in on eth0 to any port 3000 proto tcp
```

**Checklist keamanan:**

- [ ] `LAN_IP` di `.env` = IP LAN server (bukan `0.0.0.0`).
- [ ] Port `3000` & `80` diblokir pada interface WAN (`eth0`).
- [ ] `mariadb` & `redis` tidak mem-publish port host (default compose ini).
- [ ] `JWT_SECRET` acak ≥32 karakter.
- [ ] `ENABLE_API_DOCS` tidak di-set `true` di produksi.

---

## 6. Data & Volume

Data persisten disimpan di named volume Docker (aman saat container di-rebuild):

| Volume | Isi |
|--------|-----|
| `db_data` | Database MariaDB (`/var/lib/mysql`). |
| `redis_data` | Append-only file redis (registry sesi). |
| `uploads_data` | **Media yang di-upload** (soal, gambar) di `/app/backend/uploads`. |

Backup minimal yang disarankan: dump `mariadb` + arsip volume `uploads_data`.

```bash
# Contoh backup uploads
docker run --rm -v azhura-exam_uploads_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-backup.tar.gz -C /data .
```

> Nama volume aktual = `<nama_project>_uploads_data` (default project = nama
> folder repo). Cek dengan `docker volume ls`.

---

## 7. Update Offline (tanpa internet di server)

Jika server LAN tidak punya akses internet sama sekali (Watchtower nonaktif),
update dilakukan manual dengan transfer image lewat file `.tar`:

```bash
# Di mesin yang punya internet:
docker pull ghcr.io/<owner>/azhura-backend:stable
docker pull ghcr.io/<owner>/azhura-console:stable
docker save ghcr.io/<owner>/azhura-backend:stable \
            ghcr.io/<owner>/azhura-console:stable -o azhura-images.tar

# Pindahkan azhura-images.tar ke server (USB/jaringan internal), lalu:
docker load -i azhura-images.tar
docker compose up -d
```

> Script `update.sh` yang membungkus alur `save`/`load` ini akan ditambahkan
> menyusul (lihat #174). Untuk sekarang, jalankan langkah di atas manual.

---

## 8. Release Channels (edge → rc → stable)

Channel = **tag** pada satu registry (GHCR), **bukan** environment terpisah.
Promosi antar-channel = **re-tag digest image yang sama** (bukan rebuild) — jadi
byte-nya identik dengan yang sudah divalidasi, tanpa drift dan tanpa risiko
build ulang menarik base layer baru.

| Channel | Diisi oleh | Tujuan | Watchtower produksi |
|---------|-----------|--------|---------------------|
| `:edge` | **Otomatis** — tiap push ke `main` (`.github/workflows/docker-publish.yml`). | Build terbaru off-`main`, untuk uji internal. | **Tidak** ditrack. |
| `:rc` | **Manual** — promosi dari digest `:edge` yang sudah divalidasi. | Satu sekolah **canary** (uji lapangan terbatas). | **Tidak** ditrack. |
| `:stable` | **Manual** — promosi dari digest `:rc` yang sudah divalidasi. | **Semua** sekolah produksi. | **Ya** — hanya ini yang ditrack. |

Server produksi selalu pin `:stable` (lihat `docker-compose.yml`), dan Watchtower
hanya menyentuh service berlabel `watchtower.enable=true` (backend & console).
Watchtower **tidak pernah** mentrack `:latest` atau `:edge`. Jadi produksi hanya
menerima image yang sudah **sengaja dipromosikan manusia** ke `:stable`.

### 8.1 Cara Promosi

Promosi dijalankan lewat workflow **`promote.yml`** (Actions → `promote` → "Run
workflow"). Karena ini re-tag **digest** (bukan rebuild), image yang masuk ke
`:rc`/`:stable` byte-identik dengan yang sudah divalidasi.

Input `workflow_dispatch`:

| Input | Tipe | Keterangan |
|-------|------|------------|
| `image` | choice | `azhura-backend`, `azhura-console`, atau `both`. |
| `from_channel` | choice | Channel sumber: `edge` atau `rc`. |
| `to_channel` | choice | Channel target: `rc` atau `stable`. |
| `source_digest` | string (opsional) | Jika diisi (`sha256:...`), promosikan **digest itu persis**. Jika kosong, resolusi otomatis ke digest yang sedang ditunjuk `from_channel`. |

Hanya arah ladder yang valid: **`edge → rc`** dan **`rc → stable`** (workflow
menolak arah lain). Alur normal:

1. **`edge → rc`** — setelah build `:edge` lolos uji internal, jalankan
   `promote` dengan `from_channel: edge`, `to_channel: rc`. Pasang `:rc` di
   sekolah canary, amati satu siklus ujian.
2. **`rc → stable`** — setelah canary stabil, jalankan `promote` dengan
   `from_channel: rc`, `to_channel: stable`. Watchtower di tiap sekolah akan
   menarik `:stable` baru pada poll berikutnya.

> ⚠️ **PRASYARAT WAJIB — buat Environment `production` SEBELUM memakai workflow
> ini.** Gate promosi `:stable` **hanya** ditegakkan oleh GitHub Environment
> bernama **`production`**. Kamu **WAJIB** membuat Environment itu di repo
> **Settings → Environments** dengan **minimal satu Required Reviewer** SEBELUM
> workflow `promote.yml` dipakai. Tanpa Environment ini, GitHub menjalankan job
> **tanpa gate sama sekali** — siapa pun aktor dengan izin `actions: write` bisa
> mendorong digest apa pun ke `:stable` dan otomatis men-deploy ke **semua
> sekolah**. Disarankan juga mengaktifkan **"Prevent self-review"** agar pengaju
> tidak bisa meng-approve promosinya sendiri.
>
> **Gate `:stable`.** Job promosi ke `:stable` terikat pada GitHub Environment
> bernama **`production`**. Atur *required reviewers* / protection rules pada
> environment itu (Settings → Environments → `production`) supaya promosi ke
> `:stable` **wajib di-approve manual** sebelum berjalan. Promosi ke `:rc` tidak
> melewati gate ini. Setiap run mencatat *actor* + *timestamp* + digest di job
> summary (siapa mempromosikan digest apa, dari channel mana ke mana).

> **Catat digest yang dipromosikan.** Simpan changelog kecil (mis. di issue
> rilis atau file) berisi digest tiap promosi ke `:stable`. Ini yang dipakai
> saat rollback.

### 8.2 Rollback

Rollback = pin `:stable` kembali ke **digest stabil sebelumnya yang
known-good**. Caranya jalankan ulang `promote` dengan `source_digest` eksplisit:

- `image`: image yang bermasalah (atau `both`),
- `from_channel`: `rc` — tidak dipakai untuk resolusi digest saat
  `source_digest` diisi, TAPI validasi arah tetap berjalan, jadi pilih `rc` agar
  lolos ke `stable`,
- `to_channel`: `stable`,
- `source_digest`: `sha256:<digest stable lama yang known-good>`.

Karena `source_digest` diisi, workflow tidak meresolusi channel sumber — ia
langsung re-tag digest lama itu menjadi `:stable`. Watchtower lalu "turun" ke
image lama tersebut pada poll berikutnya.

Mencari digest stabil sebelumnya:

```bash
# Digest yang sedang ditunjuk :stable sekarang
docker buildx imagetools inspect \
  ghcr.io/<owner>/azhura-backend:stable --format '{{.Manifest.Digest}}'
```

Jika tidak punya changelog digest, digest lama bisa ditemukan dari riwayat
job summary `promote.yml` di tab Actions (tiap promosi mencatat digest-nya),
atau dari daftar versi package di GHCR. **Disarankan** menyimpan changelog
digest tiap promosi `:stable` agar rollback cepat dan tidak menebak.

### 8.3 Jangan Update Saat Ujian Berlangsung

**Promosi ke `:stable` TIDAK BOLEH dilakukan selama jendela ujian aktif.** Saat
`:stable` berubah, Watchtower di sekolah akan menarik image baru dan
**me-restart** container backend/console — ini bisa memutus sesi ujian siswa
yang sedang berjalan (backend menyimpan sesi/heartbeat di redis & DB; restart
backend = koneksi socket putus, siswa terganggu).

Aturan operasional:

- **Jadwalkan promosi `:stable` di luar jam ujian** (mis. malam / akhir pekan).
- **Pause Watchtower selama jendela ujian** di tiap sekolah agar tidak ada
  auto-pull/restart tak terduga:

  ```bash
  # Sebelum ujian mulai — bekukan auto-update
  docker pause azhura-exam-watchtower-1        # atau: docker compose stop watchtower

  # Setelah ujian selesai — aktifkan lagi
  docker unpause azhura-exam-watchtower-1      # atau: docker compose start watchtower
  ```

  (Nama container = `<project>-watchtower-1`; cek dengan `docker ps`.)

- Alternatif: naikkan `WATCHTOWER_POLL_INTERVAL` agar poll jarang, dan/atau
  andalkan gate approval `production` sehingga promosi `:stable` tidak pernah
  terjadi tanpa persetujuan manual yang sengaja dijadwalkan di luar jam ujian.

> **Koordinasi dengan sesi aktif.** Selalu konfirmasi tidak ada sesi ujian aktif
> (cek dashboard supervisor / data sesi di backend) sebelum mempromosikan ke
> `:stable` dan sebelum meng-`unpause` Watchtower.
