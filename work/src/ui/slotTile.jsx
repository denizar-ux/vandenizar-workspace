// Content pieces shared by the Instagram page and Today: post stage pill, slot tile, next-step button.
import { Icon } from './Icon.jsx';
import { toast } from './overlay.jsx';
import { navigate } from '../lib/router.js';
import { today, addDays } from '../lib/date.js';
import { fmtDay, WEEKDAYS_S } from '../content/time.js';
import * as C from '../content/model.js';

const STAGE_TONE = { idea: 'plain', script: 'butter', film: 'cyan', edit: 'lavender', ready: 'peach', done: 'sage' };

export function PostStagePill({ stage }) {
  return <span class={'pill sm stage-sm t-' + STAGE_TONE[stage || 'idea']}>{C.stageOf(stage).label}</span>;
}

/** Plan a new post in a slot of a week and open it. */
export function planSlot(week, slot) {
  const p = C.createPost({ title: '', week, slot });
  navigate('/post/' + p.id);
}

/** Move a post one stage on, with an Undo toast that names the new stage. */
export function advanceWithToast(id) {
  const before = (C.igItems().find((i) => i.id === id) || {}).stage || 'idea';
  const now = C.advance(id);
  if (!now) return;
  toast(now === 'done' ? 'Posted' : 'Moved to ' + C.stageOf(now).label, { action: { label: 'Undo', run: () => C.setStage(id, before) } });
}

export function SlotTile({ week, slot }) {
  const it = C.slotItem(week, slot.id);
  const date = addDays(week, slot.day);
  const past = date < today();
  const title = it && (C.firstLine(it.title) || 'Untitled post');
  const body = (
    <>
      <span class="st-top"><span class="st-name">{slot.name}</span><span class="st-day tnum">{WEEKDAYS_S[slot.day]}</span></span>
      {it
        ? <span class="st-title">{title}</span>
        : <span class="st-title st-empty">{past ? 'Nothing posted' : 'Plan a post'}</span>}
      <span class="st-foot">
        {it ? <PostStagePill stage={it.stage} /> : !past && <span class="st-add" aria-hidden="true"><Icon name="plus" size={16} stroke={2} /></span>}
      </span>
    </>
  );
  if (it) return <a class={'slot-tile t-' + slot.tint} href={'#/post/' + it.id}>{body}</a>;
  if (past) return <div class={'slot-tile past t-' + slot.tint}>{body}</div>;
  return <button type="button" class={'slot-tile t-' + slot.tint} aria-label={'Plan ' + slot.name + ', ' + fmtDay(date)} onClick={() => planSlot(week, slot.id)}>{body}</button>;
}

export function NextButton({ it, size = 'xs' }) {
  const st = C.stageOf(it.stage);
  if (!st.next) return null;
  return <button type="button" class={'btn primary ' + size} onClick={() => advanceWithToast(it.id)}>{st.next}<Icon name="arrowRight" size={14} /></button>;
}
