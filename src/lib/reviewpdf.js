// Monthly journal: every daily review in a month, combined into one PDF.
import { all, get } from './db.js';
import { loadJsPdf } from './files.js';
import { isoOf } from './date.js';
export const dayTitle = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
import * as M from './model.js';
import { MONTHS } from './drive.js';

export const ENERGY = ['Drained', 'Low', 'Okay', 'Good', 'Great'];
const hasText = (r) => r && ((r.journal || '').trim() || (r.wins || '').trim() || (r.blockers || '').trim() || (r.lesson || '').trim() || (r.unfinishedNote || '').trim() || r.energy);

export function monthData(ym) {
  const inMonth = (iso) => iso && iso.slice(0, 7) === ym;
  const reviews = all('dailyReviews').filter((r) => inMonth(r.id) && hasText(r)).sort((a, b) => a.id.localeCompare(b.id));
  const tasks = M.liveTasks();
  const doneOn = (iso) => tasks.filter((t) => M.taskDoneOn(t, iso));
  const uploadsOn = (iso) => M.liveContents().filter((c) => c.status === 'published' && c.publishedAt && isoOf(c.publishedAt) === iso);
  const days = reviews.map((r) => ({ date: r.id, review: r, done: doneOn(r.id), uploads: uploadsOn(r.id) }));
  const doneCount = tasks.reduce((n, t) => {
    const comps = (t.completions || []).filter((c) => inMonth(isoOf(c.at))).length;
    const single = t.completedAt && inMonth(isoOf(t.completedAt)) && !(t.completions || []).some((c) => c.at === t.completedAt) ? 1 : 0;
    return n + comps + single;
  }, 0);
  const uploads = M.liveContents().filter((c) => c.status === 'published' && c.publishedAt && inMonth(isoOf(c.publishedAt))).length;
  const en = reviews.filter((r) => r.energy).map((r) => r.energy);
  const avgEnergy = en.length ? en.reduce((a, b) => a + b, 0) / en.length : 0;
  const habits = M.habitsForMonth(ym).map((h) => ({ h, r: M.habitMonth(h, ym) })).filter((x) => x.r.counted > 0 || x.r.done > 0);
  const habitPct = habits.length ? Math.round(habits.reduce((n, x) => n + x.r.pct, 0) / habits.length) : 0;
  return { ym, days, doneCount, uploads, avgEnergy, habits, habitPct };
}

export async function buildMonthlyPdf(ym) {
  const jsPDF = await loadJsPdf();
  const d = monthData(ym);
  const [y, m] = ym.split('-').map(Number);
  const title = `${MONTHS[m - 1]} ${y}`;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, L = 20, R = W - 20, TW = R - L, BOTTOM = H - 18;
  const ACCENT = [47, 107, 255], INK = [20, 22, 28], MUTED = [116, 130, 151], LINE = [227, 231, 238];
  let yy = 0;
  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(`Daily Review · ${title}`, L, H - 10); doc.text(`${i} / ${n}`, R, H - 10, { align: 'right' });
    }
  };
  const need = (h) => { if (yy + h > BOTTOM) { doc.addPage(); yy = 22; } };
  const para = (text, size = 10.5, color = INK, style = 'normal', indent = 0) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text).replace(/\r/g, ''), TW - indent);
    const lh = size * 0.42;
    for (const ln of lines) { need(lh + 1); doc.text(ln, L + indent, yy); yy += lh; }
  };

  // Cover header
  yy = 26;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ACCENT); doc.text('DAILY REVIEW', L, yy);
  yy += 11; doc.setFont('times', 'normal'); doc.setFontSize(30); doc.setTextColor(...INK); doc.text(title, L, yy);
  yy += 9;
  const stats = [`${d.days.length} day${d.days.length === 1 ? '' : 's'} reviewed`, `${d.doneCount} task${d.doneCount === 1 ? '' : 's'} done`, `${d.uploads} upload${d.uploads === 1 ? '' : 's'}`];
  if (d.avgEnergy) stats.push(`average energy ${ENERGY[Math.round(d.avgEnergy) - 1]}`);
  if (d.habits.length) stats.push(`habits ${d.habitPct}% consistent`);
  para(stats.join('  ·  '), 10, MUTED);
  yy += 4; doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(L, yy, R, yy); yy += 9;

  // Habits: one row per habit with a square for every day of the month
  if (d.habits.length) {
    const plain = (t) => String(t || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').replace(/\s+/g, ' ').trim();
    need(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text('HABITS', L, yy); yy += 6;
    for (const { h, r } of d.habits) {
      need(17);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(plain(h.title) || 'Habit', TW * 0.55)[0], L, yy);
      const sum = r.weekly ? `${r.met} of ${r.weeks.length} weeks hit ${r.target}x · ${r.done} check-ins` : `${r.done} of ${r.counted} days` + (r.best > 1 ? ` · best run ${r.best} days` : '');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text(sum, R - 13, yy, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...(r.pct >= 80 ? [31, 157, 87] : INK));
      doc.text(r.pct + '%', R, yy, { align: 'right' });
      yy += 3;
      const n = r.days.length, step = TW / n, sz = Math.min(4.6, step - 0.9);
      r.days.forEach((day, i) => {
        const x = L + i * step;
        const on = r.set.has(day), off = day > r.to || day < r.from;
        if (on) { doc.setFillColor(...ACCENT); doc.roundedRect(x, yy, sz, sz, 0.9, 0.9, 'F'); }
        else if (off) { doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.roundedRect(x, yy, sz, sz, 0.9, 0.9, 'S'); }
        else { doc.setFillColor(...LINE); doc.roundedRect(x, yy, sz, sz, 0.9, 0.9, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.setTextColor(...MUTED);
        doc.text(String(i + 1), x + sz / 2, yy + sz + 2.6, { align: 'center' });
      });
      yy += sz + 8;
    }
    yy += 1; doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(L, yy, R, yy); yy += 9;
  }

  if (!d.days.length) para('No daily reviews were written this month.', 11, MUTED);

  for (const day of d.days) {
    const r = day.review;
    need(22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...INK); doc.text(dayTitle(day.date), L, yy);
    if (r.energy) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...ACCENT); doc.text('Energy: ' + ENERGY[r.energy - 1], R, yy, { align: 'right' }); }
    yy += 7;
    const section = (label, body) => {
      if (!body || !String(body).trim()) return;
      need(10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(label.toUpperCase(), L, yy); yy += 4.6;
      para(body, 10.5, INK);
      yy += 2.6;
    };
    const doneList = [...day.done.map((t) => '•  ' + t.title), ...day.uploads.map((c) => '•  Uploaded: ' + c.title)].join('\n');
    section('How was today?', r.journal);
    section('Done', doneList);
    section('Wins', r.wins);
    section('Left unfinished', r.unfinishedNote);
    section('Blockers', r.blockers);
    section('Lesson', r.lesson);
    yy += 2; need(6); doc.setDrawColor(...LINE); doc.line(L, yy, R, yy); yy += 8;
  }
  footer();
  const dataUri = doc.output('datauristring');
  return { blob: doc.output('blob'), base64: dataUri.slice(dataUri.indexOf(',') + 1), name: `Daily Review - ${title}.pdf` };
}
