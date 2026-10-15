// Vandenizar → Google Drive. Runs in your Google account as a web app.
// Saves monthly review PDFs to: My Drive / Daily Review / <year> / <month> / <file>.pdf
const TOKEN = 'PASTE_TOKEN';

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'Bad request' }); }
  if (body.token !== TOKEN) return out({ ok: false, error: 'Not allowed' });
  if (body.action === 'ping') return out({ ok: true, email: Session.getEffectiveUser().getEmail() });
  if (body.action === 'upload') {
    const root = folder(DriveApp.getRootFolder(), 'Daily Review');
    const target = folder(folder(root, String(body.year)), String(body.month));
    const old = target.getFilesByName(body.name);
    while (old.hasNext()) old.next().setTrashed(true);
    const blob = Utilities.newBlob(Utilities.base64Decode(body.data), 'application/pdf', body.name);
    const file = target.createFile(blob);
    return out({ ok: true, id: file.getId(), url: file.getUrl() });
  }
  return out({ ok: false, error: 'Unknown action' });
}

function folder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
