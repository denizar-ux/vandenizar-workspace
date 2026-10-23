/** Offer a file to the viewer. Uses the artifact downloads capability; falls back to a normal browser download. */
export async function saveFile(filename: string, data: string): Promise<'saved' | 'declined' | 'unavailable'> {
  let dl: any = null
  try { dl = await (window as any).claude?.use?.('downloads') } catch { dl = null }
  if (dl) {
    try { await dl.save({ filename, data: new Blob([data], { type: 'application/json' }) }); return 'saved' } catch (e: any) {
      if (e?.code === 'declined') return 'declined'
    }
  }
  if ((window as any).claude) return 'unavailable'
  try {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return 'saved'
  } catch { return 'unavailable' }
}
