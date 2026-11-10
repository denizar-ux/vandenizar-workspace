// Work tab: Projects and Tasks under one header.
import { Icon } from '../ui/Icon.jsx';
import { Segmented } from '../ui/kit.jsx';
import { PageHeader, AddBtn } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { ProjectsPage } from './projects.jsx';
import { TasksPage } from './tasks.jsx';
import { openAddMenu, openSearch } from '../App.jsx';

export function WorkPage({ tab = 'projects', query = {} }) {
  const t = tab === 'tasks' ? 'tasks' : 'projects';
  return (
    <div class="page work-page">
      <PageHeader title="Work." actions={<div class="row gap-8"><button class="icon-btn ghost" aria-label="Search" onClick={() => openSearch()}><Icon name="search" size={22} /></button><AddBtn label="Add" onClick={(e) => openAddMenu(e)} /></div>} />
      <Segmented class="full" options={[{ id: 'projects', label: 'Projects' }, { id: 'tasks', label: 'Tasks' }]} value={t} onChange={(id) => navigate('/work/' + id)} />
      {t === 'tasks' ? <TasksPage query={query} embedded /> : <ProjectsPage query={query} embedded />}
    </div>
  );
}
