import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Segmented, Empty, copyText } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot } from '../ui/overlay.jsx';
import { PageHeader, BackBar, AddBtn, StagePill, InvoicePill, workspaceLabel } from '../ui/parts.jsx';
import { navigate, back } from '../lib/router.js';
import { get, put, patch, remove, uid, useStore } from '../lib/db.js';
import { fmtShort, fmtFull, isoOf } from '../lib/date.js';
import { fmtMoney } from '../lib/money.js';
import * as M from '../lib/model.js';
import { openProjectSheet } from './projects.jsx';
import { createInvoiceAndOpen } from './invoices.jsx';

export function openClientSheet(id, onSaved) { openOverlay((close) => <ClientSheet id={id} onSaved={onSaved} close={close} />, { kind: 'sheet' }); }
function ClientSheet({ id, onSaved, close }) {
  const ex = id ? get('clients', id) : null;
  const [c, setC] = useState(() => (ex ? { ...ex } : { name: '', pic: '', email: '', phone: '', address: '', notes: '' }));
  const set = (ch) => setC({ ...c, ...ch });
  const save = () => {
    const name = c.name.trim();
    if (!name) return toast('Add the client or brand name.', { tone: 'warn' });
    const dup = M.liveClients().find((x) => x.name.trim().toLowerCase() === name.toLowerCase() && x.id !== ex?.id);
    if (dup && !ex) { toast(dup.name + ' already exists. Using that one.'); close(); onSaved ? onSaved(dup) : navigate('/clients/' + dup.id); return; }
    const saved = put('clients', { ...c, name, id: ex?.id || uid(), archived: ex?.archived || false });
    toast(ex ? 'Client saved' : 'Client added');
    close();
    if (onSaved) onSaved(saved); else if (!ex) navigate('/clients/' + saved.id);
  };
  return (
    <>
      <SheetHead title={ex ? 'Edit client' : 'New client'} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Client or brand" htmlFor="cl-name"><TextInput id="cl-name" value={c.name} onInput={(v) => set({ name: v })} placeholder="e.g. Wardah" autoFocus={!ex} /></Field>
        <Field label="PIC / contact person" htmlFor="cl-pic"><TextInput id="cl-pic" value={c.pic} onInput={(v) => set({ pic: v })} placeholder="Name of your contact" /></Field>
        <div class="form-row">
          <Field label="Email" htmlFor="cl-email"><TextInput id="cl-email" type="email" inputMode="email" value={c.email} onInput={(v) => set({ email: v })} /></Field>
          <Field label="Phone / WhatsApp" htmlFor="cl-phone"><TextInput id="cl-phone" type="tel" inputMode="tel" value={c.phone} onInput={(v) => set({ phone: v })} placeholder="08…" /></Field>
        </div>
        <Field label="Billing address (optional)" htmlFor="cl-addr"><TextArea id="cl-addr" value={c.address} onInput={(v) => set({ address: v })} minRows={2} /></Field>
        <Field label="Notes" htmlFor="cl-notes"><TextArea id="cl-notes" value={c.notes} onInput={(v) => set({ notes: v })} placeholder="How they like to work, brand guidelines" /></Field>
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>{ex ? 'Save' : 'Add client'}</button></SheetFoot>
    </>
  );
}

export function ClientsPage() {
  useStore();
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  let list = M.liveClients().filter((c) => !!c.archived === arch);
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter((c) => [c.name, c.pic, c.email, c.phone].some((x) => (x || '').toLowerCase().includes(t))); }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div class="page narrow">
      <PageHeader title="Clients." actions={<AddBtn label="New client" onClick={() => openClientSheet()} />} />
      <div class="row gap-8">
        <div class="search-box grow"><Icon name="search" size={17} /><input id="cl-q" value={q} placeholder="Search name, PIC, email, phone" onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <Segmented options={[{ id: false, label: 'Active' }, { id: true, label: 'Archived' }]} value={arch} onChange={setArch} />
      </div>
      <section class="sheet-surface">
        {list.length ? <div class="list">{list.map((c) => {
          const active = M.liveProjects().filter((p) => p.clientId === c.id && !p.archived && p.stage !== 'completed').length;
          return (
            <a class="list-row clickable" href={'#/clients/' + c.id}>
              <span class="avatar-sm">{(c.name[0] || '?').toUpperCase()}</span>
              <div class="row-main"><div class="row-title">{c.name}</div><div class="row-meta">{[c.pic, active ? active + ' active project' + (active === 1 ? '' : 's') : 'No active projects'].filter(Boolean).join(' · ')}</div></div>
              <Icon name="chevronRight" size={16} class="muted" />
            </a>
          );
        })}</div> : <Empty icon="users" title={arch ? 'No archived clients' : q ? 'No clients match' : 'No clients yet'} action={!arch && !q && <button class="btn sm primary" onClick={() => openClientSheet()}>Add a client</button>} />}
      </section>
    </div>
  );
}

