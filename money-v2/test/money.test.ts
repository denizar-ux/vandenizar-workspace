import { expect, test } from 'vitest'
import * as M from '../src/lib/money'
import { put } from '../src/lib/store'
test('amounts', () => {
  expect(M.parseAmount('1,5jt')).toBe(1500000)
  expect(M.parseAmount('250rb')).toBe(250000)
  expect(M.parseAmount('25.000')).toBe(25000)
  expect(M.parseAmount('1.250.000')).toBe(1250000)
  expect(M.parseAmount('Rp 45000')).toBe(45000)
  expect(M.rp(1500000)).toBe('Rp1.500.000')
})
test('recurring', () => {
  const r = { id: 'x', name: 'Rent', type: 'expense', amount: 100, freq: 'month', every: 1, start: '2026-01-31', auto: false, sub: false } as M.Recur
  expect(M.occurrences(r, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  expect(M.nextDue({ ...r, done: '2026-02-28' })).toBe('2026-03-31')
  const w = { ...r, freq: 'week', every: 2, start: '2026-10-01' } as M.Recur
  expect(M.occurrences(w, '2026-10-10', '2026-11-10')).toEqual(['2026-10-15', '2026-10-29'])
})
test('auto log + budget', () => {
  put('mAccounts', { id: 'a1', name: 'Main', type: 'bank', initial: 0 })
  put('mRecur', { id: 's', name: 'Salary', type: 'income', amount: 1000, catId: 'salary', accountId: 'a1', freq: 'month', every: 1, start: M.today().slice(0, 8) + '01', auto: true, sub: false })
  expect(M.runAutoRecurs()).toBe(1)
  expect(M.runAutoRecurs()).toBe(0)
  M.saveTx({ type: 'expense', amount: 300, catId: 'food.eatout', accountId: 'a1', date: M.today() })
  expect(M.balances().a1).toBe(700)
  const b = M.saveBudget({ catId: 'food', amount: 1000, period: 'week' }) as M.Budget
  expect(M.budgetState(b).spent).toBe(300)
  const im = M.readImport('Date,Amount,Category,Note\n24/10/2026,"45.000",Groceries,Sayur\n2026-10-23,-12000,Eating out,', 'a1')
  expect(im.items.length).toBe(2); expect(im.items[0].catId).toBe('food.groceries'); expect(im.items[1].amount).toBe(12000)
})
