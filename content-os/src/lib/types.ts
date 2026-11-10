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

export interface Ref { id: string; url: string; note?: string }

export interface NotifyPrefs { morning: boolean; morningTime: string; postReminder: boolean; postTime: string; plan?: boolean; planTime?: string }

export interface Settings extends Base {
  displayName: string
  timezone: string
  schemaVersion: number
  slots: Slot[]
  pillars: Tag[]
  formats: Tag[]
  notify?: NotifyPrefs
  /** Studio brandkit (colors, fonts, voice, story formulas). See studio/brand.ts */
  brand?: any
}

export type Stage = 'idea' | 'script' | 'film' | 'edit' | 'ready' | 'done'

/** One record type for everything. `kind` decides which fields matter. */
export interface Item extends Base {
  /** idea is legacy (migrated to ig on load); link = a resource */
  kind: 'ig' | 'thread' | 'idea' | 'link'
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
  /** planned day for each stage (YYYY-MM-DD); order must be script <= film <= edit <= post */
  scriptDate?: string | null
  filmDate?: string | null
  editDate?: string | null
  pillar?: string | null
  format?: string | null
  /** reference links (inspiration, shot list on Drive, moodboards) */
  refs?: Ref[]
  /** link to the finished edit (Drive, Frame.io…) */
  finalUrl?: string
  // ---- thread ----
  text?: string
  /** thread: planned post time HH:MM (WIB), with `date` */
  time?: string | null
  // ---- link (resource) ----
  url?: string
  /** ig: when it was marked posted; thread: when it was posted */
  postedAt?: string | null
  // ---- studio (ig) ----
  studio?: StudioData
  cover?: CoverData
  carousel?: CarouselData
}

export interface ScriptBeat { name: string; time: string; vo: string; visual: string; screen: string }
export interface StudioData {
  type?: string
  formula?: string
  len?: number
  idea?: string
  facts?: string
  refText?: string
  refLink?: string
  angles?: string
  beats?: ScriptBeat[]
  shots?: string
  shotsDone?: number[]
  check?: boolean[]
}
export interface ImgRef { idb: string }
export interface CoverData {
  tpl: string; fmt: string; kicker: string; title: string; accent: string; micro: string
  size: number; y: number; align: string; grade: boolean; dark: boolean; photo?: ImgRef | null; titleTouched?: boolean
}
export interface Slide { id: string; kind: string; kicker: string; title: string; body: string; caption: string; photo?: ImgRef | null; py: number; zoom: number; dark: boolean }
export interface CarouselData { tpl: string; ratio: string; num: boolean; foot: boolean; slides: Slide[] }

export interface Collections {
  settings: Settings
  items: Item
}

export type Coll = keyof Collections

export const COLLS: Coll[] = ['settings', 'items']

export const SCHEMA_VERSION = 3
