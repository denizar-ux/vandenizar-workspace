// Visual polish pieces from spec section 10: bento card, project progress row, segmented bar, chip with count.
import { Icon } from './Icon.jsx';
import * as M from '../lib/model.js';
import { projectProgress, segments } from '../combined/areas.js';
import { StagePill } from './parts.jsx';

export function BentoCard({ tint = 'butter', icon, label, value, children, href }) {
  const C = href ? 'a' : 'div';
  return (
    <C class={'bento t-' + tint} href={href || undefined}>
      {icon && <span class="bento-ic" aria-hidden="true"><Icon name={icon} size={18} /></span>}
      <span class="bento-label">{label}</span>
      {value != null && <span class="bento-value tnum">{value}</span>}
      {children}
    </C>
  );
}

export function SegBar({ done, total }) {
  const { filled, count } = segments(done, total);
  if (!count) return null;
  return (
    <span class="segbar" role="img" aria-label={done + ' of ' + total + ' done'}>
      <span class="segbar-bars" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <i class={i < filled ? 'on' : ''} />)}
      </span>
      <span class="segbar-label tnum">{done}/{total}</span>
    </span>
  );
}

export function ProgressRow({ project }) {
  const c = M.projectCategory(project);
  const { done, total } = projectProgress(project);
  const next = M.nextActionTask(project);
  const nextText = project.stage === 'client_review' ? 'Waiting for feedback' : next ? next.title : '';
  const mark = project.emoji || (project.name || '?').trim().charAt(0).toUpperCase() || '?';
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <a class="progrow" href={'#/projects/' + project.id} style={{ '--tint': 'var(--' + c.color + ')' }}>
      <span class={'progrow-ic t-' + c.color} aria-hidden="true">{mark}</span>
      <span class="progrow-main">
        <span class="progrow-name">{project.name || 'Untitled project'}</span>
        <span class="progrow-sub"><StagePill stage={project.stage} p={project} size="sm" />{nextText && <span class="ellipsis">{nextText}</span>}</span>
      </span>
      {total > 0 && (
        <span class="progrow-meter" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Project progress">
          <span class="progrow-count tnum">{done}/{total}</span>
          <span class="progrow-bar"><span style={{ width: pct + '%' }} /></span>
        </span>
      )}
    </a>
  );
}

export function ChipCount({ label, count, on, onClick }) {
  return (
    <button type="button" class={'chip' + (on ? ' on' : '')} aria-pressed={!!on} onClick={onClick}>
      {label}{count > 0 && <span class="chip-count">{count}</span>}
    </button>
  );
}
