export type Theme = 'system' | 'light' | 'dark'
export function getTheme(): Theme { try { return (localStorage.getItem('vzc:theme') as Theme) || 'system' } catch { return 'system' } }
export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme')
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#141412' : '#f7f6f2'))
}
export function setTheme(t: Theme) { try { localStorage.setItem('vzc:theme', t) } catch { /* ignore */ } applyTheme(t) }
