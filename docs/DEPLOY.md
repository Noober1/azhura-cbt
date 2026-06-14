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

## Release Channels (lihat #174)

> Stub — diisi oleh issue #174. Ringkasnya: CI mem-publish `:edge` tiap push ke
> `main`; promosi `:edge → :rc → :stable` bersifat manual dan dikontrol manusia.
> Server produksi selalu pin `:stable`, dan Watchtower hanya menarik image
> dengan label `watchtower.enable=true` (backend & console) pada tag `:stable`.
