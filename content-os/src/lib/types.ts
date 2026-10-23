export type Lifecycle = 'active' | 'parked' | 'archived' | 'deleted'
export type Status = 'idea' | 'in_progress' | 'ready' | 'published'
export type Channel = 'instagram' | 'threads'
export type Format = 'reel' | 'carousel' | 'story'
export type Activity = 'write' | 'record' | 'edit' | 'review' | 'other'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type ResourceType = 'footage' | 'reference' | 'hook' | 'voice'
export type SourceKind = 'text' | 'web_link' | 'local_path' | 'image'

export interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Settings extends Base {
  displayName: string
  timezone: string
  hour12: boolean
  defaultEstimate: number
  threadsCharLimit: number | null
  instagramUrl: string
  threadsUrl: string
  pinnedContentId: string | null
  demoLoaded: boolean
  schemaVersion: number
}

export interface Idea extends Base {
  text: string
  url?: string
  preferredChannel?: Channel | null
  sourceContentId?: string | null
  convertedContentIds: string[]
  lifecycle: Lifecycle
  demo?: boolean
}

export interface Content extends Base {
  channel: Channel
  title: string
  format?: Format | null
  templateId?: string | null
  status: Status
  lifecycle: Lifecycle
  sourceIdeaId?: string | null
  sourceContentId?: string | null
  variantOfId?: string | null
  variantLabel?: string
  pillarId?: string | null
  seriesId?: string | null
  seriesDay?: string
  tagIds: string[]
  plannedPublishAt?: string | null
  publishedAt?: string | null
  postUrl?: string
  coverAssetId?: string | null
  caption: string
  notes: string
  finalFile?: string
  demo?: boolean
}

export interface ScriptSection extends Base {
  contentId: string
  key: string
  label: string
  body: string
  note?: string
  order: number
}

export interface ThreadPost extends Base {
  contentId: string
  body: string
  order: number
}

export interface Task extends Base {
  contentId?: string | null
  parentTaskId?: string | null
  title: string
  activity: Activity
  status: TaskStatus
  estimateMinutes?: number | null
  plannedStart?: string | null
  plannedEnd?: string | null
  dueDate?: string | null
  batchId?: string | null
  order: number
  completedAt?: string | null
  notes?: string
  lifecycle: Lifecycle
  demo?: boolean
}

export interface Shot extends Base {
  contentId: string
  description: string
  notes: string
  done: boolean
  order: number
}

export interface ReadinessItem extends Base {
  contentId: string
  label: string
  required: boolean
  checked: boolean
  order: number
}

export interface BatchSession extends Base {
  title: string
  startAt: string
  endAt: string
  notes: string
  location?: string
  demo?: boolean
}

export interface VoiceProfile {
  tone: string
  audience: string
  prefer: string
  avoid: string
  examples: string
}

export interface Resource extends Base {
  type: ResourceType
  sourceKind: SourceKind
  title: string
  body: string
  url?: string
  localPath?: string
  assetId?: string | null
  tags: string[]
  pinned: boolean
  voice?: VoiceProfile
  lifecycle: Lifecycle
  demo?: boolean
}

export interface ContentResource extends Base {
  contentId: string
  resourceId: string
  purpose?: string
}

export interface TemplateSection {
  key: string
  label: string
}

export interface TemplateTask {
  title: string
  activity: Activity
  estimateMinutes?: number | null
}

export interface Template extends Base {
  name: string
  channel: Channel
  compatibleFormats: Format[]
  sections: TemplateSection[]
  defaultTasks: TemplateTask[]
  defaultReadiness: string[]
  lifecycle: Lifecycle
  builtin?: boolean
}

export interface Metrics {
  views?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
}

export interface Review extends Base {
  contentId: string
  responses: string
  lesson: string
  nextIdea: string
  followupIdeaId?: string | null
  metrics?: Metrics
  recordedAt?: string | null
}

export interface Taxonomy extends Base {
  type: 'pillar' | 'tag' | 'series'
  label: string
  lifecycle: Lifecycle
}

export interface Asset extends Base {
  dataUrl: string
  mimeType: string
  filename: string
  byteSize: number
}

export interface Collections {
  settings: Settings
  ideas: Idea
  contents: Content
  sections: ScriptSection
  posts: ThreadPost
  tasks: Task
  shots: Shot
  readiness: ReadinessItem
  batches: BatchSession
  resources: Resource
  links: ContentResource
  templates: Template
  reviews: Review
  taxonomy: Taxonomy
  assets: Asset
}

export type Coll = keyof Collections

export const COLLS: Coll[] = [
  'settings', 'ideas', 'contents', 'sections', 'posts', 'tasks', 'shots', 'readiness',
  'batches', 'resources', 'links', 'templates', 'reviews', 'taxonomy', 'assets',
]

export const SCHEMA_VERSION = 1
