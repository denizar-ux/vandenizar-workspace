import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon.jsx';
import { dragHandlers, moveInArray } from '../lib/dnd.js';
import { uid } from '../lib/db.js';
import { moneyInput, parseMoney, CURRENCIES } from '../lib/money.js';
import { toast, openMenu, openOverlay } from './overlay.jsx';
import { t as _t, tn as _tn } from '../lib/i18n.js';

export function Field({ label, hint, children, class: c, htmlFor }) {
  return (
    htmlFor ? (
      <label class={'field ' + (c || '')} for={htmlFor}>
        {label && <span class="field-label">{label}</span>}
        {children}
        {hint && <span class="field-hint">{hint}</span>}
      </label>
    ) : (
      <div class={'field ' + (c || '')} role="group" aria-label={typeof label === 'string' ? label : undefined}>
        {label && <span class="field-label">{label}</span>}
        {children}
        {hint && <span class="field-hint">{hint}</span>}
      </div>
    )
  );
}

// Text input that commits on every keystroke but keeps the caret stable
export function TextInput({ value, onInput, placeholder, class: c, id, type = 'text', autoFocus, onEnter, inputMode, onBlur, maxLength }) {
  const ref = useRef();
  useEffect(() => { if (autoFocus && ref.current) setTimeout(() => ref.current && ref.current.focus(), 60); }, []);
  return <input ref={ref} id={id} class={'input ' + (c || '')} type={type} value={value ?? ''} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength}
    onInput={(e) => onInput && onInput(e.currentTarget.value)} onBlur={onBlur}
    onKeyDown={(e) => { if (e.key === 'Enter' && onEnter && !e.isComposing) { e.preventDefault(); onEnter(e.currentTarget.value); } }} />;
}

export function TextArea({ value, onInput, placeholder, class: c, id, minRows = 2, autoFocus }) {
  const ref = useRef();
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
  useLayoutEffect(fit, [value]);
  useEffect(() => { if (autoFocus && ref.current) setTimeout(() => ref.current && ref.current.focus(), 60); }, []);
  return <textarea ref={ref} id={id} rows={minRows} class={'input textarea ' + (c || '')} value={value ?? ''} placeholder={placeholder} onInput={(e) => { onInput(e.currentTarget.value); fit(); }} />;
}

export function Select({ value, onChange, options, id, class: c, placeholder }) {
  return (
    <div class={'select-wrap ' + (c || '')}>
      <select id={id} class="input select" value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => typeof o === 'string' ? <option value={o}>{_t(o)}</option> : <option value={o.id ?? o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <Icon name="chevronDown" size={16} class="select-caret" />
    </div>
  );
}

export function DateInput({ value, onChange, id, clearable = true }) {
  return (
    <div class="date-wrap">
      <input id={id} class={'input date ' + (value ? '' : 'empty')} type="date" value={value || ''} onChange={(e) => onChange(e.currentTarget.value)} />
      {clearable && value && <button type="button" class="date-clear" aria-label={_t('Clear date')} onClick={() => onChange('')}><Icon name="x" size={14} /></button>}
    </div>
  );
}
export function TimeInput({ value, onChange, id }) {
  return (
    <div class="date-wrap">
      <input id={id} class={'input time ' + (value ? '' : 'empty')} type="time" value={value || ''} onChange={(e) => onChange(e.currentTarget.value)} />
      {value && <button type="button" class="date-clear" aria-label={_t('Clear time')} onClick={() => onChange('')}><Icon name="x" size={14} /></button>}
    </div>
  );
}

export function MoneyInput({ value, currency = 'IDR', onChange, id, placeholder = '0' }) {
  const [text, setText] = useState(moneyInput(value, currency));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value ? moneyInput(value, currency) : ''); }, [value, currency]);
  return (
    <div class="money-wrap">
      <span class="money-sym">{CURRENCIES[currency]?.symbol || currency}</span>
      <input id={id} class="input money" inputMode="decimal" value={text} placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onInput={(e) => { const t = e.currentTarget.value; setText(t); const v = parseMoney(t, currency); if (!isNaN(v)) onChange(v); }}
        onBlur={() => { focused.current = false; const v = parseMoney(text, currency); if (isNaN(v)) { toast(_t('That amount looks off. Use digits, like 1500000 or 1,5jt.'), { tone: 'warn' }); setText(moneyInput(value, currency)); } else setText(v ? moneyInput(v, currency) : ''); }} />
    </div>
  );
}

