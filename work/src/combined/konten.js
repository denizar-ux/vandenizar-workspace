// A content title is one project (category Konten) with four tasks planned back from the posting date.
// Ids are fixed when the project comes from a Studio post ("st-<postId>"), so the Studio sync can
// run again and again without making duplicates.
import { get, put } from '../lib/db.js';
import { today, addDays } from '../lib/date.js';
import { ensureCategory, newProject, newTask } from '../lib/model.js';

export const KONTEN = { id: 'konten', name: 'Konten', color: 'peach' };
export const STUDIO_URL = 'https://claude.ai/artifact/NMb1oEgjEmQD6CzERq6a5R';

// lead = days before the posting day. Post lands on the day itself at 19:00.
export const KONTEN_STEPS = [
  { key: 'script', title: 'Script', lead: 4, time: '09:00' },
  { key: 'shoot', title: 'Shoot', lead: 3, time: '09:00' },
  { key: 'edit', title: 'Edit', lead: 1, time: '09:00' },
  { key: 'post', title: 'Post', lead: 0, time: '19:00' },
];

export const kontenProjectId = (studioId) => 'st-' + studioId;
export const kontenTaskId = (studioId, key) => 'st-' + studioId + '-' + key;

// Dates for each step. A step that would fall before `from` moves up to `from`, so nothing starts in the past.
export function planKonten(postDate, from = today()) {
  const out = {};
  for (const st of KONTEN_STEPS) {
    const d = addDays(postDate, -st.lead);
    out[st.key] = d < from ? (postDate < from ? postDate : from) : d;
  }
  return out;
}

// Creates the project and its tasks. With a studioId it is idempotent: an existing project is returned untouched.
export function createKonten({ title, postDate, studioId = null, from = today() }) {
  const name = (title || '').trim() || 'Konten baru';
  const pid = studioId ? kontenProjectId(studioId) : undefined;
  const existing = pid && get('pmProjects', pid);
  if (existing && !existing.deletedAt) return existing;
  ensureCategory(KONTEN.id, KONTEN.name, KONTEN.color);
  const plan = planKonten(postDate, from);
  const project = newProject({
    ...(pid ? { id: pid } : {}),
    name, categoryId: KONTEN.id, billing: false, workflow: 'general', deadlineDate: postDate,
    notes: studioId ? 'Dari Studio (post ' + studioId + ')' : '',
    links: [{ id: 'st-link', label: 'Studio', url: STUDIO_URL, type: 'other' }],
    studioId: studioId || null,
  });
  KONTEN_STEPS.forEach((st, n) => {
    newTask({
      ...(studioId ? { id: kontenTaskId(studioId, st.key) } : {}),
      title: st.title + ': ' + name, projectId: project.id, workDate: plan[st.key], workTime: st.time,
      estimateMinutes: null, order: Date.now() + n, konten: st.key, studioId: studioId || null,
    });
  });
  return project;
}
