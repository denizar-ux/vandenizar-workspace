export interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Settings extends Base {
  displayName: string
  timezone: string
  schemaVersion: number
}

/** The four fixed Instagram slots of a week. */
export type SlotId = 'work' | 'shot' | 'story' | 'desk'
export type Stage = 'idea' | 'script' | 'film' | 'edit' | 'ready' | 'done'

/** Everything is one small record type. kind decides which fields matter. */
export interface Item extends Base {
  kind: 'ig' | 'thread' | 'idea'
  /** ig: Monday (YYYY-MM-DD, WIB) of the week this post belongs to */
  week?: string | null
  slot?: SlotId | null
  title?: string
  stage?: Stage
  script?: string
  caption?: string
  notes?: string
  /** ig: planned post day (YYYY-MM-DD) */
  date?: string | null
  /** thread and idea text */
  text?: string
  /** ig upload time / thread posted time */
  postedAt?: string | null
}

export interface Collections {
  settings: Settings
  items: Item
}

export type Coll = keyof Collections

export const COLLS: Coll[] = ['settings', 'items']

export const SCHEMA_VERSION = 2
