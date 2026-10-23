// Small per-device preferences (filters, last view). Never the data itself.
export function pref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem('vzc:p:' + key); return v == null ? fallback : JSON.parse(v) } catch { return fallback }
}
export function setPref(key: string, v: unknown) {
  try { localStorage.setItem('vzc:p:' + key, JSON.stringify(v)) } catch { /* ignore */ }
}

/** Copy inside a click handler. Returns false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}

export function safeUrl(u?: string | null): string | null {
  if (!u) return null
  try {
    const x = new URL(u.trim())
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.toString() : null
  } catch { return null }
}