export function NumberInput({ value, onChange, id, min = 0, step = 1, placeholder }) {
  return <input id={id} class="input" type="number" inputMode="decimal" min={min} step={step} value={value ?? ''} placeholder={placeholder} onInput={(e) => { const v = e.currentTarget.value; onChange(v === '' ? '' : Number(v)); }} />;
}

export function Chips({ options, value, onChange, multi = false, class: c, size, allowEmpty = false }) {
  const sel = multi ? new Set(value || []) : null;
  return (
    <div class={'chips ' + (c || '') + (size ? ' ' + size : '')} role="group">
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.id;
        const label = typeof o === 'string' ? _t(o) : o.label;
        const on = multi ? sel.has(id) : value === id;
        return (
          <button type="button" class={'chip ' + (on ? 'on' : '')} aria-pressed={on} onClick={() => {
            if (multi) { const n = new Set(sel); on ? n.delete(id) : n.add(id); onChange([...n]); } else onChange(on && allowEmpty ? '' : id);
          }}>
            {o.dot && <span class="dot" style={{ background: o.dot }} />}{label}{o.count != null && <span class="chip-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange, class: c }) {
  return (
    <div class={'seg ' + (c || '')} role="tablist">
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={value === o.id} class={'seg-btn ' + (value === o.id ? 'on' : '')} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={16} />}<span>{o.label}</span>{o.count != null && <span class="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ pct, tone, thin }) {
  return <div class={'progress ' + (thin ? 'thin ' : '') + (tone || '')} role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} /></div>;
}
export function Ring({ pct, size = 44, stroke = 4, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div class="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" stroke-width={stroke} stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - Math.min(100, pct) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span class="ring-label">{label ?? `${Math.round(pct)}%`}</span>
    </div>
  );
}

export function Empty({ icon = 'spark', title, children, action }) {
  return (
    <div class="empty">
      <div class="empty-ic"><Icon name={icon} size={22} /></div>
      <div class="empty-title">{title}</div>
      {children && <div class="empty-text">{children}</div>}
      {action}
    </div>
  );
}

export function Check({ checked, onChange, label, size = 'md', tone }) {
  return (
    <button type="button" class={'check ' + size + (checked ? ' on' : '') + (tone ? ' ' + tone : '')} role="checkbox" aria-checked={!!checked} aria-label={label || (checked ? _t('Mark not done') : _t('Mark done'))} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}>
      <Icon name="check" size={size === 'sm' ? 12 : 14} stroke={2.6} />
    </button>
  );
}

// Checklist editor: used for shotlist, production checklist, deliverables
export async function fileToImage(file, max = 1400) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.84);
}
export function openImagePreview(src, { title, onReplace, onRemove } = {}) {
  openOverlay((close) => (
    <div class="lightbox">
      <div class="lightbox-bar">
        <div class="lightbox-title ellipsis">{title}</div>
        <div class="row gap-6">
          {onReplace && <button class="btn sm" onClick={() => { close(); onReplace(); }}>{_t('Replace')}</button>}
          {onRemove && <button class="btn sm danger-soft" onClick={() => { close(); onRemove(); }}>{_t('Remove')}</button>}
          <button class="icon-btn sm" aria-label={_t('Close')} onClick={() => close()}><Icon name="x" size={16} /></button>
        </div>
      </div>
      <img src={src} alt={title || 'Preview'} onClick={() => close()} />
    </div>
  ), { kind: 'dialog', wide: true });
}
export function ChecklistEditor({ items = [], onChange, placeholder = _t('Add item'), showProgress = true, idPrefix = 'cl', withImages = false }) {
  const fileRef = useRef();
  const pickFor = useRef(null);
  const pickImage = (id) => { pickFor.current = id; fileRef.current && fileRef.current.click(); };
  const [draft, setDraft] = useState('');
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const set = (id, ch) => onChange(items.map((i) => (i.id === id ? { ...i, ...ch } : i)));
  const add = () => { const t = draft.trim(); if (!t) return; onChange([...items, { id: uid(), text: t, done: false }]); setDraft(''); };
  const listKey = useRef('cl-' + uid()).current;
  return (
    <div class="checklist">
      {showProgress && items.length > 0 && (
        <div class="cl-progress"><Progress pct={pct} thin /><span class="muted tnum">{done}/{items.length}</span></div>
      )}
      <div class="cl-items" data-drop={listKey}>
        {items.map((it) => (
          <div class={'cl-item ' + (it.done ? 'done' : '')} key={it.id} {...dragHandlers(it.id, ({ to, index }) => { if (to === listKey) onChange(moveInArray(items, it.id, index)); }, { accept: (k) => k === listKey })}>
            <span class="grip" data-drag-handle aria-label={_t('Drag to reorder')}><Icon name="grip" size={16} /></span>
            <Check checked={it.done} onChange={(v) => set(it.id, { done: v })} size="sm" />
            <input class="cl-text" id={`${idPrefix}-${it.id}`} value={it.text} onInput={(e) => set(it.id, { text: e.currentTarget.value })} aria-label={_t('Item text')} />
            {withImages && (it.image
              ? <button class="cl-thumb" aria-label={_t('Preview image for {0}', [it.text])} onClick={() => openImagePreview(it.image, { title: it.text, onReplace: () => pickImage(it.id), onRemove: () => set(it.id, { image: '' }) })}><img src={it.image} alt="" /></button>
              : <button class="icon-btn ghost sm" aria-label={_t('Add image to {0}', [it.text])} title={_t('Add reference image')} onClick={() => pickImage(it.id)}><Icon name="image" size={16} /></button>)}
            <button class="icon-btn ghost sm cl-del" aria-label={_t('Remove item')} onClick={() => onChange(items.filter((i) => i.id !== it.id))}><Icon name="x" size={15} /></button>
          </div>
        ))}
      </div>
      {withImages && <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.currentTarget.files[0]; e.currentTarget.value = '';
        if (!f || !pickFor.current) return;
        try { const img = await fileToImage(f); onChange(items.map((i) => (i.id === pickFor.current ? { ...i, image: img } : i))); toast(_t('Image added')); }
        catch { toast(_t('Could not read that image. Try a JPG or PNG.'), { tone: 'warn' }); }
      }} />}
      <div class="cl-add">
        <Icon name="plus" size={16} class="muted" />
        <input class="cl-text" id={`${idPrefix}-new`} value={draft} placeholder={placeholder} onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} />
        {draft.trim() && <button class="btn sm soft" onClick={add}>{_t('Add')}</button>}
      </div>
    </div>
  );
}

