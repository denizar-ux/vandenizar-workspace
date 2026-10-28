import { useState } from 'preact/hooks';
import { get } from '../lib/db.js';
import * as M from '../lib/model.js';
import { today } from '../lib/date.js';
import { Field, TextInput, TextArea, DateInput, TimeInput, Select, Toggle } from '../ui/kit.jsx';
import { openOverlay, SheetHead, SheetBody, SheetFoot, toast } from '../ui/overlay.jsx';
import { GcalButton } from '../ui/GcalButton.jsx';
export function openEventSheet(id = null, preset = {}) { openOverlay((close) => <EventSheet id={id} preset={preset} close={close} />, { kind: 'sheet' }); }
function EventSheet({ id, preset, close }) {
 const old = id && get('pmEvents', id);
 const [v, setV] = useState(old || { title: '', date: preset.date || today(), startTime: preset.time || '09:00', endTime: preset.time ? String(Math.min(23, +preset.time.slice(0,2)+1)).padStart(2,'0')+':'+preset.time.slice(3) : '10:00', allDay:false, projectId:preset.projectId || '', location:'', notes:'' });
 const set = (ch) => setV({ ...v, ...ch });
 const save = () => { try { M.saveEvent(v); close(); toast('Event saved'); } catch(e) { toast(e.message, { tone:'warn' }); } };
 return <><SheetHead title={old ? 'Edit event' : 'New event'} onClose={close}/><SheetBody><div class="form">
 <Field label="Event name" htmlFor="ev-title"><TextInput id="ev-title" value={v.title} onInput={(title)=>set({title})} autoFocus placeholder="Shoot, meeting, appointment…"/></Field>
 <Field label="Date" htmlFor="ev-date"><DateInput id="ev-date" value={v.date} clearable={false} onChange={(date)=>set({date})}/></Field>
 <div class="toggle-row"><span>All day</span><Toggle label="All day" checked={v.allDay} onChange={(allDay)=>set({allDay})}/></div>
 {!v.allDay && <div class="field-pair"><Field label="Starts" htmlFor="ev-start"><TimeInput id="ev-start" value={v.startTime} onChange={(startTime)=>set({startTime})}/></Field><Field label="Ends" htmlFor="ev-end"><TimeInput id="ev-end" value={v.endTime} onChange={(endTime)=>set({endTime})}/></Field></div>}
 <Field label="Location or meeting link" htmlFor="ev-location"><TextInput id="ev-location" value={v.location} onInput={(location)=>set({location})}/></Field>
 <Field label="Project (optional)" htmlFor="ev-project"><Select id="ev-project" value={v.projectId || ''} onChange={(projectId)=>set({projectId})} placeholder="No project" options={M.liveProjects().filter(p=>!p.archived).map(p=>({id:p.id,label:p.name}))}/></Field>
 <Field label="Notes" htmlFor="ev-notes"><TextArea id="ev-notes" value={v.notes} onInput={(notes)=>set({notes})}/></Field>
 {v.title.trim() && <div><GcalButton event={{ title:v.title.trim(), date:v.date, time:v.allDay?null:v.startTime, endTime:v.allDay?null:v.endTime, location:v.location, details:[M.projectName(v.projectId) && 'Project: '+M.projectName(v.projectId), v.notes].filter(Boolean).join('\n\n') }}/></div>}
 </div></SheetBody><SheetFoot>{old && <button class="btn danger-soft" onClick={()=>{M.trashEvent(id);close();toast('Event removed',{action:{label:'Undo',run:()=>M.restoreEvent(id)}});}}>Remove event</button>}<button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>Save event</button></SheetFoot></>;
}
export function EventRow({event:e}) { return <button class="prow event-row" onClick={()=>openEventSheet(e.id)}><span class="event-symbol">◷</span><span class="prow-main"><span class="prow-tag">{e.allDay ? 'All day' : e.startTime+' – '+e.endTime} · Event</span><span class="prow-title">{e.title}</span><span class="prow-sub">{[M.projectName(e.projectId),e.location].filter(Boolean).join(' · ')}</span></span><span class="muted">Edit</span></button>; }
