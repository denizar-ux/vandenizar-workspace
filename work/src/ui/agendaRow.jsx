// One row for any agenda item: check, area dot, title, sub-line, quick actions (spec section 6, Row design).
import { Icon } from './Icon.jsx';
import { Check } from './kit.jsx';
import { toast } from './overlay.jsx';
import { navigate } from '../lib/router.js';
import { get } from '../lib/db.js';
import * as M from '../lib/model.js';
import * as C from '../content/model.js';
import { openEventSheet } from '../pages/events.jsx';

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text || '');
    toast(okMsg);
  } catch {
    toast('Copy failed');
  }
}

/** Where tapping the row body goes. */
export function openItem(item) {
  const { coll, id } = item.ref;
  if (item.kind === 'event') openEventSheet(id);
  else if (coll === 'pmTasks') navigate('/tasks/' + id);
  else if (coll === 'pmProjects') navigate('/projects/' + id);
  else if (item.kind === 'thread') navigate('/content/threads');
  else navigate('/post/' + id);
}

/** Run the check for an item and show the toast with Undo. */
export function checkItem(item) {
  const { id } = item.ref;
  if (item.kind === 'task') {
    M.completeTask(id);
    toast('Task done', { action: { label: 'Undo', run: () => M.reopenTask(id) } });
  } else if (item.kind === 'ctask') {
    const prev = C.completeTask(id, C.taskOf(item.ref.task));
    const now = (get('cItems', id) || {}).stage;
    toast(now === 'done' ? 'Posted' : 'Moved to ' + C.stageOf(now).label, { action: { label: 'Undo', run: () => prev && C.setStage(id, prev) } });
  } else if (item.kind === 'post') {
    const prev = (get('cItems', id) || {}).stage || 'idea';
    C.setStage(id, 'done');
    toast('Marked as posted', { action: { label: 'Undo', run: () => C.setStage(id, prev) } });
  } else if (item.kind === 'thread') {
    C.markPosted(id, true);
    toast('Thread posted', { action: { label: 'Undo', run: () => C.markPosted(id, false) } });
  } else if (item.kind === 'follow') openItem(item);
}

function runAction(item, a) {
  const it = get('cItems', item.ref.id) || {};
  if (a === 'copyCaption') copyText(it.caption, 'Caption copied');
  else if (a === 'copy') copyText(it.text, 'Copied');
  else if (a === 'openVideo') { if (it.finalUrl) window.open(C.normalizeUrl(it.finalUrl) || it.finalUrl, '_blank', 'noopener'); }
  else if (a === 'openPost') navigate('/post/' + item.ref.id);
}

const ACTIONS = {
  copyCaption: { label: 'Copy caption', icon: 'copy' },
  copy: { label: 'Copy', icon: 'copy' },
  openVideo: { label: 'Open video', icon: 'external' },
  openPost: { label: 'Open post', icon: 'chevronRight' },
};

export function AgendaRow({ item }) {
  const hasCheck = item.kind !== 'event';
  return (
    <div class={'prow agenda-row ar-' + item.kind}>
      {item.kind === 'follow'
        ? <button type="button" class="ar-chev" aria-label="Open project" onClick={() => openItem(item)}><Icon name="chevronRight" size={15} stroke={2.2} /></button>
        : hasCheck
        ? <Check checked={false} onChange={() => checkItem(item)} label={'Complete ' + item.title} />
        : <span class="ar-ev" aria-hidden="true"><Icon name="clock" size={16} /></span>}
      <span class="ar-dot" style={{ background: 'var(--' + item.area.color + ')' }} title={item.area.name} aria-label={item.area.name} role="img" />
      <div class="prow-main ar-main">
        <button type="button" class="ar-body" onClick={() => openItem(item)}>
          {item.time && <span class="prow-tag tnum">{item.time}</span>}
          <span class="prow-title">{item.title}</span>
          {item.sub && <span class={'prow-sub' + (item.tone === 'bad' ? ' bad' : '')}>{item.sub}</span>}
        </button>
        {item.actions.length > 0 && (
          <span class="ar-actions">
            {item.actions.map((a) => (
              <button key={a} type="button" class="chip-btn" onClick={() => runAction(item, a)}>
                <Icon name={ACTIONS[a].icon} size={14} />{ACTIONS[a].label}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
