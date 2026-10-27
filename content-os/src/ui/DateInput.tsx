import React from 'react'
import { X, Check } from 'lucide-react'
import { fmtDay } from '../lib/time'
import { cx } from './kit'

/** Date field that shows "Sat 24 Oct" and opens the native picker. Dates are WIB calendar days. */
export function DateField({ label, value, onChange, min, max, done, placeholder = 'Not set' }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; done?: boolean; placeholder?: string }) {
  return (
    <label className={cx('field', done && 'field-done')}>
      <span className="field-label row gap4">{label}{done && <Check size={14} strokeWidth={2.6} />}</span>
      <span className="datewrap">
        <span className={cx('input datebtn', !value && 'unset')} aria-hidden>{value ? fmtDay(value) : done ? 'Done' : placeholder}</span>
        <input type="date" className="date-native" aria-label={`${label} date`} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} onClick={(e) => { try { (e.currentTarget as any).showPicker?.() } catch { /* not supported */ } }} />
        {value && <button type="button" className="date-clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={(e) => { e.preventDefault(); onChange('') }}><X size={15} /></button>}
      </span>
    </label>
  )
}

/** 24h time in WIB. */
export function TimeField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label} <span className="muted">(WIB)</span></span>
      <span className="datewrap">
        <span className={cx('input datebtn', !value && 'unset', disabled && 'disabled')} aria-hidden>{value ? value.replace(':', '.') : 'Any time'}</span>
        <input type="time" className="date-native" aria-label={`${label} (WIB)`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} onClick={(e) => { try { (e.currentTarget as any).showPicker?.() } catch { /* not supported */ } }} />
        {value && !disabled && <button type="button" className="date-clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={(e) => { e.preventDefault(); onChange('') }}><X size={15} /></button>}
      </span>
    </label>
  )
}
