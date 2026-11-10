// One agenda for a day: work tasks, events, content steps, posts, Threads and project follow-ups.
import { get } from '../lib/db.js';
import { today, fmtDay, fmtMinutes } from '../lib/date.js';
import {
  liveTasks, isOpen, isPast, projectBilling, eventsOn, liveProjects, sortTasks,
} from '../lib/model.js';
import { tasksOn, overdueTasks, threadsOn, overdueThreads, igItems, cSettings, slotById, formatName, firstLine } from '../content/model.js';
import { areas, areaOfTask, CONTENT_AREA } from './areas.js';

// isOverdue / isBehind read the real clock, so the agenda judges against its own date.
const isLateOn = (t, date) => isOpen(t) && !!t.deadlineDate
  && (t.deadlineDate < date || (t.deadlineDate === date && date === today() && isPast(t.deadlineDate, t.deadlineTime)));
const isBehindOn = (t, date) => isOpen(t) && !!t.workDate && t.workDate < date && !isLateOn(t, date);

const TASK_LABEL = { script: 'Script', film: 'Film', edit: 'Edit', post: 'Post' };
const byTime = (a, b) => (a.time || '').localeCompare(b.time || '');

function taskItem(t, date, sub, extra = {}) {
  const project = t.projectId ? get('pmProjects', t.projectId) : null;
  const parts = [project?.name, t.estimateMinutes ? fmtMinutes(t.estimateMinutes) : null];
  return {
    key: 'task:' + t.id, kind: 'task', area: areaOfTask(t), time: t.workDate === date ? t.workTime || null : null,
    title: t.title, sub: sub != null ? sub : parts.filter(Boolean).join(' · '), ref: { coll: 'pmTasks', id: t.id }, actions: [], tone: undefined, ...extra,
  };
}

function eventItem(e) {
  const project = e.projectId ? get('pmProjects', e.projectId) : null;
  const range = e.allDay ? '' : e.startTime + '-' + e.endTime;
  return {
    key: 'event:' + e.id, kind: 'event', area: areaOfTask({ projectId: project ? project.id : null }), time: e.allDay ? null : e.startTime,
    title: e.title, sub: [range, e.location].filter(Boolean).join(' · '), ref: { coll: 'pmEvents', id: e.id }, actions: [], tone: undefined,
  };
}

function ctaskItem(d) {
  const { it, task } = d;
  const slot = slotById(it.slot);
  return {
    key: 'ctask:' + it.id + ':' + task.key, kind: 'ctask', area: CONTENT_AREA, time: null,
    title: (TASK_LABEL[task.key] || task.label) + ': ' + it.title, sub: slot ? slot.name || '' : '',
    ref: { coll: 'cItems', id: it.id, task: task.key }, actions: ['openPost'], tone: undefined,
  };
}

function postItem(it) {
  const slot = slotById(it.slot);
  const actions = ['copyCaption'];
  if (it.finalUrl) actions.push('openVideo');
  return {
    key: 'post:' + it.id, kind: 'post', area: CONTENT_AREA, time: cSettings().notify?.postTime || '19:00',
    title: 'Post: ' + it.title, sub: [slot?.name, formatName(it.format)].filter(Boolean).join(' · '),
    ref: { coll: 'cItems', id: it.id }, actions, tone: undefined,
  };
}

function threadItem(it) {
  return {
    key: 'thread:' + it.id, kind: 'thread', area: CONTENT_AREA, time: it.time || null,
    title: firstLine(it.text), sub: 'Threads', ref: { coll: 'cItems', id: it.id }, actions: ['copy'], tone: undefined,
  };
}

function followItem(p, clientName) {
  return {
    key: 'follow:' + p.id, kind: 'follow', area: areaOfTask({ projectId: p.id }), time: null,
    title: 'Follow up: ' + p.name, sub: clientName, ref: { coll: 'pmProjects', id: p.id }, actions: [], tone: undefined,
  };
}

export function buildAgenda({ date, filter = 'all' }) {
  const allDay = [], scheduled = [], anytime = [], late = [];
  const anyWork = [], anyContent = [], anyFollow = [], lateWork = [], lateContent = [];

  // Work tasks, each in exactly one bucket.
  for (const t of sortTasks(liveTasks().filter(isOpen), 'deadline')) {
    const project = t.projectId ? get('pmProjects', t.projectId) : null;
    if (isLateOn(t, date)) {
      if (project && projectBilling(project) && t.workDate && t.workDate >= date) anyWork.push(taskItem(t, date, 'Client deadline passed', { tone: 'bad' }));
      else lateWork.push(taskItem(t, date, ['Deadline passed', project?.name].filter(Boolean).join(' · ')));
    } else if (t.workDate === date) (t.workTime ? scheduled : anyWork).push(taskItem(t, date));
    else if (isBehindOn(t, date)) anyWork.push(taskItem(t, date, 'Planned ' + fmtDay(t.workDate)));
    else if (t.deadlineDate === date && !t.workDate) anyWork.push(taskItem(t, date, ['Deadline today' + (t.deadlineTime ? ' ' + t.deadlineTime : ''), project?.name].filter(Boolean).join(' · ')));
    else if (t.pinnedOn === date) anyWork.push(taskItem(t, date));
  }

  for (const e of eventsOn(date)) (e.allDay ? allDay : scheduled).push(eventItem(e));

  // Content. A post due today is one `post` row, so its post step is not repeated as a ctask.
  const dueToday = igItems().filter((it) => it.date === date && it.stage !== 'done');
  const dueIds = new Set(dueToday.map((it) => it.id));
  for (const it of dueToday) scheduled.push(postItem(it));
  for (const d of tasksOn(date)) {
    if (d.done || (d.task.key === 'post' && dueIds.has(d.it.id))) continue;
    anyContent.push(ctaskItem(d));
  }
  for (const it of threadsOn(date)) {
    if (it.postedAt) continue;
    (it.time ? scheduled : anyContent).push(threadItem(it));
  }
  for (const d of overdueTasks(date)) lateContent.push({ ...ctaskItem(d), sub: 'Was ' + fmtDay(d.date) });
  for (const it of overdueThreads(date)) lateContent.push({ ...threadItem(it), sub: 'Threads · was ' + fmtDay(it.date) });

  for (const p of liveProjects()) {
    if (p.archived || p.stage !== 'client_review' || !p.followUpDate || p.followUpDate > date) continue;
    anyFollow.push(followItem(p, p.clientId ? get('clients', p.clientId)?.name || '' : ''));
  }

  scheduled.sort(byTime);
  anytime.push(...anyWork, ...anyContent, ...anyFollow);
  late.push(...lateWork, ...lateContent);

  const counts = Object.fromEntries(areas().map((a) => [a.id, 0]));
  for (const i of [...allDay, ...scheduled, ...anytime, ...late]) counts[i.area.id] = (counts[i.area.id] || 0) + 1;

  const keep = (i) => filter === 'all' || (filter === 'work' ? i.area.id !== CONTENT_AREA.id : i.area.id === filter);
  return { allDay: allDay.filter(keep), scheduled: scheduled.filter(keep), anytime: anytime.filter(keep), late: late.filter(keep), counts };
}
