# vandenizar / content OS

Satu layar untuk ritme konten mingguan: 4 slot Instagram tetap tiap minggu (Work post, Shot vs Setup, Storytelling, Desk), draft Threads dengan tanda udah diposting, dan inbox ide.

- Minggu ini: tiap slot punya tahap Ide → Script → Rekam → Edit → Siap → Upload dan satu tombol lanjut. Post yang belum selesai bisa dilanjutin ke minggu berikutnya. Tap kartu buat script, caption, tanggal, catatan.
- Threads: tulis draft, salin, tandai udah diposting. Tanpa target harian.
- Ide: simpan teks, nanti jadikan post IG (pilih slot) atau draft Threads.

## Teknis
- React 18 + TypeScript + Vite, single-file build, PWA. Deploy: Vercel project `vandenizar-content-os` (root `content-os/`), auto dari `main`.
- Sync: Supabase `public.content_os_records`, koleksi `settings` dan `items` (satu tipe record, `kind` = ig | thread | idea). Local-first dengan outbox offline, realtime + pull saat buka/fokus.
- `npm test`, `npm run build`. Preview tanpa login: `VITE_LOCAL=1 npx vite build`.
