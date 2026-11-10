// Settings > Content: weekly Instagram slots, pillars and formats (content/model.js owns the rules).
import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, Select, ColorDots } from '../ui/kit.jsx';
import { toast, confirmDialog, openOverlay, SheetHead, SheetBody, SheetFoot } from '../ui/overlay.jsx';
import { useStore, uid } from '../lib/db.js';
import { WEEKDAYS } from '../content/time.js';
import { TINTS } from '../content/defaults.js';
import * as C from '../content/model.js';

export const Group = ({ title, hint, children }) => (
  <section class="block set-card">
    {title && <div class="set-card-head"><div class="block-title">{title}</div>{hint && <div class="set-card-hint">{hint}</div>}</div>}
    <div class="set-group">{children}</div>
  </section>
);

const noneOpt = { id: '', label: 'None' };
const tagOpts = (list) => [noneOpt, ...list.map((t) => ({ id: t.id, label: t.name }))];

function SlotSheet({ slot, isNew, close }) {
  const [d, setD] = useState(slot);
  const up = (ch) => setD({ ...d, ...ch });
  const save = () => {
    if (!d.name.trim()) return toast('Name the slot first.', { tone: 'warn' });
    C.saveSlot({ ...d, name: d.name.trim(), pillar: d.pillar || null, format: d.format || null });
    close(); toast(isNew ? 'Slot added' : 'Slot saved');
  };
  const del = async () => {
    if (!(await confirmDialog({ title: 'Delete ' + (slot.name || 'this slot') + '?', body: 'Posts that are not posted yet stay, they just leave the slot.', confirmLabel: 'Delete slot', danger: true }))) return;
    C.deleteSlot(slot.id); close(); toast('Slot deleted');
  };
  return (
    <>
      <SheetHead title={isNew ? 'New slot' : 'Edit slot'} onClose={close} />
      <SheetBody>
        <div class="form">
          <Field label="Name" htmlFor="sl-name"><TextInput id="sl-name" value={d.name} onInput={(v) => up({ name: v })} placeholder="e.g. Work post" autoFocus={isNew} onEnter={save} /></Field>
          <Field label="Day" htmlFor="sl-day"><Select id="sl-day" value={String(d.day)} onChange={(v) => up({ day: +v })} options={WEEKDAYS.map((n, i) => ({ id: String(i), label: n }))} /></Field>
          <Field label="Color"><ColorDots value={d.tint} colors={TINTS} onChange={(v) => up({ tint: v })} /></Field>
          <div class="field-pair">
            <Field label="Default pillar" htmlFor="sl-pil"><Select id="sl-pil" value={d.pillar || ''} onChange={(v) => up({ pillar: v || null })} options={tagOpts(C.pillars())} /></Field>
            <Field label="Default format" htmlFor="sl-fmt"><Select id="sl-fmt" value={d.format || ''} onChange={(v) => up({ format: v || null })} options={tagOpts(C.formats())} /></Field>
          </div>
        </div>
      </SheetBody>
      <SheetFoot>
        {!isNew && <button type="button" class="btn danger-soft" onClick={del}>Delete</button>}
        <button type="button" class="btn ghost" onClick={close}>Cancel</button>
        <button type="button" class="btn primary" onClick={save}>Save</button>
      </SheetFoot>
    </>
  );
}
const openSlot = (slot, isNew) => openOverlay((close) => <SlotSheet slot={slot} isNew={isNew} close={close} />, { kind: 'sheet' });

function TagList({ kind, label, hint }) {
  const [name, setName] = useState('');
  const list = C[kind]();
  const one = label.toLowerCase();
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (list.some((t) => t.name.toLowerCase() === n.toLowerCase())) return toast(n + ' already exists.', { tone: 'warn' });
    C.saveTag(kind, { id: uid(), name: n }); setName('');
  };
  const rename = (t, v) => { const n = v.trim(); if (n && n !== t.name) C.saveTag(kind, { ...t, name: n }); };
  const del = async (t) => {
    const n = C.tagUsage(kind, t.id);
    if (!(await confirmDialog({ title: 'Delete ' + t.name + '?', body: n ? n + ' post' + (n === 1 ? '' : 's') + ' use it and will have no ' + one + '.' : 'No posts use it.', confirmLabel: 'Delete', danger: true }))) return;
    C.deleteTag(kind, t.id); toast(label + ' deleted');
  };
  return (
    <Group title={label + 's'} hint={hint}>
      {list.map((t) => (
        <div class="cat-row" key={t.id}>
          <input aria-label={label + ' name'} defaultValue={t.name} onBlur={(e) => rename(t, e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <span class="muted tnum" style={{ fontSize: 13 }}>{C.tagUsage(kind, t.id)}</span>
          <button type="button" class="icon-btn ghost sm" aria-label={'Delete ' + t.name} onClick={() => del(t)}><Icon name="trash" size={15} /></button>
        </div>
      ))}
      <div class="row gap-8">
        <div class="grow"><TextInput value={name} onInput={setName} placeholder={'Add a ' + one} onEnter={add} /></div>
        <button type="button" class="btn sm outline" disabled={!name.trim()} onClick={add}>Add</button>
      </div>
    </Group>
  );
}

export function ContentSection() {
  useStore();
  const slots = C.slots();
  return (
    <>
      <Group title="Instagram slots" hint="Your weekly posting rhythm">
        {slots.map((s) => (
          <button type="button" class="cat-row" key={s.id} style={{ textAlign: 'left', width: '100%' }} onClick={() => openSlot({ ...s }, false)}>
            <span class={'cat-dot lg t-' + s.tint} aria-hidden="true" />
            <div class="grow">{s.name || 'Untitled slot'}<div class="muted" style={{ fontSize: 13 }}>{[WEEKDAYS[s.day], C.pillarName(s.pillar), C.formatName(s.format)].filter(Boolean).join(' · ')}</div></div>
            <Icon name="chevronRight" size={16} class="muted" />
          </button>
        ))}
        <div><button type="button" class="btn sm outline" onClick={() => openSlot(C.newSlot(), true)}><Icon name="plus" size={15} />Add slot</button></div>
      </Group>
      <TagList kind="pillars" label="Pillar" hint="What a post is about" />
      <TagList kind="formats" label="Format" hint="How a post is made" />
    </>
  );
}
