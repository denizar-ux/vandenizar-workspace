import type { Template, Format, Activity } from './types'

const t0 = '2026-01-01T00:00:00.000Z'
const tk = (title: string, activity: Activity, estimateMinutes: number | null = null) => ({ title, activity, estimateMinutes })
const IG: Format[] = ['reel', 'carousel', 'story']

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'tpl-talking-head', name: 'Talking head', channel: 'instagram', compatibleFormats: ['reel'],
    sections: [{ key: 'hook', label: 'Hook' }, { key: 'point', label: 'Poin utama' }, { key: 'example', label: 'Contoh' }, { key: 'cta', label: 'Penutup' }],
    defaultTasks: [tk('Script', 'write', 30), tk('Rekam talking head', 'record', 30), tk('Edit video', 'edit', 60), tk('Review hasil', 'review', 15)],
    defaultReadiness: ['Video final', 'Cover', 'Caption'], lifecycle: 'active', builtin: true, createdAt: t0, updatedAt: t0,
  },
  {
    id: 'tpl-bts', name: 'BTS', channel: 'instagram', compatibleFormats: ['reel', 'story'],
    sections: [{ key: 'hook', label: 'Hook' }, { key: 'setup', label: 'Setup' }, { key: 'process', label: 'Proses' }, { key: 'result', label: 'Hasil' }],
    defaultTasks: [tk('Catat setup', 'write', 15), tk('Rekam BTS', 'record', 45), tk('Pilih footage', 'edit', 30), tk('Edit video', 'edit', 60)],
    defaultReadiness: ['Video final', 'Cover', 'Caption'], lifecycle: 'active', builtin: true, createdAt: t0, updatedAt: t0,
  },
  {
    id: 'tpl-portfolio', name: 'Portfolio breakdown', channel: 'instagram', compatibleFormats: IG,
    sections: [{ key: 'hook', label: 'Hook' }, { key: 'brief', label: 'Brief' }, { key: 'decision', label: 'Keputusan kreatif' }, { key: 'result', label: 'Hasil' }],
    defaultTasks: [tk('Tulis breakdown', 'write', 30), tk('Siapkan footage', 'edit', 30), tk('Edit', 'edit', 60)],
    defaultReadiness: ['File final', 'Cover', 'Caption'], lifecycle: 'active', builtin: true, createdAt: t0, updatedAt: t0,
  },
  {
    id: 'tpl-tutorial', name: 'Tutorial', channel: 'instagram', compatibleFormats: IG,
    sections: [{ key: 'hook', label: 'Hook' }, { key: 'problem', label: 'Masalah' }, { key: 'steps', label: 'Langkah' }, { key: 'cta', label: 'Penutup' }],
    defaultTasks: [tk('Script', 'write', 30), tk('Rekam', 'record', 45), tk('Edit', 'edit', 60), tk('Review hasil', 'review', 15)],
    defaultReadiness: ['File final', 'Cover', 'Caption'], lifecycle: 'active', builtin: true, createdAt: t0, updatedAt: t0,
  },
  {
    id: 'tpl-blank', name: 'Blank', channel: 'instagram', compatibleFormats: IG,
    sections: [{ key: 'body', label: 'Naskah' }],
    defaultTasks: [], defaultReadiness: ['File final', 'Caption'], lifecycle: 'active', builtin: true, createdAt: t0, updatedAt: t0,
  },
]

export const FORMAT_LABEL: Record<Format, string> = { reel: 'Reel', carousel: 'Carousel', story: 'Story' }
export const ACTIVITY_LABEL: Record<Activity, string> = { write: 'Nulis', record: 'Rekam', edit: 'Edit', review: 'Review', other: 'Lainnya' }
export const STATUS_LABEL = { idea: 'Ide', in_progress: 'Dikerjakan', ready: 'Siap tayang', published: 'Terbit' } as const
export const THREAD_STATUS_LABEL = { idea: 'Draft', in_progress: 'Draft', ready: 'Siap', published: 'Terbit' } as const

export const READINESS_BY_FORMAT: Record<Format, string[]> = {
  reel: ['Video final', 'Cover', 'Caption'],
  carousel: ['Semua slide final', 'Caption'],
  story: ['Semua frame final'],
}
