// Denizar's current rhythm. Everything here can be changed in Content settings.
export const SCHEMA_VERSION = 3

export const DEFAULT_PILLARS = [
  { id: 'work', name: 'Work & process' },
  { id: 'desk', name: 'Desk setup' },
  { id: 'life', name: 'Life after 9–5' },
]

export const DEFAULT_FORMATS = [
  { id: 'reels', name: 'Reels' },
  { id: 'carousel', name: 'Carousel' },
  { id: 'photo', name: 'Photo' },
]

export const DEFAULT_SLOTS = [
  { id: 'work', name: 'Work post', day: 0, tint: 'butter', hint: 'BTS, process, or the final result.', pillar: 'work', format: 'reels' },
  { id: 'shot', name: 'Shot vs Setup', day: 2, tint: 'cyan', hint: 'The final shot next to how it was made.', pillar: 'work', format: 'reels' },
  { id: 'story', name: 'Storytelling', day: 4, tint: 'lavender', hint: 'The one higher-effort post. VO or talking head.', pillar: 'life', format: 'reels' },
  { id: 'desk', name: 'Desk', day: 5, tint: 'sage', hint: 'Light and easy. Desk and workspace mood.', pillar: 'desk', format: 'reels' },
]

export const TINTS = ['butter', 'cyan', 'lavender', 'sage', 'peach', 'rose']
