// Shared by Today and Tasks: run Replan and tell the user what happened, with one Undo.
import { toast } from './overlay.jsx';
import { replanLate, undoReplan } from '../combined/replan.js';
import { today } from '../lib/date.js';

export const replanMessage = (count) => (count ? 'Moved ' + count + ' item' + (count === 1 ? '' : 's') : 'Nothing to move');

export function runReplan(filter = 'all', date = today()) {
  const { snaps, count } = replanLate(date, filter);
  if (!count) { toast(replanMessage(0)); return; }
  toast(replanMessage(count), { action: { label: 'Undo', run: () => undoReplan(snaps) } });
}
