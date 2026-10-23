export interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

export type Tint = 'butter' | 'cyan' | 'lavender' | 'sage' | 'peach' | 'rose'
export const TINTS: Tint[] = ['butter', 'cyan', 'lavender', 'sage', 'peach', 'rose']

/** A recurring weekly posting slot ("Shot vs Setup on Wednesday"). Editable in Settings. */
export interface Slot {
  id: string
  name: string
  /** 0 = Monday … 6 = Sunday */
  day: number
  tint: Tint
  hint?: string
  /** defaults applied to a new post in this slot */
  pillar?: string | null
  format?: string | null
}

export interface Tag { id: string; name: string }

export interface Settings extends Base {
  displayName: string
  timezone: string
  schemaVersion: number
  slots: Slot[]
  pillars: Tag[]
  formats: Tag[]
}

export type Stage = 'idea' | 'script' | 'film' | 'edit' | 'ready' | 'done'

/** One record type for everything. `kind` decides which fields matter. */
export interface Item extends Base {
  kind: 'ig' | 'thread' | 'idea'
  // ---- ig ----
  /** Monday (YYYY-MM-DD, WIB) of the week this post is planned in */
  week?: string | null
  slot?: string | null
  title?: string
  stage?: Stage
  hook?: string
  script?: string
  caption?: string
  notes?: string
  /** planned post day (YYYY-MM-DD) */
  date?: string | null
  /** planned shoot day (YYYY-MM-DD) */
  filmDate?: string | null
  pillar?: string | null
  format?: string | null
  // ---- thread / idea ----
  text?: string
  /** ig: when it was marked posted; thread: when it was posted */
  postedAt?: string | null
}

export interface Collections {
  settings: Settings
  items: Item
}

export type Coll = keyof Collections

export const COLLS: Coll[] = ['settings', 'items']

export const SCHEMA_VERSION = 3
