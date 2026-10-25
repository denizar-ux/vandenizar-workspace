import React from 'react'
import { House, List, Target, ChartPie, Wallet, Settings as Gear, Check, Loader, AlertCircle, CloudOff, Plus, Eye, EyeOff } from 'lucide-react'
import { go, useRoute, type View } from '../lib/router'
import { store, retry, notifyAll } from '../lib/store'
import { hidden, setHidden } from '../lib/money'
import { openTx } from './TxSheet'
import { cx, IconBtn } from './kit'

export const TABS: { id: View; label: string; icon: any }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'history', label: 'History', icon: List },
  { id: 'budget', label: 'Budget', icon: Target },
  { id: 'stats', label: 'Stats', icon: ChartPie },
  { id: 'accounts', label: 'Accounts', icon: Wallet },
]

export function Dock() {
  const r = useRoute()
  if (r.view === 'settings') return null
  return (
    <nav className="dock" aria-label="Main">
      <div className="dock-inner">
        {TABS.map((t) => {
          const I = t.icon
          return (
            <button key={t.id} className={cx('dock-item', r.view === t.id && 'on')} aria-current={r.view === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <span className="dock-ic"><I size={21} /></span><span>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function Sidebar() {
  const r = useRoute()
  return (
    <aside className="side" aria-label="Main">
      <div className="side-brand"><b>vandenizar</b><span>/ money</span></div>
      <button className="btn btn-primary side-new" onClick={() => openTx({ type: 'expense' })}><Plus size={18} /><span>New transaction</span></button>
      {TABS.map((t) => {
        const I = t.icon
        return <button key={t.id} className={cx('side-item', r.view === t.id && 'on')} aria-current={r.view === t.id ? 'page' : undefined} onClick={() => go(t.id)}><I size={19} />{t.label}</button>
      })}
      <div className="side-foot">
        <button className="side-item" onClick={() => { setHidden(!hidden()); notifyAll() }}>{hidden() ? <EyeOff size={19} /> : <Eye size={19} />}{hidden() ? 'Show amounts' : 'Hide amounts'}</button>
        <button className={cx('side-item', r.view === 'settings' && 'on')} onClick={() => go('settings')}><Gear size={19} />Settings</button>
        <div className="mt8" style={{ padding: '0 12px' }}><SaveBadge /></div>
      </div>
    </aside>
  )
}

export function PhoneTop() {
  return (
    <div className="phonetop only-phone">
      <div className="brand-mini grow">vandenizar <span>/ money</span></div>
      <IconBtn label={hidden() ? 'Show amounts' : 'Hide amounts'} onClick={() => { setHidden(!hidden()); notifyAll() }}>{hidden() ? <EyeOff size={21} /> : <Eye size={21} />}</IconBtn>
      <IconBtn label="Settings" onClick={() => go('settings')}><Gear size={21} /></IconBtn>
      <button className="plus" aria-label="New transaction" onClick={() => openTx({ type: 'expense' })}><Plus size={24} /></button>
    </div>
  )
}

export function SaveBadge() {
  if (store.error) return <span className="save err" role="alert"><AlertCircle size={15} />Couldn't save <button className="linkbtn" style={{ color: 'inherit' }} onClick={retry}>Retry</button></span>
  if (store.saving) return <span className="save" aria-live="polite"><Loader size={14} />Saving…</span>
  if (store.mode === 'local') return <span className="save" aria-live="polite"><CloudOff size={15} />Saved in this browser only</span>
  if (store.mode === 'loading') return <span className="save" aria-live="polite"><Loader size={14} />Connecting…</span>
  return <span className="save" aria-live="polite"><Check size={15} />Synced</span>
}

export function PageHead({ eyebrow, title, right }: { eyebrow?: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <header className="pagehead">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
      </div>
      {right && <div className="row gap4" style={{ flex: 'none' }}>{right}</div>}
    </header>
  )
}

/** ‹ October › style period stepper */
export function Stepper({ label, onPrev, onNext, onReset, showReset }: { label: string; onPrev: () => void; onNext: () => void; onReset?: () => void; showReset?: boolean }) {
  return (
    <div className="stepper-nav">
      <IconBtn label="Previous" className="boxed" onClick={onPrev}><span aria-hidden>‹</span></IconBtn>
      <span className="stepper-label">{label}</span>
      <IconBtn label="Next" className="boxed" onClick={onNext}><span aria-hidden>›</span></IconBtn>
      {showReset && onReset && <button className="linkbtn" onClick={onReset}>Now</button>}
    </div>
  )
}

export function Bar({ pct, status }: { pct: number; status?: 'ok' | 'warn' | 'over' }) {
  return <div className={cx('pbar', status && 'pbar-' + status)} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: Math.min(100, Math.max(0, pct * 100)) + '%' }} /></div>
}
