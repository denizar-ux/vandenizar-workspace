import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Select, MoneyInput, Segmented, Empty, ListEditor, Toggle } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot } from '../ui/overlay.jsx';
import { PageHeader, AddBtn, CategoryField } from '../ui/parts.jsx';
import { WorkflowPicker } from './projects.jsx';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { CURRENCIES } from '../lib/money.js';
import * as M from '../lib/model.js';

const KINDS = [{ id: 'project', label: 'Projects' }, { id: 'items', label: 'Line items' }, { id: 'terms', label: 'Terms & notes' }];

export function TemplatesPage() {
  useStore();
  const [kind, setKind] = useState('project');
  const [arch, setArch] = useState(false);
  const list = all('templates').filter((t) => t.kind === kind && !!t.archived === arch).sort((a, b) => a.name.localeCompare(b.name));
  const sub = (t) => t.kind === 'project' ? [M.categoryOf(t.data?.categoryId || t.data?.workspace).name, M.workflowLabel(t.data?.workflow || 'general'), (t.data?.deliverables || []).length + ' deliverables', (t.data?.tasks || []).length + ' tasks'].join(' · ')
    : t.kind === 'items' ? (t.data?.items || []).length + ' line item' + ((t.data?.items || []).length === 1 ? '' : 's') : (t.data?.terms || '').slice(0, 80);
  return (
    <div class="page narrow">
      <PageHeader title="Templates." sub="Reusable starts for projects and invoices. Changing a template never changes what was made from it." actions={<AddBtn label="New template" onClick={() => openTemplateSheet(null, kind)} />} />
      <div class="row gap-8 wrap"><Segmented options={KINDS} value={kind} onChange={setKind} /><Segmented options={[{ id: false, label: 'Active' }, { id: true, label: 'Archived' }]} value={arch} onChange={setArch} /></div>
      <section class="sheet-surface">
        {list.length ? <div class="list">{list.map((t) => (
          <div class="list-row">
            <button class="row-main" style={{ textAlign: 'left' }} onClick={() => openTemplateSheet(t.id)}><div class="row-title">{t.name}</div><div class="row-meta ellipsis">{sub(t)}</div></button>
            <button class="icon-btn ghost sm" aria-label="Template actions" onClick={(e) => openMenu(e, [
              { label: 'Edit', icon: 'edit', onSelect: () => openTemplateSheet(t.id) },
              { label: 'Duplicate', icon: 'copy', onSelect: () => { put('templates', { ...JSON.parse(JSON.stringify(t)), id: uid(), name: t.name + ' (copy)', createdAt: undefined }); toast('Duplicated'); } },
              t.archived ? { label: 'Restore', icon: 'restore', onSelect: () => patch('templates', t.id, { archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => patch('templates', t.id, { archived: true }) },
              { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Delete "' + t.name + '"?', body: 'Projects and invoices made from it stay as they are.', confirmLabel: 'Delete', danger: true })) { remove('templates', t.id); toast('Template deleted'); } } },
            ], { title: t.name })}><Icon name="more" /></button>
          </div>
        ))}</div> : <Empty icon="template" title="No templates here" action={!arch && <button class="btn sm primary" onClick={() => openTemplateSheet(null, kind)}>New template</button>}>{kind === 'project' ? 'Save the deliverables and first tasks you repeat on every job.' : kind === 'items' ? 'Save line items you bill often, like a reel package.' : 'Save payment terms you reuse, like a 50% DP rule.'}</Empty>}
      </section>
    </div>
  );
}

export function openTemplateSheet(id, kind) { openOverlay((close) => <TemplateSheet id={id} kind={kind} close={close} />, { kind: 'sheet' }); }
function TemplateSheet({ id, kind, close }) {
  const s = M.settings();
  const ex = id ? get('templates', id) : null;
  const k = ex?.kind || kind;
  const [t, setT] = useState(() => (ex ? JSON.parse(JSON.stringify(ex)) : { name: '', kind: k, archived: false, data: k === 'project' ? { categoryId: s.defaultCategory, workflow: s.defaultWorkflow || 'general', billing: s.defaultCategory === 'freelance', deliverables: [...s.defaultDeliverables], tasks: [] } : k === 'items' ? { currency: s.defaultCurrency, items: [{ id: uid(), desc: '', qty: 1, rate: 0 }] } : { terms: s.defaultTermsText, notes: '' } }));
  const setD = (ch) => setT({ ...t, data: { ...t.data, ...ch } });
  const save = () => { if (!t.name.trim()) return toast('Name the template.', { tone: 'warn' }); put('templates', { ...t, id: ex?.id || uid(), name: t.name.trim() }); toast('Template saved'); close(); };
  return (
    <>
      <SheetHead title={ex ? 'Edit template' : 'New template'} sub={KINDS.find((x) => x.id === k).label} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Template name" htmlFor="tp-name"><TextInput id="tp-name" value={t.name} onInput={(v) => setT({ ...t, name: v })} placeholder={k === 'project' ? 'e.g. Product film' : k === 'items' ? 'e.g. Reel package' : 'e.g. 50% DP terms'} autoFocus={!ex} /></Field>
        {k === 'project' && <>
          <CategoryField id="tp-cat" value={t.data.categoryId || t.data.workspace || s.defaultCategory} onChange={(v) => setD({ categoryId: v })} />
          <Field label="Workflow"><WorkflowPicker value={t.data.workflow || 'general'} onChange={(v) => setD({ workflow: v })} /></Field>
          <div class="toggle-row"><div><div class="tr-title">Billing</div><div class="tr-sub">Projects from this template need invoices.</div></div><Toggle checked={typeof t.data.billing === 'boolean' ? t.data.billing : (t.data.categoryId || t.data.workspace) === 'freelance'} label="Billing" onChange={(v) => setD({ billing: v })} /></div>
          <Field label="Deliverables"><ListEditor items={t.data.deliverables || []} onChange={(v) => setD({ deliverables: v })} placeholder="Add deliverable" idPrefix="tp-dv" /></Field>
          <Field label="Tasks created with the project"><ListEditor items={t.data.tasks || []} onChange={(v) => setD({ tasks: v })} placeholder="e.g. Send moodboard" idPrefix="tp-tk" /></Field>
        </>}
        {k === 'items' && <>
          <Field label="Currency" htmlFor="tp-cur"><Select id="tp-cur" value={t.data.currency} onChange={(v) => setD({ currency: v })} options={Object.keys(CURRENCIES)} /></Field>
          {t.data.items.map((it) => (
            <div class="tp-item">
              <input class="input" value={it.desc} placeholder="Description" onInput={(e) => setD({ items: t.data.items.map((x) => (x.id === it.id ? { ...x, desc: e.currentTarget.value } : x)) })} aria-label="Description" />
              <div class="row gap-6">
                <input class="input tnum" style={{ width: 80 }} type="number" min="0" value={it.qty} onInput={(e) => setD({ items: t.data.items.map((x) => (x.id === it.id ? { ...x, qty: +e.currentTarget.value || 0 } : x)) })} aria-label="Quantity" />
                <div class="grow"><MoneyInput value={it.rate} currency={t.data.currency} onChange={(v) => setD({ items: t.data.items.map((x) => (x.id === it.id ? { ...x, rate: v } : x)) })} /></div>
                <button class="icon-btn ghost sm" aria-label="Remove" onClick={() => setD({ items: t.data.items.filter((x) => x.id !== it.id) })}><Icon name="x" size={15} /></button>
              </div>
            </div>
          ))}
          <button class="btn sm outline" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ items: [...t.data.items, { id: uid(), desc: '', qty: 1, rate: 0 }] })}><Icon name="plus" size={15} />Add item</button>
        </>}
        {k === 'terms' && <>
          <Field label="Terms" htmlFor="tp-terms"><TextArea id="tp-terms" value={t.data.terms} onInput={(v) => setD({ terms: v })} /></Field>
          <Field label="Notes" htmlFor="tp-notes"><TextArea id="tp-notes" value={t.data.notes} onInput={(v) => setD({ notes: v })} /></Field>
        </>}
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>Save template</button></SheetFoot>
    </>
  );
}
