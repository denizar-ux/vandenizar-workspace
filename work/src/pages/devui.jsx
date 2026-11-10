// Hidden visual check page for Task 12: #/dev/ui. Removed in Task 21.
import { PageHeader } from '../ui/parts.jsx';
import { BentoCard, ProgressRow, SegBar, ChipCount } from '../ui/polish.jsx';
import { StagePill } from '../ui/parts.jsx';
import * as M from '../lib/model.js';
import { useStore } from '../lib/db.js';

const TINTS = ['butter', 'cyan', 'sage', 'lavender', 'rose', 'peach'];

export function DevUiPage() {
  useStore();
  const projects = M.liveProjects().slice(0, 6);
  return (
    <div class="page narrow dev-ui">
      <PageHeader title="UI." />
      <section class="block"><h2 class="block-title">Bento</h2>
        <div class="dev-grid">{TINTS.map((t, i) => <BentoCard tint={t} icon={['tasks', 'calendar', 'folder', 'image', 'flag', 'clock'][i]} label={t} value={(i + 1) * 7} href="#/dev/ui" />)}</div>
      </section>
      <section class="block"><h2 class="block-title">Progress rows</h2>
        <div class="prog-list">{projects.length ? projects.map((p) => <ProgressRow project={p} />) : <div class="quiet-note">Load sample data in Settings to see rows.</div>}</div>
      </section>
      <section class="block"><h2 class="block-title">Chips with counts</h2>
        <div class="chips"><ChipCount label="Today" count={4} on /><ChipCount label="Upcoming" count={12} /><ChipCount label="Inbox" count={0} /><ChipCount label="Overdue" count={3} /></div>
      </section>
      <section class="block"><h2 class="block-title">Segmented bars</h2>
        <div class="stack" style={{ gap: 10 }}><SegBar done={7} total={10} /><SegBar done={1} total={3} /><SegBar done={14} total={20} /><SegBar done={0} total={5} /><SegBar done={5} total={5} /></div>
      </section>
      <section class="block"><h2 class="block-title">Stage pills</h2>
        <div class="row gap-8 wrap"><StagePill stage="editing" size="sm" /><StagePill stage="client_review" size="sm" /><StagePill stage="completed" size="sm" /><StagePill stage="editing" /></div>
      </section>
    </div>
  );
}
