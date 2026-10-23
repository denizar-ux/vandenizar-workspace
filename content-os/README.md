# vandenizar / content OS

Ruang kerja konten pribadi: ide → tulisan → produksi → rencana posting → terbit manual → review → ide baru.

## Menjalankan

```
npm install
npm run dev        # lokal, mode "tersimpan di perangkat ini"
npm test           # unit + smoke test UI (jsdom)
npm run build      # typecheck + build ke dist/
```

Deploy: Vercel project `vandenizar-content-os`, root directory `content-os/` di repo vandenizar-workspace. Setiap push ke `main` yang mengubah folder ini auto-deploy. Naikkan `VERSION` di `public/sw.js` tiap rilis.

## Arsitektur

- React 18 + TypeScript + Vite, satu file HTML (vite-plugin-singlefile). Routing pakai hash (`#/instagram/<id>?tab=publish`).
- `src/lib/store.ts`: semua data dimuat ke memori (Map per koleksi). Tulis ke memori langsung, simpan ke penyimpanan dengan debounce 650 ms, antrian per dokumen, flush saat pindah halaman atau app ditutup.
- Sync: Supabase project `ngdsdkqimosiiqzdacci`, tabel `public.content_os_records` (user_id, coll, id, data jsonb, deleted, updated_at), RLS own rows, realtime aktif. Login email + password akun Workspace (signup baru dimatikan).
- Local-first: data di memori + cache localStorage (`vzc:data`), outbox perubahan yang belum terkirim (`vzc:outbox`) disimpan sehingga edit offline tidak hilang saat reload. Push ~650 ms setelah edit, pull saat buka/fokus, tiap 60 detik, dan realtime. Hapus = tombstone `deleted=true`. Konflik: edit lokal yang belum terkirim menang, selain itu timestamp `updatedAt` terbaru menang.
- `src/lib/model.ts`: aturan domain (next action, perlu perhatian, subtask, batch, publikasi, duplikasi, turunan, purge). Progress, jadwal efektif dan event kalender semuanya diturunkan, tidak disimpan.
- Waktu: instan disimpan ISO UTC, ditampilkan dalam zona workspace (default Asia/Jakarta, label WIB). Tenggat disimpan sebagai tanggal saja dan baru terlambat setelah hari lokal habis.
- Gambar (cover, thumbnail): diperkecil ke maks 960 px JPEG dan disimpan sebagai data URL di koleksi `assets`. Video tidak pernah disimpan, hanya lokasi/link.
- `confirm()`/`prompt()` tidak jalan di artifact, jadi semua konfirmasi pakai dialog sendiri (`ask()`); hapus permanen minta ketik nama.

## Keterbatasan nyata

- Tidak ada auto-post, analytics otomatis, AI, atau notifikasi. Posting manual.
- Operasi majemuk diterapkan sekaligus di memori lalu dikirim sebagai satu upsert; kalau gagal, semua tetap di outbox dan dikirim ulang.
- Edit bersamaan di dua perangkat: last write wins per dokumen. Dokumen yang sedang diedit tidak ditimpa versi remote.
- Batas karakter Threads tidak di-hardcode; isi sendiri di Settings.
- Drag-and-drop di kalender tidak dibuat; semua jadwal diatur lewat form.
