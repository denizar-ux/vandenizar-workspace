import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon.jsx';

// ---------- global overlay stack (sheets, dialogs, menus) ----------
let overlays = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());
let seq = 0;
export function openOverlay(render, opts = {}) {
  const id = ++seq;
  const close = (val) => {
    overlays = overlays.filter((o) => o.id !== id);
    emit();
    opts.onClose && opts.onClose(val);
  };
  overlays = [...overlays, { id, render, opts, close }];
  emit();
  return close;
}
export const closeAll = () => { overlays.forEach((o) => o.opts.onClose && o.opts.onClose()); overlays = []; emit(); };

export function useMedia(q) {
  const [m, set] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => set(mq.matches); mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f); return () => (mq.removeEventListener ? mq.removeEventListener('change', f) : mq.removeListener(f)); }, [q]);
  return m;
}
export const DESKTOP_Q = '(min-width: 960px)';
export const isDesktopNow = () => typeof matchMedia !== 'undefined' && matchMedia(DESKTOP_Q).matches;

export function Overlays() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('overlay-open', overlays.some((o) => o.opts.kind !== 'menu' || !isDesktopNow()));
    const onKey = (e) => { if (e.key === 'Escape' && overlays.length) { const top = overlays[overlays.length - 1]; if (!top.opts.persistent) top.close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <>
      {overlays.map((o, i) => (
        <OverlayFrame key={o.id} o={o} top={i === overlays.length - 1} />
      ))}
    </>
  );
}

function OverlayFrame({ o }) {
  const kind = o.opts.kind || 'sheet';
  if (kind === 'menu' && isDesktopNow() && o.opts.anchor) return <Popover o={o} />;
  return <PanelFrame o={o} kind={kind} />;
}
function PanelFrame({ o, kind }) {
  const desktop = isDesktopNow();
  const ref = useRef();
  const drag = useRef(null);
  // swipe down to close on phones
  const onTouchStart = (e) => {
    if (desktop) return;
    const sc = ref.current?.querySelector('.sheet-body');
    if (sc && sc.scrollTop > 0 && !e.target.closest('.sheet-grab')) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e) => {
    if (!drag.current) return;
    const dy = e.touches[0].clientY - drag.current.y;
    drag.current.dy = dy;
    if (dy > 0 && ref.current) ref.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    if (ref.current) ref.current.style.transform = '';
    if (dy > 110 && !o.opts.persistent) o.close();
  };
  return (
    <div class={`ov ov-${kind} ${desktop ? 'is-desktop' : 'is-mobile'}`} style={{ zIndex: 100 + o.id }}>
      <div class="ov-scrim" onClick={() => !o.opts.persistent && o.close()} />
      <div class={`ov-panel ov-panel-${kind} ${o.opts.wide ? 'wide' : ''}`} ref={ref} role="dialog" aria-modal="true" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {!desktop && kind !== 'dialog' && <div class="sheet-grab" aria-hidden="true"><span /></div>}
        {o.render(o.close)}
      </div>
    </div>
  );
}

function Popover({ o }) {
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const a = o.opts.anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(window.innerWidth - w - 12, Math.max(12, a.right - w));
    let topv = a.bottom + 6;
    if (topv + h > window.innerHeight - 12) topv = Math.max(12, a.top - h - 6);
    setPos({ left, top: topv });
    const off = (e) => { if (!el.contains(e.target)) o.close(); };
    const t = setTimeout(() => window.addEventListener('pointerdown', off), 0);
    const onScroll = () => o.close();
    window.addEventListener('scroll', onScroll, true);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', off); window.removeEventListener('scroll', onScroll, true); };
  }, []);
  return (
    <div class="popover" ref={ref} style={{ zIndex: 100 + o.id, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} role="menu">
      {o.render(o.close)}
    </div>
  );
}

// ---------- Sheet layout helpers ----------
export function SheetHead({ title, onClose, right, sub }) {
  return (
    <div class="sheet-head">
      <div class="sheet-title-wrap">
        <h2 class="sheet-title">{title}</h2>
        {sub && <div class="sheet-sub">{sub}</div>}
      </div>
      <div class="row gap-6">
        {right}
        {onClose && <button class="icon-btn ghost" onClick={() => onClose()} aria-label="Close"><Icon name="x" /></button>}
      </div>
    </div>
  );
}
export const SheetBody = ({ children, class: c }) => <div class={'sheet-body ' + (c || '')}>{children}</div>;
export const SheetFoot = ({ children }) => <div class="sheet-foot">{children}</div>;

export function openSheet(Comp, props = {}, opts = {}) {
  return openOverlay((close) => <Comp {...props} close={close} />, { kind: 'sheet', ...opts });
}

// ---------- confirm ----------
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const close = openOverlay((c) => (
      <div class="dialog">
        <h2 class="dialog-title">{title}</h2>
        {body && <div class="dialog-body">{body}</div>}
        <div class="dialog-actions">
          <button class="btn ghost" onClick={() => { finish(false); c(); }}>{cancelLabel}</button>
          <button class={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => { finish(true); c(); }} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    ), { kind: 'dialog', onClose: () => finish(false) });
    return close;
  });
}

// ---------- action menu ----------
// items: [{label, icon, onSelect, danger, disabled, hint}] or {divider:true} or {heading}
export function openMenu(e, items, { title } = {}) {
  const anchor = e && e.currentTarget;
  if (e) { e.stopPropagation(); e.preventDefault && e.preventDefault(); }
  openOverlay((close) => (
    <div class="menu">
      {title && !isDesktopNow() && <div class="menu-title">{title}</div>}
      {items.filter(Boolean).map((it, i) => it.divider ? <div class="menu-div" key={i} /> : it.heading ? <div class="menu-heading" key={i}>{it.heading}</div> : (
        <button key={i} class={'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '')} disabled={it.disabled} onClick={() => { close(); setTimeout(() => it.onSelect && it.onSelect(), 0); }}>
          {it.icon && <Icon name={it.icon} size={18} />}
          <span class="grow">{it.label}</span>
          {it.active && <Icon name="check" size={16} />}
          {it.hint && <span class="menu-hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  ), { kind: 'menu', anchor });
}

// ---------- toasts ----------
let toasts = [];
const tsubs = new Set();
export function toast(text, opts = {}) {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { id, text, ...opts }];
  tsubs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); tsubs.forEach((f) => f()); }, opts.duration || (opts.action ? 5000 : 2600));
}
export function Toasts() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { tsubs.add(force); return () => tsubs.delete(force); }, []);
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div class={'toast ' + (t.tone || '')} key={t.id}>
          <span>{t.text}</span>
          {t.action && <button class="toast-btn" onClick={() => { t.action.run(); toasts = toasts.filter((x) => x.id !== t.id); tsubs.forEach((f) => f()); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
