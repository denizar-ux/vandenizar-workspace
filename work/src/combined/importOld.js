// Bring data from the two old apps (project manager, Content OS) or a backup of this app into the shared store.
import { all, get, put, uid, importAll, COLLECTIONS, flush } from '../lib/db.js';

const NOT_BACKUP = 'This file is not a Vandenizar backup';
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function detectBackup(json) {
  if (!isObj(json) || !isObj(json.data)) return null;
  if (json.app === 'vandenizar-work') return 'work';
  if (json.app === 'vandenizar-workspace') return 'pm';
  if (json.app === 'vandenizar-content-os') return 'cos';
  return null;
}

// Per source: which collections are copied, and which fields point at another record.
// ref value = [target collection, value to use when the target is not in the file]
const PM_PLAN = [
  ['clients', {}],
  ['pmProjects', { clientId: ['clients', null], nextActionTaskId: ['pmTasks', null] }],
  ['pmTasks', { projectId: ['pmProjects', null], invoiceId: ['invoices', null], _fromProject: ['pmProjects', null] }],
  ['pmEvents', { projectId: ['pmProjects', null], taskId: ['pmTasks', null] }],
  ['feedback', { projectId: ['pmProjects', null], taskId: ['pmTasks', null] }],
  ['invoices', { clientId: ['clients', ''], projectId: ['pmProjects', ''] }],
  ['payments', { invoiceId: ['invoices', null] }],
];
const PM_META = ['pmSettings', 'pmCategories'];

const rows = (json, coll) => (Array.isArray(json.data[coll]) ? json.data[coll].filter((r) => isObj(r) && r.id) : []);
const originOf = (src, rec) => src + ':' + rec.id;

// importedFrom -> new id for records already in the store
function existingOrigins(coll) {
  const m = new Map();
  for (const r of all(coll)) if (r.importedFrom) m.set(r.importedFrom, r.id);
  return m;
}

/** Records of the file split into the ones to add and the ones already imported. */
function plan(json, src) {
  const out = [];
  if (src === 'pm') for (const [coll, refs] of PM_PLAN) out.push({ coll, refs, rows: rows(json, coll) });
  else out.push({ coll: 'cItems', refs: {}, rows: rows(json, 'items') });
  return out.map((p) => {
    const have = existingOrigins(p.coll);
    return { ...p, fresh: p.rows.filter((r) => !have.has(originOf(src, r))), have };
  });
}

export function previewImport(json) {
  const src = detectBackup(json);
  if (!src) throw new Error(NOT_BACKUP);
  const counts = { tasks: 0, projects: 0, clients: 0, invoices: 0, posts: 0, threads: 0, links: 0 };
  let already = 0;
  if (src === 'work') {
    const seen = (coll, r) => !!get(coll, r.id);
    for (const c of COLLECTIONS) if (c !== 'meta') for (const r of rows(json, c)) if (seen(c, r)) already++;
    const n = (c) => rows(json, c).length;
    counts.tasks = n('pmTasks'); counts.projects = n('pmProjects'); counts.clients = n('clients'); counts.invoices = n('invoices');
    for (const r of rows(json, 'cItems')) { if (r.kind === 'thread') counts.threads++; else if (r.kind === 'link') counts.links++; else counts.posts++; }
  } else if (src === 'pm') {
    counts.tasks = rows(json, 'pmTasks').length; counts.projects = rows(json, 'pmProjects').length;
    counts.clients = rows(json, 'clients').length; counts.invoices = rows(json, 'invoices').length;
    for (const p of plan(json, src)) already += p.rows.length - p.fresh.length;
  } else {
    for (const r of rows(json, 'items')) { if (r.kind === 'thread') counts.threads++; else if (r.kind === 'link') counts.links++; else counts.posts++; }
    for (const p of plan(json, src)) already += p.rows.length - p.fresh.length;
  }
  return { source: src, counts, already };
}

const keepNumericCreatedAt = (r) => {
  const { createdAt, updatedAt, ...rest } = r;
  return typeof createdAt === 'number' ? { ...rest, createdAt } : rest;
};

/** @returns {Promise<{ added: number, skipped: number }>} */
export async function importBackup(json) {
  const src = detectBackup(json);
  if (!src) throw new Error(NOT_BACKUP);

  if (src === 'work') {
    let added = 0, skipped = 0;
    for (const c of COLLECTIONS) if (c !== 'meta') for (const r of rows(json, c)) (get(c, r.id) ? skipped++ : added++);
    await importAll(json, { replace: false });
    return { added, skipped };
  }

  const steps = plan(json, src);
  // 1. new ids for everything that is new; known ids for what was imported before
  const idMap = {}; // coll -> Map(old id -> new id)
  for (const s of steps) {
    idMap[s.coll] = new Map();
    for (const r of s.rows) {
      const known = s.have.get(originOf(src, r));
      idMap[s.coll].set(r.id, known || (s.fresh.includes(r) ? uid() : null));
    }
  }
  // 2. write, with references pointing at the new ids
  let added = 0, skipped = 0;
  for (const s of steps) {
    skipped += s.rows.length - s.fresh.length;
    for (const r of s.fresh) {
      let rec = { ...keepNumericCreatedAt(r), id: idMap[s.coll].get(r.id), importedFrom: originOf(src, r) };
      for (const [field, [target, fallback]] of Object.entries(s.refs)) {
        if (rec[field] == null || rec[field] === '') continue;
        rec[field] = idMap[target]?.get(rec[field]) || fallback;
      }
      if (src === 'cos' && rec.kind === 'idea') rec = { ...rec, kind: 'ig', stage: 'idea' };
      put(s.coll, rec);
      added++;
    }
  }
  // 3. settings, only when this device has none yet
  if (src === 'pm') {
    for (const r of rows(json, 'meta')) if (PM_META.includes(r.id) && !get('meta', r.id)) put('meta', r);
  } else {
    const s = rows(json, 'settings')[0];
    if (s && !get('meta', 'cSettings')) {
      const { slots, pillars, formats, schemaVersion } = s;
      put('meta', { id: 'cSettings', slots, pillars, formats, schemaVersion });
    }
  }
  await flush();
  return { added, skipped };
}
