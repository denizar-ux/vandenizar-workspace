// Pointer-based drag and drop for lists, kanban columns and calendar cells.
// Mouse: press and move 6px. Touch: press and hold ~300ms, then drag (normal swipes still scroll).
// Drop targets: elements with data-drop="<key>". Sortable items inside them: data-drag-id="<id>".
let state = null;
let suppressClickUntil = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => { if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener('touchmove', (e) => { if (state && state.active) e.preventDefault(); }, { passive: false });
  window.addEventListener('contextmenu', (e) => { if (state) e.preventDefault(); });
}

export function dragHandlers(id, onDrop, opts = {}) {
  return {
    'data-drag-id': id,
    onPointerDown: (e) => begin(e, id, onDrop, opts),
  };
}

function begin(e, id, onDrop, opts) {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (e.target.closest('input, textarea, select, button:not([data-drag-ok]), a, [contenteditable="true"], [data-no-drag]')) return;
  const el = e.currentTarget;
  const isTouch = e.pointerType !== 'mouse';
  const fromHandle = !!e.target.closest('[data-drag-handle]');
  state = { id, el, onDrop, opts, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, pointerId: e.pointerId, isTouch, timer: null };
  if (isTouch) {
    if (fromHandle) activate();
    else state.timer = setTimeout(() => { if (state && !state.active) activate(); }, 300);
  }
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', cancel);
}

function activate() {
  const s = state;
  s.active = true;
  const r = s.el.getBoundingClientRect();
  s.dx = s.x - r.left; s.dy = s.y - r.top;
  const g = s.el.cloneNode(true);
  g.classList.add('drag-ghost');
  Object.assign(g.style, { position: 'fixed', left: '0', top: '0', width: r.width + 'px', height: r.height + 'px', margin: '0', pointerEvents: 'none', zIndex: '9999', transform: `translate(${r.left}px, ${r.top}px)` });
  document.body.appendChild(g);
  s.ghost = g;
  s.el.classList.add('drag-source');
  const ind = document.createElement('div');
  ind.className = 'drop-indicator';
  document.body.appendChild(ind);
  s.ind = ind;
  document.body.classList.add('is-dragging');
  try { navigator.vibrate && navigator.vibrate(10); } catch {}
  loop();
  position();
}

function move(e) {
  if (!state || e.pointerId !== state.pointerId) return;
  state.x = e.clientX; state.y = e.clientY;
  if (!state.active) {
    const dist = Math.hypot(state.x - state.x0, state.y - state.y0);
    if (state.isTouch) { if (dist > 8) cancel(); return; } // finger moved before hold: let it scroll
    if (dist > 6) activate(); else return;
  }
  e.preventDefault();
  position();
}

function target() {
  const s = state;
  const under = document.elementFromPoint(s.x, s.y);
  let box = under && under.closest('[data-drop]');
  if (box && s.opts.accept && !s.opts.accept(box.dataset.drop)) box = null;
  if (!box) {
    // Forgiving targeting: accept a list the finger is just above or below (e.g. dropping after the last card).
    let best = null, bestD = 56;
    for (const n of document.querySelectorAll('[data-drop]')) {
      if (s.opts.accept && !s.opts.accept(n.dataset.drop)) continue;
      const r = n.getBoundingClientRect();
      if (s.x < r.left - 24 || s.x > r.right + 24) continue;
      const d = s.y < r.top ? r.top - s.y : s.y > r.bottom ? s.y - r.bottom : 0;
      if (d < bestD) { bestD = d; best = n; }
    }
    box = best;
  }
  if (!box) return null;
  const items = [...box.querySelectorAll('[data-drag-id]')].filter((n) => n !== s.el && n.closest('[data-drop]') === box && !n.classList.contains('drag-ghost'));
  const horizontal = box.dataset.dropAxis === 'x';
  let index = items.length;
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (horizontal ? s.x < r.left + r.width / 2 : s.y < r.top + r.height / 2) { index = i; break; }
  }
  return { box, key: box.dataset.drop, index, items, horizontal };
}

function position() {
  const s = state;
  if (!s || !s.ghost) return;
  s.ghost.style.transform = `translate(${s.x - s.dx}px, ${s.y - s.dy}px) rotate(1.5deg)`;
  const t = target();
  s.t = t;
  document.querySelectorAll('.drop-over').forEach((n) => n.classList.remove('drop-over'));
  if (!t) { s.ind.style.display = 'none'; return; }
  t.box.classList.add('drop-over');
  if (t.box.dataset.dropMode === 'cell') { s.ind.style.display = 'none'; return; }
  const br = t.box.getBoundingClientRect();
  let y;
  if (t.items.length === 0) y = br.top + 8;
  else if (t.index < t.items.length) y = t.items[t.index].getBoundingClientRect().top - 5;
  else y = t.items[t.items.length - 1].getBoundingClientRect().bottom + 3;
  Object.assign(s.ind.style, { display: 'block', left: br.left + 8 + 'px', width: br.width - 16 + 'px', top: y + 'px' });
}

function loop() {
  if (!state || !state.active) return;
  const s = state;
  const edge = 70, vh = window.innerHeight, vw = window.innerWidth;
  let dy = 0;
  if (s.y < edge) dy = -Math.ceil((edge - s.y) / 5);
  else if (s.y > vh - edge) dy = Math.ceil((s.y - (vh - edge)) / 5);
  const under = document.elementFromPoint(s.x, s.y);
  let scroller = under && under.closest('[data-scroll-x]');
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    if (s.x < r.left + edge) scroller.scrollLeft -= Math.ceil((r.left + edge - s.x) / 4);
    else if (s.x > r.right - edge) scroller.scrollLeft += Math.ceil((s.x - (r.right - edge)) / 4);
  } else if (s.x > vw - 30 || s.x < 30) { /* nothing */ }
  const ys = under && under.closest('[data-scroll-y]');
  if (ys && dy) ys.scrollTop += dy;
  else if (dy) window.scrollBy(0, dy);
  if (dy || scroller) position();
  s.raf = requestAnimationFrame(loop);
}

function cleanup() {
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', end);
  window.removeEventListener('pointercancel', cancel);
  if (!state) return;
  clearTimeout(state.timer);
  cancelAnimationFrame(state.raf);
  state.ghost && state.ghost.remove();
  state.ind && state.ind.remove();
  state.el.classList.remove('drag-source');
  document.querySelectorAll('.drop-over').forEach((n) => n.classList.remove('drop-over'));
  document.body.classList.remove('is-dragging');
}
function end() {
  const s = state;
  if (s && s.active) {
    position();
    const t = s.t;
    suppressClickUntil = Date.now() + 350;
    cleanup();
    state = null;
    if (t) {
      const ids = t.items.map((n) => n.dataset.dragId);
      s.onDrop({ id: s.id, to: t.key, index: t.index, before: ids[t.index] || null, after: ids[t.index - 1] || null, ids });
    }
    return;
  }
  cleanup();
  state = null;
}
function cancel() { cleanup(); state = null; }

// Compute an `order` value to place an item between neighbours (fractional ordering keeps writes small).
export function orderBetween(prevOrder, nextOrder) {
  if (prevOrder == null && nextOrder == null) return 0;
  if (prevOrder == null) return nextOrder - 1;
  if (nextOrder == null) return prevOrder + 1;
  return (prevOrder + nextOrder) / 2;
}
// Reorder a plain array: move item with id to index (index counted among the other items)
export function moveInArray(arr, id, index) {
  const item = arr.find((x) => x.id === id);
  if (!item) return arr;
  const rest = arr.filter((x) => x.id !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, item);
  return rest;
}
