import React, { useEffect, useState } from 'react'
import * as M from '../lib/money'
import { Sheet, Button, toast } from './kit'
import { AmountInput } from './TxSheet'
import { AccIc } from './icons'

// ---------- open/close bus ----------
let isOpen = false
const ls = new Set<() => void>()
export function openBalances() { isOpen = true; ls.forEach((l) => l()) }
const close = () => { isOpen = false; ls.forEach((l) => l()) }
function useOpen() { const [, f] = useState(0); useEffect(() => { const l = () => f((n) => n + 1); ls.add(l); return () => { ls.delete(l) } }, []); return isOpen }

/** True while no balance has ever been set: no starting balance, no adjustment, no income. */
export function needsBalances() {
  const acc = M.accounts().filter((a) => a.type !== 'credit')
  if (!acc.length) return false
  if (acc.some((a) => a.initial)) return false
  return !M.txs().some((x) => x.type === 'adjust' || x.type === 'income')
}

export function BalancesHost() {
  return useOpen() ? <BalancesSheet /> : null
}

function BalancesSheet() {
  const list = M.accounts().filter((a) => a.type !== 'credit')
  const bal = M.balances()
  const [vals, setVals] = useState<Record<string, string>>({})
  const save = () => {
    let n = 0
    for (const a of list) {
      const v = vals[a.id]
      if (v == null || v === '') continue
      if (M.setBalance(a.id, M.parseAmount(v), 'Starting balance')) n++
    }
    toast(n ? `Updated ${n} account${n > 1 ? 's' : ''}` : 'Nothing changed')
    close()
  }
  return (
    <Sheet open onClose={close} title="Set balances" footer={<Button variant="primary" size="lg" block onClick={save}>Save balances</Button>}>
      <p className="small muted">Type what each account holds right now. Leave one empty to skip it. The difference is saved as an adjustment, not income or spending.</p>
      <div className="stack" style={{ gap: 14 }}>
        {list.map((a, i) => (
          <div key={a.id} className="bal-row">
            <div className="row gap8">
              <AccIc a={a} size={15} />
              <span className="grow"><b>{a.name}</b></span>
              <span className="small muted tnum">now {M.rp(bal[a.id] || 0, { show: true })}</span>
            </div>
            <AmountInput id={'bal-' + a.id} value={vals[a.id] || ''} onChange={(v) => setVals((s) => ({ ...s, [a.id]: v }))} autoFocus={i === 0} />
          </div>
        ))}
      </div>
    </Sheet>
  )
}