export function ClientDetail({ id }) {
  useStore();
  const c = get('clients', id);
  useEffect(() => { if (c) M.touchRecent('client', id); }, [id]);
  if (!c || c.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/clients')} /><Empty icon="users" title="Client not found" /></div>;
  const m = M.clientMoney(id);
  const cur = M.settings().defaultCurrency;
  const del = async () => {
    if (m.projects.length || m.invoices.length) { if (await confirmDialog({ title: 'This client has history', body: m.projects.length + ' project(s) and ' + m.invoices.length + ' invoice(s) point to ' + c.name + '. Archive instead?', confirmLabel: 'Archive client' })) { patch('clients', id, { archived: true }); toast('Archived'); } return; }
    if (await confirmDialog({ title: 'Delete ' + c.name + '?', body: 'No projects or invoices use this client. This cannot be undone.', confirmLabel: 'Delete', danger: true })) { remove('clients', id); toast('Client deleted'); back('/clients'); }
  };
  const wa = c.phone && /^[\d+\s-]+$/.test(c.phone) ? 'https://wa.me/' + c.phone.replace(/\D/g, '').replace(/^0/, '62') : '';
  return (
    <div class="page">
      <BackBar onBack={() => back('/clients')} right={<>
        <button class="btn sm outline" onClick={() => openClientSheet(id)}><Icon name="edit" size={15} />Edit</button>
        <button class="icon-btn ghost" aria-label="Client actions" onClick={(e) => openMenu(e, [
          { label: 'New project', icon: 'folder', onSelect: () => openProjectSheet({ clientId: id }) },
          { label: 'New invoice', icon: 'file', onSelect: () => createInvoiceAndOpen({ clientId: id }) },
          c.archived ? { label: 'Restore', icon: 'restore', onSelect: () => patch('clients', id, { archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => { patch('clients', id, { archived: true }); toast('Archived'); } },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
        ])}><Icon name="more" size={22} /></button>
      </>} />
      <PageHeader eyebrow={c.archived ? 'Client · archived' : 'Client'} title={c.name} />
      <div class="two-col">
        <div class="stack">
          <section class="block contact-card">
            <div class="block-head"><h2 class="block-title">Contact</h2></div>
            <dl class="kv">
              <dt>PIC</dt><dd>{c.pic || '—'}</dd>
              <dt>Email</dt><dd>{c.email ? <span class="row gap-6">{c.email}<button class="icon-btn ghost xs" aria-label="Copy email" onClick={() => copyText(c.email, 'Email copied')}><Icon name="copy" size={13} /></button></span> : '—'}</dd>
              <dt>Phone</dt><dd>{c.phone ? <span class="row gap-6 wrap"><span>{c.phone}</span><button class="icon-btn ghost xs" aria-label="Copy phone" onClick={() => copyText(c.phone, 'Number copied')}><Icon name="copy" size={13} /></button>{wa && <a class="btn xs outline" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</span> : '—'}</dd>
              <dt>Address</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.address || '—'}</dd>
            </dl>
            {c.notes && <div class="note-text">{c.notes}</div>}
          </section>
          <section class="block">
            <div class="block-head"><h2 class="block-title">Projects</h2><button class="btn xs outline" onClick={() => openProjectSheet({ clientId: id })}><Icon name="plus" size={14} />Project</button></div>
            {m.projects.length ? <div class="list">{m.projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((p) => <a class="list-row clickable" href={'#/projects/' + p.id}><span class={'swatch t-' + M.stageOf(p.stage).tone} /><div class="row-main"><div class="row-title">{p.name}</div><div class="row-meta">{workspaceLabel(p.workspace)}{p.deadlineDate ? ' · deadline ' + fmtShort(p.deadlineDate) : ''}{p.archived ? ' · archived' : ''}</div></div><StagePill stage={p.stage} sm /></a>)}</div> : <div class="quiet-note">No projects yet.</div>}
          </section>
        </div>
        <div class="stack">
          <section class="block">
            <div class="block-head"><h2 class="block-title">Invoices</h2><button class="btn xs outline" onClick={() => createInvoiceAndOpen({ clientId: id })}><Icon name="plus" size={14} />Invoice</button></div>
            {m.invoices.length ? <div class="list">{m.invoices.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((i) => { const k = M.calcInvoice(i); return <a class="list-row clickable" href={'#/invoices/' + i.id}><div class="row-main"><div class="row-title tnum">{i.number}</div><div class="row-meta">{fmtShort(i.date)} · {fmtMoney(k.total, i.currency)}</div></div><InvoicePill status={k.status} /></a>; })}</div> : <div class="quiet-note">No invoices yet.</div>}
            {m.invoices.length > 0 && <div class="sum-grid" style={{ marginTop: 12 }}><div><span>Invoiced</span><b class="tnum">{fmtMoney(m.invoiced, cur, { compact: true })}</b></div><div><span>Received</span><b class="tnum">{fmtMoney(m.paid, cur, { compact: true })}</b></div><div><span>Outstanding</span><b class="tnum">{fmtMoney(m.outstanding, cur, { compact: true })}</b></div></div>}
          </section>
          <div class="quiet-note">Added {fmtFull(isoOf(c.createdAt))}</div>
        </div>
      </div>
    </div>
  );
}