export function safeUrl(u) {
  const s = (u || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+/.test(s)) return 'https://' + s;
  return '';
}
export function hostOf(u) { try { return new URL(safeUrl(u)).hostname.replace(/^www\./, ''); } catch { return ''; } }

// Links editor (content links, project links)
export function LinksEditor({ links = [], onChange, types, idPrefix = 'ln' }) {
  const [draft, setDraft] = useState({ label: '', url: '', type: types ? types[0].id : '' });
  const listKey = useRef('ln-' + uid()).current;
  const set = (id, ch) => onChange(links.map((l) => (l.id === id ? { ...l, ...ch } : l)));
  const add = () => {
    const url = draft.url.trim();
    if (!url) return toast(_t('Paste a URL first.'));
    onChange([...links, { id: uid(), label: draft.label.trim(), url, type: draft.type }]);
    setDraft({ label: '', url: '', type: draft.type });
  };
  return (
    <div class="links">
      <div data-drop={listKey} class="links-list">
        {links.map((l) => {
          const href = safeUrl(l.url);
          return (
            <div class="link-row" key={l.id} {...dragHandlers(l.id, ({ to, index }) => { if (to === listKey) onChange(moveInArray(links, l.id, index)); }, { accept: (k) => k === listKey })}>
              <span class="grip" data-drag-handle aria-label={_t('Drag to reorder')}><Icon name="grip" size={16} /></span>
              <div class="link-fields">
                <div class="row gap-6">
                  {types && (l.type && l.type !== types[0].id
                    ? <button class="badge t-accent" style={{ height: 30 }} onClick={(e) => openMenu(e, types.map((t) => ({ label: t.label, active: t.id === l.type, onSelect: () => set(l.id, { type: t.id }) })), { title: _t('Link type') })}>{types.find((t) => t.id === l.type)?.label || l.type}</button>
                    : <button class="icon-btn soft sm" aria-label={_t('Set link type')} title={_t('Set link type')} onClick={(e) => openMenu(e, types.map((t) => ({ label: t.label, active: t.id === (l.type || types[0].id), onSelect: () => set(l.id, { type: t.id }) })), { title: _t('Link type') })}><Icon name="link" size={15} /></button>)}
                  <input class="input mini grow" id={`${idPrefix}-l-${l.id}`} value={l.label} placeholder={hostOf(l.url) || _t('Label')} onInput={(e) => set(l.id, { label: e.currentTarget.value })} aria-label={_t('Link label')} />
                </div>
                <input class="input mini url" id={`${idPrefix}-u-${l.id}`} value={l.url} placeholder={_t('https://')} onInput={(e) => set(l.id, { url: e.currentTarget.value })} aria-label={_t('URL')} />
              </div>
              <div class="link-actions">
                {href ? <a class="icon-btn soft sm" href={href} target="_blank" rel="noopener noreferrer" aria-label={_t('Open link')}><Icon name="external" size={15} /></a> : <span class="icon-btn sm disabled"><Icon name="external" size={15} /></span>}
                <button class="icon-btn ghost sm" aria-label={_t('Remove link')} onClick={() => onChange(links.filter((x) => x.id !== l.id))}><Icon name="trash" size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <div class="link-add">
        <div class="row gap-6 wrap-sm">
          {types && <select class="input mini" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.currentTarget.value })} aria-label={_t('New link type')}>{types.map((t) => <option value={t.id}>{t.label}</option>)}</select>}
          <input class="input mini grow" id={`${idPrefix}-new-label`} placeholder={_t('Label (optional)')} value={draft.label} onInput={(e) => setDraft({ ...draft, label: e.currentTarget.value })} />
        </div>
        <div class="row gap-6">
          <input class="input mini grow" id={`${idPrefix}-new-url`} placeholder={_t('Paste a link')} inputMode="url" value={draft.url} onInput={(e) => setDraft({ ...draft, url: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <button class="btn sm soft" onClick={add}>{_t('Add')}</button>
        </div>
      </div>
    </div>
  );
}

// Minimal rich text: bold, italic, bullet, numbered, checklist. Stored as sanitized HTML.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'P', 'DIV', 'BR', 'U', 'SPAN']);
export function sanitizeHtml(html) {
  if (!html) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 1) {
        if (!ALLOWED.has(ch.tagName)) { ch.replaceWith(...ch.childNodes); continue; }
        for (const a of [...ch.attributes]) {
          if (a.name === 'class' && (a.value === 'checklist' || a.value === 'checked')) continue;
          if (a.name === 'data-checked') continue;
          ch.removeAttribute(a.name);
        }
        walk(ch);
      } else if (ch.nodeType !== 3) ch.remove();
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
export const htmlToText = (html) => { if (!html) return ''; const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; };

export function RichText({ value, onChange, placeholder, tools = ['bold', 'italic', 'ul', 'ol', 'checkbox'], id, minHeight = 120 }) {
  const ref = useRef();
  const last = useRef(value);
  // Only push outside changes into the editor. While typing, the DOM is the source of truth;
  // effects can run late, so never overwrite the element when it has focus or already matches.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === last.current) return;
    if (document.activeElement === el) return;
    if (sanitizeHtml(el.innerHTML) !== (value || '')) el.innerHTML = sanitizeHtml(value || '');
    last.current = value;
  }, [value]);
  useEffect(() => { if (ref.current) ref.current.innerHTML = sanitizeHtml(value || ''); }, []);
  const emit = () => { const h = sanitizeHtml(ref.current.innerHTML); last.current = h; onChange(h); };
  const cmd = (name) => {
    ref.current.focus();
    if (name === 'checkbox') {
      document.execCommand('insertUnorderedList');
      const sel = window.getSelection();
      let n = sel && sel.anchorNode;
      while (n && n !== ref.current && n.nodeName !== 'UL') n = n.parentNode;
      if (n && n.nodeName === 'UL') { if (n.classList.contains('checklist')) n.classList.remove('checklist'); else n.classList.add('checklist'); }
    } else document.execCommand({ bold: 'bold', italic: 'italic', ul: 'insertUnorderedList', ol: 'insertOrderedList' }[name]);
    emit();
  };
  const onClick = (e) => {
    const li = e.target.closest && e.target.closest('ul.checklist > li');
    if (!li) return;
    const r = li.getBoundingClientRect();
    if (e.clientX - r.left < 26) { li.classList.toggle('checked'); emit(); e.preventDefault(); }
  };
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); cmd('bold'); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); cmd('italic'); }
  };
  const onPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  };
  const names = { bold: 'Bold', italic: 'Italic', ul: 'Bullet list', ol: 'Numbered list', checkbox: 'Checklist' };
  return (
    <div class="rte">
      <div class="rte-bar" role="toolbar">
        {tools.map((t) => <button type="button" class="rte-btn" title={names[t]} aria-label={names[t]} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(t)}><Icon name={t} size={17} /></button>)}
      </div>
      <div ref={ref} id={id} class="rte-area" contentEditable="true" data-placeholder={placeholder} style={{ minHeight }} onInput={emit} onClick={onClick} onKeyDown={onKeyDown} onPaste={onPaste} role="textbox" aria-multiline="true" />
    </div>
  );
}

