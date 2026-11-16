# Vandenizar Studio (artifact) — spec

Content manager + creator for Denizar's own content, as a claude.ai artifact so Claude features run on his
subscription (no API cost). Work (work.vandenizar.com) keeps freelance projects, billing, personal tasks and push.

## Capabilities
db (posts, threads, settings), user, assets (photos, rendered covers, slides), sample (Claude), downloads (save cover).

## Data
- `posts/{id}`: title, pillar, format (reels|carousel|photo), stage (idea|script|shoot|edit|ready|posted), date (post),
  scriptDate, shootDate, editDate, hook, script, caption, notes, cover {photoId, renderId, tpl, kicker, title, sub,
  micro, font, dark, accent, size, y, zoom, px, py, grade}, slides [assetId], postedAt, createdAt, updatedAt, deletedAt.
- `threads/{id}`: text, date, postedAt, createdAt, deletedAt.
- `settings/main`: pillars [{id, name, day (0 Mon..6, null = flexible), format, tint, hint}], profile {username,
  name, bio, avatarId}, cover defaults {micro, accent, font}, lang, links [{label, url}].

## Views (hash routes: today, pipeline, calendar, feed, threads, settings, post-<id>)
- Today: week slots, steps due today + late (Replan to today), next 7 days.
- Pipeline: kanban by stage; drag on desktop, "next stage" button on mobile.
- Calendar: month grid, tap a day to add.
- Post: all fields, cover editor, carousel slides + swipe preview, Write with Claude (hooks, script, caption, cover titles).
- Cover editor: photo or video frame, 4 templates, text, font, light/dark, size/position, grid-crop guide, save + download.
- Feed preview: IG profile mock, 3:4 grid of dated posts (scheduled marked), Reels tab 9:16, tap-two-to-swap dates.
- Threads: drafts with date + posted, Claude drafts.
- Settings: pillars (editable days), profile, cover defaults, language, links, trash.

## Not in v1
Video editor, full carousel editor, push notifications (Work only).
