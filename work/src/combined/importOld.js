// Bring data from the two old apps (project manager, Content OS) or a backup of this app into the shared store.
import { all, get, put, uid, importAll, COLLECTIONS, flush } from '../lib/db.js';
import { categories, addCategory, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, settings } from '../lib/model.js';
import { DEFAULT_NOTIFY, notifyPrefs } from '../content/model.js';

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
const SETTINGS_SKIP = ['id', 'createdAt', 'updatedAt', 'importedFrom'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Settings of a project manager file, field by field: a value comes over when this device still has the default for it.
 * Returns the record to store (null when nothing changes) and 'imported' | 'kept' | 'none'.
 */
function pmSettingsPlan(json, mapCategory) {
  const theirs = rows(json, 'meta').find((r) => r.id === 'pmSettings');
  if (!theirs) return { record: null, status: 'none' };
  const stored = get('meta', 'pmSettings');
  const local = settings();
  const incoming = { ...theirs };
  const cat = theirs.defaultCategory || theirs.defaultWorkspace;
  delete incoming.defaultWorkspace;
  if (cat) incoming.defaultCategory = mapCategory(cat);
  const next = { ...local };
  let applied = 0;
  for (const [k, v] of Object.entries(incoming)) {
    if (SETTINGS_SKIP.includes(k) || v === undefined) continue;
    if (k === 'business' && isObj(v)) {
      const biz = { ...local.business };
      for (const [bk, bv] of Object.entries(v)) {
        if (same(local.business[bk], DEFAULT_SETTINGS.business[bk]) && !same(bv, local.business[bk])) { biz[bk] = bv; applied++; }
      }
      next.business = biz;
    } else if (same(local[k], DEFAULT_SETTINGS[k]) && !same(v, local[k])) { next[k] = v; applied++; }
  }
  if (!stored) return { record: { ...next, id: 'pmSettings' }, status: 'imported' };
  return applied ? { record: { ...stored, ...next, id: 'pmSettings' }, status: 'imported' } : { record: null, status: 'kept' };
}

const byId = (list) => (Array.isArray(list) ? list.filter((x) => isObj(x) && x.id) : []);
const addMissing = (local, theirs) => {
  const have = new Set(local.map((x) => x.id));
  return [...local, ...theirs.filter((x) => !have.has(x.id))];
};

/** Content settings: entries whose id is missing here are added, local ones stay. Notify times fill while still at the defaults. */
function mergeContentSettings(s) {
  const cur = get('meta', 'cSettings');
  const { slots, pillars, formats, schemaVersion, notify } = s;
  if (!cur) {
    put('meta', { id: 'cSettings', slots, pillars, formats, schemaVersion, ...(isObj(notify) ? { notify: { ...DEFAULT_NOTIFY, ...notify } } : {}) });
    return;
  }
  const next = { ...cur };
  for (const [key, list] of [['slots', slots], ['pillars', pillars], ['formats', formats]]) {
    next[key] = addMissing(byId(cur[key]), byId(list));
  }
  if (isObj(notify) && same(notifyPrefs(), DEFAULT_NOTIFY)) next.notify = { ...DEFAULT_NOTIFY, ...notify };
  put('meta', next);
}

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
  const out = { source: src, counts, already };
  if (src === 'pm') out.settings = pmSettingsPlan(json, (id) => id).status;
  return out;
}

const keepNumericCreatedAt = (r) => {
  const { createdAt, updatedAt, ...rest } = r;
  return typeof createdAt === 'number' ? { ...rest, createdAt } : rest;
};

// Old category id -> id of the category with the same name on this device (added when missing).
function categoryMapper(json) {
  const stored = rows(json, 'meta').find((r) => r.id === 'pmCategories');
  const theirs = (stored && Array.isArray(stored.items) ? stored.items : DEFAULT_CATEGORIES).filter((c) => c && c.id);
  const cache = new Map();
  return (oldId) => {
    if (!oldId) return oldId;
    if (cache.has(oldId)) return cache.get(oldId);
    const src = theirs.find((c) => c.id === oldId);
    let id = oldId;
    if (src && src.name) {
      const name = String(src.name).trim().toLowerCase();
      const hit = categories({ includeArchived: true }).find((c) => String(c.name).trim().toLowerCase() === name);
      id = hit ? hit.id : addCategory(src.name, src.color || 'plain').id;
    }
    cache.set(oldId, id);
    return id;
  };
}

/** @returns {Promise<{ added: number, skipped: number, settings?: 'imported' | 'kept' | 'none' }>} settings is set for project manager files */
export async function importBackup(json) {
  const src = detectBackup(json);
  if (!src) throw new Error(NOT_BACKUP);

  if (src === 'work') {
    // Never overwrite: only records whose id is not on this device yet go through importAll.
    let added = 0, skipped = 0;
    const data = {};
    for (const c of COLLECTIONS) {
      data[c] = rows(json, c).filter((r) => {
        const exists = !!get(c, r.id);
        if (c !== 'meta') exists ? skipped++ : added++;
        return !exists;
      });
    }
    await importAll({ ...json, data }, { replace: false });
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
  const mapCategory = src === 'pm' ? categoryMapper(json) : null;
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
      if (s.coll === 'pmProjects') {
        const { workspace, ...rest } = rec;
        rec = { ...rest, categoryId: mapCategory(rec.categoryId || workspace) };
        if (!rec.categoryId) delete rec.categoryId;
      }
      if (src === 'cos' && rec.kind === 'idea') rec = { ...rec, kind: 'ig', stage: 'idea' };
      put(s.coll, rec);
      added++;
    }
  }
  // 3. settings. Project manager: field by field while this device still has the default. Content: merged by id.
  let settingsStatus;
  if (src === 'pm') {
    const sp = pmSettingsPlan(json, mapCategory);
    settingsStatus = sp.status;
    if (sp.record) put('meta', sp.record);
    for (const r of rows(json, 'meta')) {
      if (r.id === 'pmCategories' && !get('meta', r.id)) put('meta', r);
    }
  } else {
    const s = rows(json, 'settings')[0];
    if (s) mergeContentSettings(s);
  }
  await flush();
  return src === 'pm' ? { added, skipped, settings: settingsStatus } : { added, skipped };
}
