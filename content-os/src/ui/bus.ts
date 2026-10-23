import { useSyncExternalStore } from 'react'
import type { Task, Resource, Channel } from '../lib/types'

export type SheetReq =
  | { type: 'capture'; text?: string }
  | { type: 'task'; taskId?: string; defaults?: Partial<Task> }
  | { type: 'resource'; id?: string; defaults?: Partial<Resource>; linkTo?: string }
  | { type: 'schedulePost'; contentId?: string; date?: string }
  | { type: 'search' }
  | { type: 'publish'; contentId: string }
  | { type: 'batchPick'; taskId?: string; contentId?: string }
  | { type: 'useResource'; resourceId: string }
  | { type: 'linkResource'; contentId: string }
  | { type: 'newContent'; channel?: Channel; text?: string }

let stack: (SheetReq & { key: number })[] = []
let k = 0
const ls = new Set<() => void>()
const emit = () => ls.forEach((l) => l())

export function openSheet(r: SheetReq) { stack = [...stack, { ...r, key: ++k }]; emit() }
export function closeSheet(key: number) { stack = stack.filter((s) => s.key !== key); emit() }
export function closeAllSheets() { stack = []; emit() }
export function useSheets() { return useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l) } }, () => stack) }
