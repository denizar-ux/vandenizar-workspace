// Saves a generated file. Inside the claude.ai preview it goes through the viewer's download
// capability (the viewer confirms); on a normal website it is a regular browser download.
export async function saveFile(filename, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const c = typeof window !== 'undefined' && window.claude;
  if (c && typeof c.use === 'function') {
    let dl = null;
    try { dl = await c.use('downloads'); } catch {}
    if (dl) {
      try { await dl.save({ filename, data: blob }); return 'saved'; }
      catch (e) { const code = e && e.code; return code === 'declined' ? 'declined' : code === 'rejected_extension' || code === 'extension_not_enabled' ? 'unsupported' : 'failed'; }
    }
    return 'failed';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch { return 'failed'; }
}
export const saveMessage = (r, okText) => ({
  saved: [okText, ''],
  declined: ['Download cancelled', ''],
  unsupported: ['This preview can\'t save that file type. It works once the site runs on its own address.', 'warn'],
  failed: ['Couldn\'t save the file here. It works once the site runs on its own address.', 'warn'],
}[r] || [okText, '']);