export function TagInput({ value = [], onChange, placeholder = _t('Add tag'), id }) {
  const [d, setD] = useState('');
  const add = () => { const t = d.trim().replace(/,$/, ''); if (t && !value.includes(t)) onChange([...value, t]); setD(''); };
  return (
    <div class="tags-input">
      {value.map((t) => <span class="tag">{t}<button aria-label={_t('Remove {0}', [t])} onClick={() => onChange(value.filter((x) => x !== t))}><Icon name="x" size={12} /></button></span>)}
      <input id={id} value={d} placeholder={placeholder} onInput={(e) => { const v = e.currentTarget.value; if (v.endsWith(',')) { setD(v); setTimeout(add); } else setD(v); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Backspace' && !d && value.length) onChange(value.slice(0, -1)); }} onBlur={add} />
    </div>
  );
}

// Inline list editor for settings (rename, reorder, delete)
export function ListEditor({ items, onChange, placeholder = _t('Add'), idPrefix = 'le', min = 0 }) {
  const [d, setD] = useState('');
  const key = useRef('le-' + uid()).current;
  const objs = items.map((t, i) => ({ id: i + ':' + t, t, i }));
  return (
    <div class="list-editor">
      <div data-drop={key}>
        {objs.map((o) => (
          <div class="le-row" key={o.id} {...dragHandlers(o.id, ({ to, index }) => { if (to !== key) return; const arr = moveInArray(objs, o.id, index); onChange(arr.map((x) => x.t)); }, { accept: (k) => k === key })}>
            <span class="grip" data-drag-handle><Icon name="grip" size={16} /></span>
            <input class="cl-text" id={`${idPrefix}-${o.i}`} value={o.t} onChange={(e) => { const v = e.currentTarget.value.trim(); if (!v) return; const n = [...items]; n[o.i] = v; onChange(n); }} aria-label={_t('Rename')} />
            <button class="icon-btn ghost sm" aria-label={_t('Remove {0}', [o.t])} disabled={items.length <= min} onClick={() => onChange(items.filter((_, i) => i !== o.i))}><Icon name="x" size={15} /></button>
          </div>
        ))}
      </div>
      <div class="cl-add">
        <Icon name="plus" size={16} class="muted" />
        <input class="cl-text" id={`${idPrefix}-new`} value={d} placeholder={placeholder} onInput={(e) => setD(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = d.trim(); if (v && !items.includes(v)) onChange([...items, v]); setD(''); } }} />
        {d.trim() && <button class="btn sm soft" onClick={() => { const v = d.trim(); if (v && !items.includes(v)) onChange([...items, v]); setD(''); }}>{_t('Add')}</button>}
      </div>
    </div>
  );
}

export function copyText(text, msg = _t('Copied')) {
  const done = () => toast(msg);
  try {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text) && done());
  } catch { if (fallbackCopy(text)) done(); }
}
function fallbackCopy(text) {
  try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}

