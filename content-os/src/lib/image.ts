import { put, uid, get } from './store'
import type { Asset } from './types'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Validate, shrink to max 960px JPEG and store as an Asset. Throws a readable error. */
export async function storeImage(file: File): Promise<Asset> {
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar (JPG, PNG, WebP).')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Gambar maksimal 5 MB.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak bisa dibaca.')); i.src = url })
    const max = 960
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale))
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
    let q = 0.78, data = cv.toDataURL('image/jpeg', q)
    while (data.length > 200_000 && q > 0.4) { q -= 0.12; data = cv.toDataURL('image/jpeg', q) }
    return put('assets', { id: uid(), dataUrl: data, mimeType: 'image/jpeg', filename: file.name, byteSize: Math.round(data.length * 0.75), createdAt: '', updatedAt: '' })
  } finally { URL.revokeObjectURL(url) }
}

export function assetUrl(id?: string | null): string | undefined {
  return get('assets', id)?.dataUrl
}
