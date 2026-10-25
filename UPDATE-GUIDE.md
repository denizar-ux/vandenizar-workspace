# Update Vandenizar Workspace

## Upload ke GitHub
1. Export backup dari Settings > Data di aplikasi lama.
2. Extract ZIP ini. Upload ISI folder source ke ROOT repository yang sama (lokasi package.json). Jangan upload ZIP saja atau membuat folder root tambahan.
3. Replace file dengan path yang sama. Tambahkan file baru src/pages/events.jsx dan UPDATE-GUIDE.md.
4. Hapus file lama src/pages/templates.jsx dari GitHub. Upload tidak otomatis menghapus file lama; aplikasi sudah tidak mengimpor file itu.
5. Commit ke branch yang tersambung ke production Vercel.
6. Vercel otomatis build jika Git integration aktif. Tunggu status Ready, buka domain lama lalu refresh/reload aplikasi. Tutup tab lama agar upgrade IndexedDB tidak terblokir.
7. Tes event baru, edit, Calendar, lalu reload. Untuk sync lintas perangkat, login akun sama dan cek status Synced pada kedua perangkat setelah keduanya memakai versi baru.

## Vercel
Konfigurasi yang disertakan: framework Vite, build npm run build, output dist. Root Directory tetap root repo, sama seperti proyek asal. Tidak perlu membuat project Vercel baru atau mengubah domain. Auto deploy bergantung Git integration/production branch yang sudah terhubung. Pengaturan dashboard belum diperiksa langsung.

## Supabase
Source memakai tabel generik records (coll,id,data,user_id), tidak membutuhkan tabel event terpisah. Jenis baru adalah pmEvents. Struktur tabel/RLS live belum diverifikasi: jika ada CHECK/allowlist yang membatasi coll, tambahkan pmEvents pada constraint tersebut. Jangan mengubah RLS secara terbuka. Uji status Synced dan event pada perangkat kedua sebelum mengandalkan cloud sync.
Tidak ada key, URL, atau environment Supabase yang perlu diganti untuk update frontend ini. Data lokal ditambah store pmEvents dengan IndexedDB versi 6; store lama dipertahankan.

## Event v1
- Add > Event, Add event di home, atau Add di Calendar > Event.
- Nama, tanggal, mulai/selesai atau All day, lokasi/link, project opsional, catatan.
- Event di home diurutkan bersama task berdasarkan jam. All-day ditampilkan terpisah di atas jadwal.
- Event muncul pada day/week/month Calendar dan detail project terkait.
- Klik event untuk edit. Remove event menyembunyikan event dan menyediakan Undo segera setelah penghapusan.
- Event tidak memiliki checkbox completion, subtasks, atau focus timer.
- Kartu home: Tasks for today, Deadlines (7 hari ke depan + overdue), Active projects, Events today.
- Jam menggunakan WIB, mengikuti aplikasi asal. Event lintas tengah malam/multihari dan recurring belum didukung. Buat dua event terpisah untuk lintas hari.
- Event belum memiliki push reminder atau sinkronisasi Apple/Google Calendar.
- Tanggal Shoot lama di project tetap penanda tanggal terpisah; event terkait project belum otomatis mengubah field Shoot. Gunakan event untuk jam shoot yang spesifik.

## Verifikasi
Build produksi berhasil. Browser: buat event, tampil di agenda dan hitungan event, tampil di Calendar, edit dari Calendar, penolakan waktu selesai sebelum mulai, All day, dan reload. Cloud sync akun pengguna dan deployment Vercel belum diuji.

## Update terbaru
Tombol Start/Pause, focus timer, dan bar timer dihapus dari home, menu task, dan detail task. Riwayat lama tetap dipertahankan sebagai data kompatibilitas; tidak ada timer berjalan di UI.