// Debounced auto-save hook for draft-style editors
export function useDebounced(fn, ms = 400) {
  const t = useRef();
  useEffect(() => () => clearTimeout(t.current), []);
  return (...args) => { clearTimeout(t.current); t.current = setTimeout(() => fn(...args), ms); };
}

// Content links: several reference links, one final video link, one additional link
export function ContentLinks({ links = [], onChange, idPrefix = 'cl' }) {
  const refs = links.filter((l) => (l.type || 'reference') === 'reference');
  const final = links.find((l) => l.type === 'final');
  const extra = links.find((l) => l.type === 'additional');
  const others = links.filter((l) => l !== final && l !== extra && (l.type || 'reference') !== 'reference');
  const write = (nextRefs, nextFinal, nextExtra) => onChange([...nextRefs, ...(nextFinal && nextFinal.url ? [nextFinal] : []), ...(nextExtra && nextExtra.url ? [nextExtra] : []), ...others]);
  const setRef = (id, url) => write(refs.map((r) => (r.id === id ? { ...r, url } : r)), final, extra);
  const addRef = () => write([...refs, { id: uid(), type: 'reference', label: '', url: '' }], final, extra);
  const single = (type, cur, url) => { const v = { id: cur?.id || uid(), type, label: '', url }; type === 'final' ? write(refs, v, extra) : write(refs, final, v); };
  const OpenBtn = ({ url }) => { const h = safeUrl(url); return h ? <a class="icon-btn soft sm" href={h} target="_blank" rel="noopener noreferrer" aria-label={_t('Open link')}><Icon name="external" size={15} /></a> : <span class="icon-btn sm disabled" aria-hidden="true"><Icon name="external" size={15} /></span>; };
  return (
    <div class="clinks">
      <div class="clinks-head"><span class="field-label">{_t('Reference links')}</span><button class="btn xs soft" onClick={addRef}><Icon name="plus" size={14} />{_t('Add link')}</button></div>
      {refs.map((r, i) => (
        <div class="row gap-6">
          <input class="input mini grow" id={`${idPrefix}-ref-${r.id}`} value={r.url} placeholder={_t('https://')} inputMode="url" onInput={(e) => setRef(r.id, e.currentTarget.value)} aria-label={_t('Reference link {0}', [i + 1])} />
          <OpenBtn url={r.url} />
          <button class="icon-btn sm del" aria-label={_t('Remove link')} onClick={() => write(refs.filter((x) => x.id !== r.id), final, extra)}><Icon name="trash" size={15} /></button>
        </div>
      ))}
      {!refs.length && <button class="slot-empty" style={{ padding: 10 }} onClick={addRef}><Icon name="plus" size={16} />{_t('Add a reference link')}</button>}
      <span class="field-label" style={{ marginTop: 6 }}>{_t('Final video link')}</span>
      <div class="row gap-6">
        <input class="input mini grow" id={`${idPrefix}-final`} value={final?.url || ''} placeholder={_t('https://')} inputMode="url" onInput={(e) => single('final', final, e.currentTarget.value)} aria-label={_t('Final video link')} />
        <OpenBtn url={final?.url} />
      </div>
      <span class="field-label" style={{ marginTop: 6 }}>{_t('Additional link')}</span>
      <div class="row gap-6">
        <input class="input mini grow" id={`${idPrefix}-extra`} value={extra?.url || ''} placeholder={_t('https://')} inputMode="url" onInput={(e) => single('additional', extra, e.currentTarget.value)} aria-label={_t('Additional link')} />
        <OpenBtn url={extra?.url} />
      </div>
    </div>
  );
}

// On/off switch with a visible label for screen readers.
export function Toggle({ checked, onChange, label, id }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={!!checked} aria-label={label} class={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}><span /></button>
  );
}
// Pastel color picker for categories.
export function ColorDots({ value, onChange, colors, label = 'Color' }) {
  return (
    <div class="color-dots" role="radiogroup" aria-label={label}>
      {colors.map((c) => <button type="button" role="radio" aria-checked={value === c} aria-label={c} class={'color-dot t-' + c + (value === c ? ' on' : '')} onClick={() => onChange(c)} />)}
    </div>
  );
}
