import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X, MoreHorizontal, ChevronDown, Check, Copy } from 'lucide-react'
import { copyText } from '../lib/prefs'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

// ---------- tiny global UI bus ----------
type Listener = () => void
function createBus<T>(initial: T) {
  let v = initial
  const ls = new Set<Listener>()
  return {
    get: () => v,
    set: (n: T) => { v = n; ls.forEach((l) => l()) },
    use: () => useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l) } }, () => v),
  }
}

// ---------- Buttons ----------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' | 'lg'; icon?: React.ReactNode; block?: boolean }
export function Button({ variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', className)} {...rest}>
      {icon}{children && <span>{children}</span>}
    </button>
  )
}
export function IconBtn({ label, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cx('iconbtn', className)} {...rest}>{children}</button>
}

// ---------- Sheet ----------
let openSheets = 0
export function Sheet({ open, onClose, title, children, footer, wide, label }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<Element | null>(null)
  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement
    openSheets++
    document.body.classList.add('sheet-open')
    const el = ref.current
    const t = setTimeout(() => {
      const auto = el?.querySelector<HTMLElement>('[data-autofocus]')
      ;(auto || el)?.focus({ preventScroll: true } as any)
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (!el || !el.contains(document.activeElement) && document.activeElement !== document.body) return
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab') {
        const f = Array.from(el.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null)
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey, true)
      openSheets--
      if (openSheets <= 0) { openSheets = 0; document.body.classList.remove('sheet-open') }
      const p = prevFocus.current as HTMLElement | null
      if (p && document.contains(p)) p.focus?.({ preventScroll: true } as any)
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="sheet-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cx('sheet', wide && 'sheet-wide')} role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : 'Dialog')} ref={ref} tabIndex={-1}>
        <div className="sheet-grab" aria-hidden />
        {title != null && (
          <div className="sheet-head">
            <h2 className="sheet-title">{title}</h2>
            <IconBtn label="Tutup" onClick={onClose}><X size={20} /></IconBtn>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------- Confirm dialogs (confirm()/prompt() don't run inside artifacts) ----------
interface AskOpts { title: string; body?: React.ReactNode; confirm?: string; cancel?: string; danger?: boolean; extra?: string; typeToConfirm?: string }
type AskState = (AskOpts & { resolve: (v: 'confirm' | 'extra' | null) => void }) | null
const askBus = createBus<AskState>(null)
export function ask(o: AskOpts): Promise<'confirm' | 'extra' | null> {
  return new Promise((resolve) => askBus.set({ ...o, resolve }))
}
function AskHost() {
  const a = askBus.use()
  const [typed, setTyped] = useState('')
  useEffect(() => setTyped(''), [a])
  if (!a) return null
  const done = (v: 'confirm' | 'extra' | null) => { askBus.set(null); a.resolve(v) }
  const blocked = !!a.typeToConfirm && typed.trim() !== a.typeToConfirm.trim()
  return (
    <Sheet open onClose={() => done(null)} title={a.title} footer={
      <div className="row gap8 wrap end">
        <Button variant="ghost" onClick={() => done(null)}>{a.cancel || 'Batal'}</Button>
        {a.extra && <Button onClick={() => done('extra')}>{a.extra}</Button>}
        <Button variant={a.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => done('confirm')} data-autofocus={!a.typeToConfirm || undefined}>{a.confirm || 'Lanjut'}</Button>
      </div>
    }>
      {a.body && <div className="muted body-text">{a.body}</div>}
      {a.typeToConfirm && (
        <label className="field">
          <span className="field-label">Ketik <b>{a.typeToConfirm}</b> untuk menghapus permanen</span>
          <input id="typeconfirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} data-autofocus autoComplete="off" />
        </label>
      )}
    </Sheet>
  )
}

// ---------- Toasts ----------
interface ToastT { id: number; msg: string; action?: { label: string; run: () => void }; tone?: 'error' }
const toastBus = createBus<ToastT[]>([])
let tid = 0
export function toast(msg: string, action?: ToastT['action'], tone?: 'error') {
  const t = { id: ++tid, msg, action, tone }
  toastBus.set([...toastBus.get(), t].slice(-3))
  setTimeout(() => toastBus.set(toastBus.get().filter((x) => x.id !== t.id)), action ? 6000 : 3200)
}
function ToastHost() {
  const ts = toastBus.use()
  return (
    <div className="toasts" aria-live="polite">
      {ts.map((t) => (
        <div key={t.id} className={cx('toast', t.tone === 'error' && 'toast-error')}>
          <span>{t.msg}</span>
          {t.action && <button className="toast-act" onClick={() => { toastBus.set(toastBus.get().filter((x) => x.id !== t.id)); t.action!.run() }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}

// ---------- Copy with fallback ----------
const copyBus = createBus<{ text: string; title: string } | null>(null)
export async function copyOrShow(text: string, title = 'Salin manual', okMsg = 'Tersalin') {
  const ok = await copyText(text)
  if (ok) toast(okMsg)
  else copyBus.set({ text, title })
  return ok
}
function CopyHost() {
  const c = copyBus.use()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (c) setTimeout(() => { ref.current?.focus(); ref.current?.select() }, 60) }, [c])
  if (!c) return null
  return (
    <Sheet open onClose={() => copyBus.set(null)} title={c.title}>
      <p className="muted small">Browser menolak akses clipboard. Teks sudah dipilih, salin manual (tahan lalu Salin, atau Ctrl/Cmd+C).</p>
      <textarea ref={ref} className="input mono-ish" readOnly rows={8} value={c.text} onFocus={(e) => e.currentTarget.select()} />
    </Sheet>
  )
}

export function Hosts() { return <><AskHost /><ToastHost /><CopyHost /></> }

// ---------- Inputs ----------
export function AutoTextarea({ value, onChange, minRows = 2, className, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight + 2, minRows * 24 + 20) + 'px'
  }, [value, minRows])
  return <textarea ref={ref} className={cx('input textarea', className)} value={value} rows={minRows} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function Field({ label, children, hint, error, htmlFor }: { label: string; children: React.ReactNode; hint?: string; error?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[]; label: string; className?: string }) {
  return (
    <div className={cx('seg', className)} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={o.value === value} className={cx('seg-item', o.value === value && 'on')} onClick={() => onChange(o.value)}>
          <span>{o.label}</span>{o.count != null && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ value, onChange, options, label, scroll }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label: string; scroll?: boolean }) {
  return (
    <div className={cx('chips', scroll && 'chips-scroll')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} className={cx('chip', o.value === value && 'on')} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

// ---------- Menu ----------
export interface MenuItem { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; hidden?: boolean }
export function Menu({ items, label = 'Menu lainnya', icon, className, trigger }: { items: MenuItem[]; label?: string; icon?: React.ReactNode; className?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const show = items.filter((i) => !i.hidden)
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = 220, h = show.length * 46 + 12
    let left = Math.min(r.right - w, window.innerWidth - w - 8); left = Math.max(8, left)
    let top = r.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6)
    setPos({ top, left })
    setTimeout(() => pop.current?.querySelector<HTMLElement>('button')?.focus(), 10)
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (pop.current && !pop.current.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const bs = Array.from(pop.current?.querySelectorAll<HTMLElement>('button') || [])
        const i = bs.indexOf(document.activeElement as HTMLElement)
        bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus(); e.preventDefault()
      }
    }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key); window.addEventListener('scroll', () => setOpen(false), { once: true, capture: true })
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <>
      <button ref={btn} type="button" className={cx(trigger ? 'pill-menu' : 'iconbtn', className)} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        {trigger || icon || <MoreHorizontal size={20} />}
      </button>
      {open && pos && createPortal(
        <div ref={pop} className="menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          {show.map((it, i) => (
            <button key={i} role="menuitem" type="button" className={cx('menu-item', it.danger && 'danger')} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onSelect() }}>
              {it.icon}<span>{it.label}</span>
            </button>
          ))}
        </div>, document.body)}
    </>
  )
}

export function Accordion({ title, children, defaultOpen, right, id }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode; id?: string }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <section className={cx('acc', open && 'open')}>
      <button type="button" className="acc-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="acc-title">{title}</span>{right}<ChevronDown size={18} className="acc-chev" />
      </button>
      {open && <div className="acc-body" id={id}>{children}</div>}
    </section>
  )
}

export function Check3({ checked, onChange, label, size = 22 }: { checked: boolean; onChange: (v: boolean) => void; label: string; size?: number }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={cx('check', checked && 'on')} style={{ width: size, height: size }} onClick={(e) => { e.stopPropagation(); onChange(!checked) }}>
      {checked && <Check size={size - 8} strokeWidth={3} />}
    </button>
  )
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {body && <p className="muted small">{body}</p>}
      {action && <div className="empty-act">{action}</div>}
    </div>
  )
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: 'butter' | 'cyan' | 'sage' | 'lavender' | 'danger' | 'ink' | 'line' }) {
  return <span className={cx('badge', tone && 'badge-' + tone)}>{children}</span>
}

export function CopyBtn({ text, label = 'Salin', title }: { text: string; label?: string; title?: string }) {
  return <Button size="sm" icon={<Copy size={16} />} onClick={() => copyOrShow(text, title)}>{label}</Button>
}

export function Skeleton() {
  return <div className="skel-wrap" aria-busy="true" aria-label="Memuat"><div className="skel" style={{ width: '40%' }} /><div className="skel" style={{ height: 120 }} /><div className="skel" /><div className="skel" /></div>
}
