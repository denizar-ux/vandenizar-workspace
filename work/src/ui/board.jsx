import { useEffect, useRef, useState } from 'preact/hooks';
import { navigate } from '../lib/router.js';
import { toast } from './overlay.jsx';
import { StagePill, stageMenu } from './parts.jsx';
import * as M from '../lib/model.js';
import { COLUMNS, columnOf, stageForColumn, boardColumns } from '../combined/board.js';

// Kanban for projects. Drag a card to another column: hold it (touch) or just drag it (mouse).
// Tapping the stage pill picks an exact stage instead, which also works without dragging.
export function ProjectBoard({ projects, onNew }) {
  const { cols, doneShown, doneMore } = boardColumns(projects);
  const [over, setOver] = useState(null);
  const boardRef = useRef(null);
  const move = (p, col) => {
    const prev = p.stage, next = stageForColumn(p, col);
    if (next === prev) return;
    M.setStage(p.id, next);
    toast(p.name + ' → ' + COLUMNS.find((c) => c.id === col).label, { action: { label: 'Undo', run: () => M.setStage(p.id, prev) } });
  };
  return (
    <div class="board" ref={boardRef}>
      {COLUMNS.map((c) => {
        const list = c.id === 'done' ? doneShown : cols[c.id];
        return (
          <section key={c.id} class={'board-col' + (over === c.id ? ' over' : '')} data-col={c.id}>
            <header class="board-head"><span class={'board-dot t-' + c.tone} aria-hidden="true" />{c.label}<span class="count">{cols[c.id].length}</span></header>
            <div class="board-list">
              {list.map((p) => <BoardCard key={p.id} p={p} boardRef={boardRef} setOver={setOver} onDrop={move} />)}
              {!list.length && <div class="board-empty">{c.id === 'todo' ? <button type="button" class="btn sm soft" onClick={onNew}>+ Project</button> : 'Kosong'}</div>}
              {c.id === 'done' && doneMore > 0 && <div class="board-empty">+{doneMore} lainnya di Completed</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const HOLD_MS = 260, SLOP = 8;

function BoardCard({ p, boardRef, setOver, onDrop }) {
  const ref = useRef(null);
  const st = useRef(null); // { x, y, timer, dragging, ghost, col, pointerId }
  const c = M.projectCategory(p);
  const { done, total } = M.projectProgress(p);
  const when = M.projectDate(p);

  const pr = useRef(null);
  pr.current = { p, setOver, onDrop, boardRef };
  const h = useRef(null);
  if (!h.current) h.current = (() => {
  const colAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.closest('[data-col]') ? el.closest('[data-col]').dataset.col : null;
  };
  const begin = () => {
    const s = st.current; if (!s) return;
    s.dragging = true;
    const r = ref.current.getBoundingClientRect();
    const g = ref.current.cloneNode(true);
    g.classList.add('board-ghost');
    Object.assign(g.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
    s.dx = s.x - r.left; s.dy = s.y - r.top;
    document.body.appendChild(g);
    s.ghost = g;
    ref.current.classList.add('lifting');
    if (navigator.vibrate) navigator.vibrate(10);
    s.col = columnOf(pr.current.p); pr.current.setOver(s.col);
  };
  const end = (drop) => {
    const s = st.current; st.current = null;
    if (!s) return;
    clearTimeout(s.timer); cancelAnimationFrame(s.raf);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel);
    if (s.ghost) s.ghost.remove();
    ref.current && ref.current.classList.remove('lifting');
    pr.current.setOver(null);
    if (s.dragging) { if (drop && s.col) pr.current.onDrop(pr.current.p, s.col); s.suppressClick = true; ref.current && (ref.current._suppress = Date.now()); }
  };
  const autoScroll = () => {
    const s = st.current; if (!s || !s.dragging) return;
    const b = pr.current.boardRef.current; if (b) {
      const r = b.getBoundingClientRect(), edge = 40;
      if (s.cx < r.left + edge) b.scrollLeft -= 12; else if (s.cx > r.right - edge) b.scrollLeft += 12;
    }
    s.raf = requestAnimationFrame(autoScroll);
  };
  function onMove(e) {
    const s = st.current; if (!s || e.pointerId !== s.pointerId) return;
    s.cx = e.clientX; s.cy = e.clientY;
    if (!s.dragging) {
      const far = Math.abs(e.clientX - s.x) > SLOP || Math.abs(e.clientY - s.y) > SLOP;
      if (far) { if (s.touch) return end(false); begin(); s.raf = requestAnimationFrame(autoScroll); }
      else return;
    }
    s.ghost.style.transform = 'translate(' + (e.clientX - s.dx - parseFloat(s.ghost.style.left)) + 'px,' + (e.clientY - s.dy - parseFloat(s.ghost.style.top)) + 'px) rotate(2deg)';
    const col = colAt(e.clientX, e.clientY);
    if (col && col !== s.col) { s.col = col; pr.current.setOver(col); }
  }
  function onUp() { end(true); }
  function onCancel() { end(false); }
  const down = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const touch = e.pointerType !== 'mouse';
    st.current = { x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, touch, pointerId: e.pointerId, dragging: false };
    if (touch) st.current.timer = setTimeout(() => { if (st.current && !st.current.dragging) { begin(); st.current.raf = requestAnimationFrame(autoScroll); } }, HOLD_MS);
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
  };
    return { down, end };
  })();
  const { down, end } = h.current;
  // While dragging on touch, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = ref.current;
    const tm = (e) => { if (st.current && st.current.dragging) e.preventDefault(); };
    el.addEventListener('touchmove', tm, { passive: false });
    return () => { el.removeEventListener('touchmove', tm); end(false); };
  }, []);
  const open = (e) => {
    if (ref.current._suppress && Date.now() - ref.current._suppress < 400) { e.preventDefault(); return; }
    navigate('/projects/' + p.id);
  };
  return (
    <div ref={ref} class="board-card" style={{ '--tint': 'var(--' + c.color + ')' }} onPointerDown={down} onClick={open} onContextMenu={(e) => e.preventDefault()} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(e)}>
      <span class="board-name">{p.name || 'Untitled project'}</span>
      {(when || M.projectStageLabel(p) !== COLUMNS.find((x) => x.id === columnOf(p)).label) && <span class="board-meta">
        {M.projectStageLabel(p) !== COLUMNS.find((x) => x.id === columnOf(p)).label && <button type="button" class="board-stage" aria-label={'Stage: ' + M.projectStageLabel(p)} onClick={(e) => { e.stopPropagation(); stageMenu(e, p); }}><StagePill stage={p.stage} p={p} size="sm" /></button>}
        {when && <span class="board-when">{when.label} {fmtD(when.date)}</span>}
      </span>}
      {total > 0 && <span class="board-bar" role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="Tasks done"><i><span style={{ width: Math.round(done / total * 100) + '%' }} /></i><b class="tnum">{done}/{total}</b></span>}
    </div>
  );
}
const fmtD = (iso) => { const d = new Date(iso + 'T00:00:00'); return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()]; };
