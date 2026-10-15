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

// jsPDF loads on first use from cdnjs (kept out of the main bundle so the app opens faster).
let jsPdfPromise = null;
export function loadJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.async = true;
    s.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('PDF engine did not load')));
    s.onerror = () => { jsPdfPromise = null; reject(new Error('Could not load the PDF engine. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return jsPdfPromise;
}
