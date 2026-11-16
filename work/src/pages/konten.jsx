import { useState } from 'preact/hooks';
import { openOverlay, SheetHead, SheetBody, toast } from '../ui/overlay.jsx';
import { Field, DateInput } from '../ui/kit.jsx';
import { navigate } from '../lib/router.js';
import { today, addDays, fmtDay } from '../lib/date.js';
import { createKonten, planKonten, KONTEN_STEPS } from '../combined/konten.js';

export function openKontenSheet() { openOverlay((close) => <KontenSheet close={close} />, { kind: 'sheet' }); }

function KontenSheet({ close }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(addDays(today(), 7));
  const plan = date ? planKonten(date) : null;
  const make = () => {
    if (!title.trim()) { toast('Tulis judul kontennya dulu.', { tone: 'warn' }); return; }
    if (!date) { toast('Pilih tanggal posting.', { tone: 'warn' }); return; }
    const p = createKonten({ title, postDate: date });
    close();
    toast('Project Konten dibuat', { action: { label: 'Buka', run: () => navigate('/projects/' + p.id) } });
  };
  return (
    <>
      <SheetHead title="Konten baru" onClose={close} />
      <SheetBody>
        <div class="form">
          <input class="qa-title" id="kn-title" value={title} placeholder="Judul konten" aria-label="Judul konten" autoFocus enterKeyHint="done"
            onInput={(e) => setTitle(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); make(); } }} />
          <Field label="Tanggal posting"><DateInput id="kn-date" value={date} clearable={false} onChange={setDate} /></Field>
          {plan && (
            <div class="quiet-note">
              {KONTEN_STEPS.map((st) => st.title + ' ' + fmtDay(plan[st.key]) + (st.key === 'post' ? ' 19:00' : '')).join(' · ')}
            </div>
          )}
          <div class="qa-actions"><button class="btn soft grow" onClick={close}>Batal</button><button class="btn primary grow" onClick={make}>Buat</button></div>
        </div>
      </SheetBody>
    </>
  );
}
